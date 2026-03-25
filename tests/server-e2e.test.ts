import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";

const tempDirs: string[] = [];
const childProcesses: ChildProcess[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function makeWorkspace() {
  const workspace = makeTempDir("masa-mcp-");
  const auditRoot = path.join(workspace, "Agentic-Spec-Driven-Audit");
  const engineRoot = path.join(workspace, "synthesis-engine", "src");
  fs.mkdirSync(auditRoot, { recursive: true });
  fs.mkdirSync(engineRoot, { recursive: true });

  return { workspace, auditRoot, engineRoot };
}

function taskHeaderInput() {
  return {
    taskId: "TASK-001",
    taskType: "Implementation",
    category: "forward solver",
    specMapping: "Causal Engine v1.0 / Section 7",
    coreOrNonCore: "Core",
    formalArtifactExpected: "forwardSolve",
    benchmarkImpact: "B1-B6",
    claimBoundary: "No route integration.",
  };
}

const HTTP_API_TOKEN = "masa-http-test-token";

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate port"));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, stderrBuffer: string[]): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 15000) {
    if (child.exitCode !== null) {
      throw new Error(`HTTP server exited early: ${stderrBuffer.join("")}`);
    }

    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the process is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`HTTP server did not become healthy: ${stderrBuffer.join("")}`);
}

async function startHttpServer(workspace: ReturnType<typeof makeWorkspace>, overrides?: Record<string, string>) {
  const port = await getFreePort();
  const stderrBuffer: string[] = [];
  const stdoutBuffer: string[] = [];
  const child = spawn(
    process.execPath,
    ["--import", "tsx", path.join(process.cwd(), "src/http.ts")],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUDIT_ROOT: workspace.auditRoot,
        ENGINE_ROOT: workspace.engineRoot,
        MCP_TRANSPORT: "http",
        MCP_HOST: "127.0.0.1",
        MCP_PORT: String(port),
        ORCHESTRATOR_API_TOKEN: HTTP_API_TOKEN,
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  childProcesses.push(child);
  child.stdout?.on("data", (chunk) => stdoutBuffer.push(String(chunk)));
  child.stderr?.on("data", (chunk) => stderrBuffer.push(String(chunk)));

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, child, stderrBuffer);

  return {
    baseUrl,
    stderrBuffer,
    stdoutBuffer,
  };
}

afterEach(async () => {
  await Promise.all(
    childProcesses.splice(0).map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }

          child.once("exit", () => resolve());
          child.kill("SIGTERM");
        })
    )
  );

  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("stdio MCP server", () => {
  it("lists tools and validates a task header over stdio", async () => {
    const workspace = makeWorkspace();

    const client = new Client({
      name: "masa-orchestration-test-client",
      version: "1.1.0",
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", path.join(process.cwd(), "src/index.ts")],
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUDIT_ROOT: workspace.auditRoot,
        ENGINE_ROOT: workspace.engineRoot,
      },
      stderr: "pipe",
    });

    try {
      await client.connect(transport);

      const toolsResult = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );
      expect(toolsResult.tools.length).toBe(9);

      const callResult = await client.request(
        {
          method: "tools/call",
          params: {
            name: "validate_task_header",
            arguments: taskHeaderInput(),
          },
        },
        CallToolResultSchema
      );
      const payload = JSON.parse(callResult.content[0].text);
      expect(payload.valid).toBe(true);
    } finally {
      await transport.close();
    }
  }, 15000);
});

