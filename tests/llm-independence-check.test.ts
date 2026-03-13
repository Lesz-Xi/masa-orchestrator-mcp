import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { llmIndependenceCheck } from "../src/tools/llm-independence-check.js";
import { makeTempDir, runtimeConfigFor, writeFile } from "./helpers.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("llmIndependenceCheck", () => {
  it("fails only when LLM usage appears in engine-core", async () => {
    const workspace = makeTempDir("masa-llm-");
    tempDirs.push(workspace);
    const auditRoot = path.join(workspace, "Agentic-Spec-Driven-Audit");
    const engineRoot = path.join(workspace, "synthesis-engine", "src");
    const runtimeConfig = runtimeConfigFor(engineRoot, auditRoot);

    writeFile(path.join(engineRoot, "lib", "compute", "solver.ts"), "import OpenAI from 'openai';\n");
    writeFile(path.join(engineRoot, "lib", "services", "counterfactual-trace.ts"), "function generateDoPrompt() {}\n");

    const result = await llmIndependenceCheck(
      { enginePath: engineRoot, excludePaths: [] },
      runtimeConfig
    );

    expect(result.independent).toBe(false);
    expect(result.violations.some((violation) => violation.inEnginePath)).toBe(true);
    expect(result.explanationFiles.some((file) => file.endsWith("counterfactual-trace.ts"))).toBe(true);
  });
});
