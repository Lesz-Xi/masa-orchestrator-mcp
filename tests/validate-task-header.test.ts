import { describe, expect, it } from "vitest";

import { validateTaskHeader } from "../src/tools/validate-task-header.js";

describe("validateTaskHeader", () => {
  it("accepts a valid core task header", async () => {
    const result = await validateTaskHeader(
      {
        taskId: "TASK-001",
        taskType: "Implementation",
        category: "forward solver",
        specMapping: "Causal Engine v1.0 / Section 7",
        coreOrNonCore: "Core",
        formalArtifactExpected: "forwardSolve",
        benchmarkImpact: "B1-B6",
        claimBoundary: "No route integration.",
      },
      ["forward solver", "documentation"]
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing artifact on a core task", async () => {
    const result = await validateTaskHeader(
      {
        taskId: "TASK-001",
        taskType: "Implementation",
        category: "forward solver",
        specMapping: "Causal Engine v1.0 / Section 7",
        coreOrNonCore: "Core",
        formalArtifactExpected: "",
        benchmarkImpact: "B1-B6",
        claimBoundary: "No route integration.",
      },
      ["forward solver"]
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes("formalArtifactExpected"))).toBe(true);
  });
});
