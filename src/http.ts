import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { CONSOLE_COMPATIBILITY_VERSION, SERVER_NAME, SERVER_VERSION } from "./constants.js";
import {
  FixedWindowRateLimiter,
  HttpError,
  assertAllowedOrigin,
  getClientIp,
  readJsonBody,
  redactSensitiveText,
  safeBearerMatch,
} from "./http/security.js";
import {
  buildProtectedResourceMetadata,
  buildWwwAuthenticateHeader,
  normalizeAbsoluteUrl,
  verifyConnectorAccessToken,
} from "./http/oauth.js";
import { createServerDependencies, createServerFromDependencies, type ServerDependencies } from "./server.js";

interface AuthContext {
  kind: "static" | "oauth";
  callerId: string;
}

function getPublicOrigin(req: IncomingMessage, fallbackHost: string, fallbackPort: number): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwardedProto === "string" && forwardedProto.trim()
      ? forwardedProto.split(",")[0]!.trim()
      : "http";
  const host = req.headers.host ?? `${fallbackHost}:${fallbackPort}`;
  return `${proto}://${host}`;
}

function getProtectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource`;
}

function authenticateRequest(
  req: IncomingMessage,
  dependencies: ServerDependencies,
  resourceUrl: string
): AuthContext | null {
  if (safeBearerMatch(req.headers.authorization, dependencies.runtimeConfig.apiToken)) {
    const operatorId = req.headers["x-operator-id"];
    return {
      kind: "static",
      callerId: typeof operatorId === "string" && operatorId.trim() ? operatorId.trim() : `ip:${getClientIp(req)}`,
    };
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : undefined;
  const authServerOrigin = dependencies.runtimeConfig.authorizationServerOrigin;
  if (!token || !authServerOrigin || !dependencies.runtimeConfig.apiToken) {
    return null;
  }

  const claims = verifyConnectorAccessToken(token, dependencies.runtimeConfig.apiToken, resourceUrl, authServerOrigin);
  if (!claims) {
    return null;
  }

  return {
    kind: "oauth",
    callerId: claims.sub,
  };
}

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
  rateLimiter: FixedWindowRateLimiter,
  resourceUrl: string
): Promise<void> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let callerId = `ip:${getClientIp(req)}`;
  let authKind: AuthContext["kind"] | "unknown" = "unknown";

  try {
    assertAllowedOrigin(req, dependencies.runtimeConfig.allowedOrigins);

    const authContext = authenticateRequest(req, dependencies, resourceUrl);
    if (!authContext) {
      throw new HttpError(401, "Unauthorized.", "unauthorized");
    }
    callerId = authContext.callerId;
    authKind = authContext.kind;

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
        authKind,
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
        authKind,
      },
    });

    if (statusCode === 401) {
      const resourceOrigin = new URL(resourceUrl).origin;
      res.setHeader("www-authenticate", buildWwwAuthenticateHeader(getProtectedResourceMetadataUrl(resourceOrigin)));
    }

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
      const publicOrigin = getPublicOrigin(req, host, port);
      const requestUrl = new URL(req.url ?? "/", publicOrigin);
      const resourceUrl = normalizeAbsoluteUrl(`${publicOrigin}${path}`) || `${publicOrigin}${path}`;

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

      if (requestUrl.pathname === "/.well-known/oauth-protected-resource") {
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed" });
          return;
        }

        if (!dependencies.runtimeConfig.authorizationServerOrigin) {
          sendJson(res, 404, { error: "Not found" });
          return;
        }

        sendJson(
          res,
          200,
          buildProtectedResourceMetadata(resourceUrl, dependencies.runtimeConfig.authorizationServerOrigin)
        );
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

        await handleProtectedMcpRequest(req, res, dependencies, rateLimiter, resourceUrl);
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
