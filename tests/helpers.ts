import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { RuntimeConfig } from "../src/types.js";

export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function runtimeConfigFor(
  engineRoot: string,
  auditRoot: string,
  additionalScanRoots: string[] = []
): RuntimeConfig {
  return {
    auditRoot,
    engineRoot,
    additionalScanRoots,
    allowedScanRoots: [auditRoot, engineRoot, ...additionalScanRoots],
    stateFile: path.join(auditRoot, ".orchestration-state.json"),
    transport: "stdio",
    host: "127.0.0.1",
    port: 3100,
    path: "/mcp",
    workspaceRoot: path.dirname(auditRoot),
    authMode: "none",
    allowedOrigins: [],
    authorizationServerOrigin: undefined,
    requestBodyLimitBytes: 1_048_576,
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 60,
  };
}