describe("HTTP MCP server", () => {
  it("serves health, lists tools, and supports tool calls over Streamable HTTP", async () => {
    const workspace = makeWorkspace();
    const { baseUrl } = await startHttpServer(workspace);

    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      status: "ok",
      transport: "http",
      path: "/mcp",
      authMode: "bearer",
      consoleCompatibilityVersion: "1.0.0",
    });

    const rootResponse = await fetch(baseUrl);
    expect(rootResponse.status).toBe(200);
    await expect(rootResponse.text()).resolves.toContain("masa-orchestration 1.2.0 (http)");

    const methodNotAllowed = await fetch(`${baseUrl}/mcp`);
    expect(methodNotAllowed.status).toBe(405);

    const notFound = await fetch(`${baseUrl}/missing`);
    expect(notFound.status).toBe(404);

    const unauthorized = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    expect(unauthorized.status).toBe(401);

    const client = new Client({
      name: "masa-orchestration-http-test-client",
      version: "1.1.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${HTTP_API_TOKEN}`,
          "x-operator-id": "test-operator",
        },
      },
    });

    try {
      await client.connect(transport);

      const toolsResult = await client.request(
        { method: "tools/list", params: {} },
        ListToolsResultSchema
      );
      expect(toolsResult.tools.length).toBe(9);

      const headerCall = await client.request(
        {
          method: "tools/call",
          params: {
            name: "validate_task_header",
            arguments: taskHeaderInput(),
          },
        },
        CallToolResultSchema
      );
      expect(JSON.parse(headerCall.content[0].text).valid).toBe(true);

      const delegationCall = await client.request(
        {
          method: "tools/call",
          params: {
            name: "delegation_chain_state",
            arguments: {
              action: "get",
            },
          },
        },
        CallToolResultSchema
      );
      const delegationPayload = JSON.parse(delegationCall.content[0].text);
      expect(Array.isArray(delegationPayload.tasks)).toBe(true);
      expect(Array.isArray(delegationPayload.blockers)).toBe(true);

      const activityResponse = await fetch(`${baseUrl}/activity?limit=5`, {
        headers: {
          Authorization: `Bearer ${HTTP_API_TOKEN}`,
        },
      });
      expect(activityResponse.status).toBe(200);
      const activityPayload = (await activityResponse.json()) as {
        activity: Array<{ outcome: string; toolName: string }>;
      };
      expect(
        activityPayload.activity.some((entry) => entry.outcome === "success" && entry.toolName !== "transport")
      ).toBe(true);
    } finally {
      await transport.close();
    }
  }, 20000);

  it("returns the same validate_task_header payload over stdio and HTTP", async () => {
    const workspace = makeWorkspace();
    const stdioClient = new Client({
      name: "masa-orchestration-stdio-parity-client",
      version: "1.1.0",
    });
    const stdioTransport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", path.join(process.cwd(), "src/index.ts")],
      cwd: process.cwd(),
      env: {
        ...process.env,
        AUDIT_ROOT: workspace.auditRoot,
        ENGINE_ROOT: workspace.engineRoot,
      },
      stderr: "pipe",
    });

    const { baseUrl } = await startHttpServer(workspace);
    const httpClient = new Client({
      name: "masa-orchestration-http-parity-client",
      version: "1.1.0",
    });
    const httpTransport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${HTTP_API_TOKEN}`,
        },
      },
    });

    try {
      await stdioClient.connect(stdioTransport);
      await httpClient.connect(httpTransport);

      const [stdioResult, httpResult] = await Promise.all([
        stdioClient.request(
          {
            method: "tools/call",
            params: {
              name: "validate_task_header",
              arguments: taskHeaderInput(),
            },
          },
          CallToolResultSchema
        ),
        httpClient.request(
          {
            method: "tools/call",
            params: {
              name: "validate_task_header",
              arguments: taskHeaderInput(),
            },
          },
          CallToolResultSchema
        ),
      ]);

      expect(JSON.parse(httpResult.content[0].text)).toEqual(JSON.parse(stdioResult.content[0].text));
    } finally {
      await httpTransport.close();
      await stdioTransport.close();
    }
  }, 20000);

  it("rate limits repeated HTTP requests", async () => {
    const workspace = makeWorkspace();
    const { baseUrl } = await startHttpServer(workspace, {
      ORCHESTRATOR_RATE_LIMIT_MAX: "1",
      ORCHESTRATOR_RATE_LIMIT_WINDOW_MS: "60000",
    });

    const headers = {
      Authorization: `Bearer ${HTTP_API_TOKEN}`,
      "content-type": "application/json",
      Accept: "application/json, text/event-stream",
    };

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });

    const first = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: payload,
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    expect(second.status).toBe(429);
  }, 20000);
});
