import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadRuntimeConfig } from "../src/config/load-config.js";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadRuntimeConfig", () => {
  it("applies default transport host, port, and path", () => {
    process.env.AUDIT_ROOT = "/tmp/audit";
    process.env.ENGINE_ROOT = "/tmp/engine";

    const config = loadRuntimeConfig(import.meta.url);

    expect(config.transport).toBe("stdio");
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(3100);
    expect(config.path).toBe("/mcp");
    expect(config.authMode).toBe("none");
    expect(config.stateFile).toBe(path.join("/tmp/audit", ".orchestration-state.json"));
    expect(config.additionalScanRoots).toEqual([]);
    expect(config.allowedScanRoots).toEqual(["/tmp/audit", "/tmp/engine"]);
  });

  it("rejects invalid transport values", () => {
    process.env.AUDIT_ROOT = "/tmp/audit";
    process.env.ENGINE_ROOT = "/tmp/engine";
    process.env.MCP_TRANSPORT = "sse";

    expect(() => loadRuntimeConfig(import.meta.url)).toThrow();
  });

  it("fails when required roots are missing", () => {
    delete process.env.AUDIT_ROOT;
    delete process.env.ENGINE_ROOT;

    expect(() => loadRuntimeConfig(import.meta.url)).toThrow();
  });

  it("requires an API token for HTTP transport", () => {
    process.env.AUDIT_ROOT = "/tmp/audit";
    process.env.ENGINE_ROOT = "/tmp/engine";
    process.env.MCP_TRANSPORT = "http";
    delete process.env.ORCHESTRATOR_API_TOKEN;

    expect(() => loadRuntimeConfig(import.meta.url)).toThrow("ORCHESTRATOR_API_TOKEN");
  });

  it("parses additional scan roots and de-duplicates canonical roots", () => {
    process.env.AUDIT_ROOT = "/tmp/audit";
    process.env.ENGINE_ROOT = "/tmp/engine";
    process.env.ADDITIONAL_SCAN_ROOTS = "/tmp/crucible,/tmp/audit,relative/specs";

    const config = loadRuntimeConfig(import.meta.url);

    expect(config.additionalScanRoots).toEqual([
      "/tmp/crucible",
      path.resolve("relative/specs"),
    ]);
    expect(config.allowedScanRoots).toEqual([
      "/tmp/audit",
      "/tmp/engine",
      "/tmp/crucible",
      path.resolve("relative/specs"),
    ]);
  });
});
