import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadNotationRules } from "../src/config/load-config.js";
import { checkNotationCompliance } from "../src/tools/check-notation-compliance.js";
import { makeTempDir, runtimeConfigFor, writeFile } from "./helpers.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("checkNotationCompliance", () => {
  it("flags engine-core violations and downgrades docs/test contexts", async () => {
    const workspace = makeTempDir("masa-notation-");
    tempDirs.push(workspace);
    const auditRoot = path.join(workspace, "Agentic-Spec-Driven-Audit");
    const engineRoot = path.join(workspace, "synthesis-engine", "src");
    const runtimeConfig = runtimeConfigFor(engineRoot, auditRoot);

    writeFile(
      path.join(engineRoot, "lib", "compute", "solver.ts"),
      "export const label = 'counterfactual';\nconst x = 'P(Y | do(X=1))';\n"
    );
    writeFile(
      path.join(engineRoot, "docs", "future.md"),
      "In v2 this may mention P(Y | do(X=1)).\n"
    );

    const result = await checkNotationCompliance(
      {
        path: engineRoot,
        glob: "**/*.{ts,md}",
        scope: "v1.0-engine",
      },
      runtimeConfig,
      loadNotationRules(new URL("../src/config/load-config.ts", import.meta.url).href)
    );

    expect(result.compliant).toBe(false);
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.violations.some((violation) => violation.file.endsWith("solver.ts"))).toBe(true);
  });
});
