import http, { type IncomingMessage, type ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createServerDependencies, createServerFromDependencies, type ServerDependencies } from "./server.js";

const SERVER_NAME = "masa-orchestration";
const SERVER_VERSION = "1.1.0";

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

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ServerDependencies
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
    await transport.handleRequest(req, res);
  } catch (error) {
    await cleanup();
    console.error(`[${SERVER_NAME}] request error`, error);

    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
}

async function main(): Promise<void> {
  const dependencies = createServerDependencies(import.meta.url);
  const { host, port, path } = dependencies.runtimeConfig;

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
        });
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

        await handleMcpRequest(req, res, dependencies);
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
