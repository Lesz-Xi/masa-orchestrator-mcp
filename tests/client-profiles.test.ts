import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { clientProfileSchema } from "../src/client-profiles.js";
import { TOOL_NAME_LIST } from "../src/tool-names.js";

const packageRoot = process.cwd();
const profilesDir = path.join(packageRoot, "profiles");
const promptsDir = path.join(packageRoot, "prompts");
const docsDir = path.join(packageRoot, "docs");
const examplesDir = path.join(packageRoot, "examples");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

describe("client profiles", () => {
  it("accepts the shipped profiles via the shared schema", () => {
    const schema = readJson<Record<string, unknown>>(path.join(profilesDir, "schema.json"));
    expect(schema.title).toBe("MASA Orchestrator Client Profile");

    const profileFiles = ["codex.json", "claude.json", "gemini.json"];

    for (const fileName of profileFiles) {
      const parsed = clientProfileSchema.parse(readJson(path.join(profilesDir, fileName)));
      expect(parsed.promptTemplate.startsWith("prompts/")).toBe(true);
      expect(parsed.notes.length).toBeGreaterThan(0);
    }
  });

  it("keeps enabledTools and toolPriority aligned to the canonical server tool list", () => {
    const serverTools = new Set(TOOL_NAME_LIST);
    const profileFiles = ["codex.json", "claude.json", "gemini.json"];

    for (const fileName of profileFiles) {
      const parsed = clientProfileSchema.parse(readJson(path.join(profilesDir, fileName)));
      const enabled = new Set(parsed.enabledTools);

      for (const tool of parsed.enabledTools) {
        expect(serverTools.has(tool)).toBe(true);
      }

      for (const tool of parsed.toolPriority) {
        expect(enabled.has(tool)).toBe(true);
      }
    }
  });

  it("keeps the published JSON schema tool enums aligned to the canonical server tool list", () => {
    const schema = readJson<{
      properties: {
        enabledTools: { items: { enum: string[] } };
        toolPriority: { items: { enum: string[] } };
      };
    }>(path.join(profilesDir, "schema.json"));

    expect(schema.properties.enabledTools.items.enum).toEqual(TOOL_NAME_LIST);
    expect(schema.properties.toolPriority.items.enum).toEqual(TOOL_NAME_LIST);
  });

  it("ships prompt templates for every profile", () => {
    const profileFiles = ["codex.json", "claude.json", "gemini.json"];

    for (const fileName of profileFiles) {
      const parsed = clientProfileSchema.parse(readJson(path.join(profilesDir, fileName)));
      const promptPath = path.join(packageRoot, parsed.promptTemplate);
      expect(fs.existsSync(promptPath)).toBe(true);
      expect(fs.readFileSync(promptPath, "utf8").length).toBeGreaterThan(0);
    }

    expect(fs.existsSync(promptsDir)).toBe(true);
  });

  it("ships large-file read guardrails in every profile prompt", () => {
    const profileFiles = ["codex.json", "claude.json", "gemini.json"];

    for (const fileName of profileFiles) {
      const parsed = clientProfileSchema.parse(readJson(path.join(profilesDir, fileName)));
      const promptPath = path.join(packageRoot, parsed.promptTemplate);
      const prompt = fs.readFileSync(promptPath, "utf8");

      expect(prompt).toContain("Large-file discipline:");
      expect(prompt.toLowerCase()).toContain("search first");
      expect(prompt.toLowerCase()).toContain("offset/limit");
      expect(prompt.toLowerCase()).toMatch(/whole large files|full-file read/);
    }
  });

  it("matches the transport defaults for the chosen role split", () => {
    const codex = clientProfileSchema.parse(readJson(path.join(profilesDir, "codex.json")));
    const claude = clientProfileSchema.parse(readJson(path.join(profilesDir, "claude.json")));
    const gemini = clientProfileSchema.parse(readJson(path.join(profilesDir, "gemini.json")));

    expect(codex.preferredTransport).toBe("stdio");
    expect(codex.fallbackTransport).toBe("http");
    expect(claude.preferredTransport).toBe("http");
    expect(claude.fallbackTransport).toBe("stdio");
    expect(gemini.preferredTransport).toBe("http");
    expect(gemini.fallbackTransport).toBe("stdio");
  });

  it("ships examples that point to the correct transport mode", () => {
    const codexEnv = fs.readFileSync(path.join(examplesDir, "codex-stdio.env"), "utf8");
    const claudeEnv = fs.readFileSync(path.join(examplesDir, "claude-http.env"), "utf8");
    const geminiEnv = fs.readFileSync(path.join(examplesDir, "gemini-http.env"), "utf8");

    expect(codexEnv).toContain("MCP_TRANSPORT=stdio");
    expect(claudeEnv).toContain("MCP_TRANSPORT=http");
    expect(geminiEnv).toContain("MCP_TRANSPORT=http");
  });

  it("keeps docs and examples free of deprecated transport references", () => {
    const filesToCheck = [
      path.join(docsDir, "CLIENT-CAPABILITY-MATRIX.md"),
      path.join(docsDir, "CLIENT-USAGE-GUIDE.md"),
      path.join(examplesDir, "codex-stdio.env"),
      path.join(examplesDir, "claude-http.env"),
      path.join(examplesDir, "gemini-http.env"),
    ];

    for (const filePath of filesToCheck) {
      const contents = fs.readFileSync(filePath, "utf8").toLowerCase();
      expect(/\bsse\b/.test(contents)).toBe(false);
    }
  });
});
