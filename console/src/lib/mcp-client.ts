import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { CONSOLE_COMPATIBILITY_VERSION, SERVER_VERSION } from "../../../src/constants";
import { loadConsoleEnv, type OperatorSession } from "./auth";
import { TOOL_CATALOG } from "./catalog";

function healthUrl(mcpUrl: string): string {
  const url = new URL(mcpUrl);
  url.pathname = "/health";
  url.search = "";
  return url.toString();
}

function activityUrl(mcpUrl: string, limit: number): string {
  const url = new URL(mcpUrl);
  url.pathname = "/activity";
  url.search = `limit=${limit}`;
  return url.toString();
}

export function getConsoleDefaults() {
  return {
    auditRoot: process.env.AUDIT_ROOT || "",
    engineRoot: process.env.ENGINE_ROOT || "",
    additionalScanRoots: (process.env.ADDITIONAL_SCAN_ROOTS || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    benchmarkTestPath: process.env.BENCHMARK_TEST_PATH || "",
  };
}

async function withClient<T>(session: OperatorSession, operation: (client: Client) => Promise<T>): Promise<T> {
  const env = loadConsoleEnv();
  const transport = new StreamableHTTPClientTransport(new URL(env.mcpUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${env.apiToken}`,
        "x-operator-id": session.operatorId,
      },
    },
  });

  const client = new Client(
    {
      name: "masa-orchestrator-console",
      version: CONSOLE_COMPATIBILITY_VERSION,
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);

  try {
    return await operation(client);
  } finally {
    await client.close();
    await transport.close();
  }
}

export async function callRemoteTool(
  session: OperatorSession,
  toolName: string,
  toolArgs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return await withClient(session, async (client) => {
    const result = await client.callTool({
      name: toolName,
      arguments: toolArgs,
    });

    if (result.structuredContent && typeof result.structuredContent === "object") {
      return result.structuredContent as Record<string, unknown>;
    }

    const content =
      result && typeof result === "object" && "content" in result && Array.isArray(result.content)
        ? result.content
        : [];

    const textBlock = content.find(
      (entry): entry is { type: "text"; text: string } => entry.type === "text" && typeof entry.text === "string"
    );

    if (!textBlock?.text) {
      return {};
    }

    return JSON.parse(textBlock.text) as Record<string, unknown>;
  });
}

export async function fetchRemoteHealth() {
  const env = loadConsoleEnv();
  const response = await fetch(healthUrl(env.mcpUrl));

  if (!response.ok) {
    throw new Error(`Health request failed with ${response.status}.`);
  }

  return await response.json();
}

export async function fetchRemoteActivity(session: OperatorSession, limit = 25) {
  const env = loadConsoleEnv();
  const response = await fetch(activityUrl(env.mcpUrl, limit), {
    headers: {
      Authorization: `Bearer ${env.apiToken}`,
      "x-operator-id": session.operatorId,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Activity request failed with ${response.status}.`);
  }

  const payload = (await response.json()) as { activity: unknown[] };
  return payload.activity;
}

export async function fetchToolBootstrap() {
  const health = await fetchRemoteHealth();

  return {
    tools: TOOL_CATALOG,
    defaults: getConsoleDefaults(),
    health,
    metadata: {
      serverVersion: SERVER_VERSION,
      consoleCompatibilityVersion: CONSOLE_COMPATIBILITY_VERSION,
    },
  };
}
