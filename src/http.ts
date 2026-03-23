import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { CONSOLE_COMPATIBILITY_VERSION, SERVER_NAME, SERVER_VERSION } from "./constants.js";
import {
  FixedWindowRateLimiter,
  HttpError,
  assertAllowedOrigin,
  getCallerId,
  getClientIp,
  readJsonBody,
  redactSensitiveText,
  safeBearerMatch,
} from "./http/security.js";
import { createServerDependencies, createServerFromDependencies, type ServerDependencies } from "./server.js";

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  if (res.headersSent) {
    return;
  }

  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendText(res: ServerResponse, statusCode: number, body: string): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function extractToolName(parsedBody: unknown): string {
  if (!parsedBody || typeof parsedBody !== "object") {
    return "transport";
  }

  const body = parsedBody as {
    method?: string;
    params?: {
      name?: string;
    };
  };

  if (body.method === "tools/call" && typeof body.params?.name === "string") {
    return body.params.name;
  }

  if (typeof body.method === "string") {
    return body.method;
  }

  return "transport";
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ServerDependencies,
  parsedBody: unknown
): Promise<void> {
  const server = createServerFromDependencies(dependencies);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  };

  res.once("close", () => {
    void cleanup();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    console.error(`[${SERVER_NAME}] request error`, error);
    throw error;
  } finally {
    await cleanup();
  }
}

async function recordActivity(
  dependencies: ServerDependencies,
  entry: Parameters<ServerDependencies["store"]["appendActivity"]>[0]
): Promise<void> {
  try {
    await dependencies.store.appendActivity(entry);
  } catch (error) {
    console.error(`[${SERVER_NAME}] activity log failure`, error);
  }
}

async function handleProtectedMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ServerDependencies,
  rateLimiter: FixedWindowRateLimiter
): Promise<void> {
  const requestId = randomUUID();
  const callerId = getCallerId(req);
  const startedAt = Date.now();

  try {
    assertAllowedOrigin(req, dependencies.runtimeConfig.allowedOrigins);

    if (!safeBearerMatch(req.headers.authorization, dependencies.runtimeConfig.apiToken)) {
      throw new HttpError(401, "Unauthorized.", "unauthorized");
    }

    const rateLimit = rateLimiter.take(callerId);
    if (!rateLimit.allowed) {
      res.setHeader("retry-after", String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)));
      throw new HttpError(429, "Rate limit exceeded.", "rate_limited");
    }

    const { parsedBody, bytesRead } = await readJsonBody(req, dependencies.runtimeConfig.requestBodyLimitBytes);
    const toolName = extractToolName(parsedBody);
    await handleMcpRequest(req, res, dependencies, parsedBody);

    await recordActivity(dependencies, {
      requestId,
      timestamp: new Date().toISOString(),
      toolName,
      outcome: "success",
      durationMs: Date.now() - startedAt,
      callerId,
      transport: "http",
      metadata: {
        bytesRead,
        clientIp: getClientIp(req),
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message =
      error instanceof HttpError ? error.message : error instanceof Error ? error.message : "Internal server error";
    const code =
      error instanceof HttpError
        ? error.code
        : "internal_error";
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    const parsedToolName = statusCode === 401 ? "transport" : "transport";

    await recordActivity(dependencies, {
      requestId,
      timestamp: new Date().toISOString(),
      toolName: parsedToolName,
      outcome:
        code === "unauthorized"
          ? "unauthorized"
          : code === "rate_limited"
            ? "rate_limited"
            : code === "invalid_json" || code === "body_too_large" || code === "origin_not_allowed"
              ? "bad_request"
              : "error",
      durationMs,
      callerId,
      transport: "http",
      errorMessage: redactSensitiveText(message),
      metadata: {
        clientIp: getClientIp(req),
        statusCode,
      },
    });

    if (!res.headersSent) {
      sendJson(
        res,
        statusCode,
        statusCode >= 500
          ? {
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal server error",
              },
              id: null,
            }
          : {
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message,
              },
              id: null,
            }
      );
    }
  }
}

async function main(): Promise<void> {
  const dependencies = createServerDependencies(import.meta.url);
  const { host, port, path } = dependencies.runtimeConfig;
  const rateLimiter = new FixedWindowRateLimiter(
    dependencies.runtimeConfig.rateLimitMaxRequests,
    dependencies.runtimeConfig.rateLimitWindowMs
  );

  if (dependencies.runtimeConfig.transport !== "http") {
    throw new Error("src/http.ts requires MCP_TRANSPORT=http.");
  }

  const server = http.createServer((req, res) => {
    void (async () => {
      const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);

      if (requestUrl.pathname === "/") {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        sendText(res, 200, `${SERVER_NAME} ${SERVER_VERSION} (${dependencies.runtimeConfig.transport})`);
        return;
      }

      if (requestUrl.pathname === "/health") {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        sendJson(res, 200, {
          status: "ok",
          name: SERVER_NAME,
          version: SERVER_VERSION,
          transport: "http",
          path,
          authMode: dependencies.runtimeConfig.authMode,
          consoleCompatibilityVersion: CONSOLE_COMPATIBILITY_VERSION,
        });
        return;
      }

      if (requestUrl.pathname === "/activity") {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        try {
          if (!safeBearerMatch(req.headers.authorization, dependencies.runtimeConfig.apiToken)) {
            throw new HttpError(401, "Unauthorized.", "unauthorized");
          }

          sendJson(res, 200, {
            activity: await dependencies.store.listRecentActivity(
              Number(requestUrl.searchParams.get("limit") || "25")
            ),
          });
        } catch (error) {
          const statusCode = error instanceof HttpError ? error.statusCode : 500;
          sendJson(res, statusCode, {
            error: error instanceof HttpError ? error.message : "Internal server error",
          });
        }

        return;
      }

      if (requestUrl.pathname === path) {
        if (req.method !== "POST") {
          sendJson(res, 405, {
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Method not allowed.",
            },
            id: null,
          });
          return;
        }

        await handleProtectedMcpRequest(req, res, dependencies, rateLimiter);
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    })().catch((error) => {
      console.error(`[${SERVER_NAME}] unhandled request error`, error);
      sendJson(res, 500, { error: "Internal server error" });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`[${SERVER_NAME}] listening on http://${host}:${port}${path}`);

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error(`[${SERVER_NAME}] shutdown error`, error);
        process.exitCode = 1;
      }
      process.exit();
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] fatal error`, error);
  process.exitCode = 1;
});
