import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { assertSandboxedPath, collectFiles, scanFileForPattern } from "../src/adapters/file-scanner.js";
import { makeTempDir, writeFile } from "./helpers.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("file-scanner security boundaries", () => {
  it("assertSandboxedPath rejects paths outside audit and engine roots", () => {
    expect(() =>
      assertSandboxedPath("/etc/passwd", ["/tmp/audit", "/tmp/engine"])
    ).toThrow("Access denied");
  });

  it("assertSandboxedPath rejects traversal sequences", () => {
    expect(() =>
      assertSandboxedPath("/tmp/audit/../../../etc/passwd", ["/tmp/audit", "/tmp/engine"])
    ).toThrow("Access denied");
  });

  it("assertSandboxedPath allows paths within audit root", () => {
    expect(() =>
      assertSandboxedPath("/tmp/audit/file.ts", ["/tmp/audit", "/tmp/engine"])
    ).not.toThrow();
  });

  it("assertSandboxedPath allows paths within engine root", () => {
    expect(() =>
      assertSandboxedPath("/tmp/engine/src/lib/solver.ts", ["/tmp/audit", "/tmp/engine"])
    ).not.toThrow();
  });

  it("assertSandboxedPath allows paths within additional configured roots", () => {
    expect(() =>
      assertSandboxedPath("/tmp/crucible/docs/specs/spec.md", ["/tmp/audit", "/tmp/engine", "/tmp/crucible"])
    ).not.toThrow();
  });

  it("collectFiles rejects paths outside sandbox", async () => {
    await expect(
      collectFiles("/etc", "**/*.conf", { allowedRoots: ["/tmp/audit", "/tmp/engine"] })
    ).rejects.toThrow("Access denied");
  });

  it("collectFiles accepts paths inside sandbox", async () => {
    const workspace = makeTempDir("masa-scanner-");
    tempDirs.push(workspace);
    const auditRoot = path.join(workspace, "audit");
    writeFile(path.join(auditRoot, "test.ts"), "const x = 1;\n");

    const files = await collectFiles(auditRoot, "**/*.ts", {
      allowedRoots: [auditRoot, path.join(workspace, "engine")],
    });

    expect(files).toHaveLength(1);
    expect(files[0]).toContain("test.ts");
  });

  it("scanFileForPattern rejects paths outside sandbox", async () => {
    await expect(
      scanFileForPattern({
        filePath: "/etc/passwd",
        pattern: /root/gi,
        engineRoot: "/tmp/engine",
        allowedRoots: ["/tmp/audit", "/tmp/engine"],
      })
    ).rejects.toThrow("Access denied");
  });
});
