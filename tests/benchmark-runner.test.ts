import { describe, expect, it, vi } from "vitest";

import { runtimeConfigFor } from "./helpers.js";

vi.mock("node:child_process", () => ({
  execFile: vi.fn((...args: any[]) => {
    const callback = args[args.length - 1];
    callback(
      null,
      "✓ src/lib/compute/__tests__/structural-equation-solver.test.ts > forwardSolve benchmarks > B1 Confounded Fork: Y_{do(X=1)} = 1.0\n" +
        "✓ src/lib/compute/__tests__/structural-equation-solver.test.ts > forwardSolve benchmarks > B2 Collider Bias: Y_{do(X=2)} = 1\n",
      ""
    );
  }),
}));

import { runBenchmarks } from "../src/adapters/benchmark-runner.js";

describe("runBenchmarks", () => {
  it("rejects benchmark paths outside AUDIT_ROOT", async () => {
    await expect(
      runBenchmarks({
        runtimeConfig: runtimeConfigFor("/tmp/engine/src", "/tmp/audit"),
        benchmarkMap: {
          suite: "causal-engine-v1",
          testFile: "../../../etc/passwd",
          benchmarks: [],
        },
        llmIndependence: "verified",
        notationCompliance: "compliant",
        blockers: [],
      })
    ).rejects.toThrow("Execution denied");
  });

  it("maps benchmark output to individual benchmark states", async () => {
    const result = await runBenchmarks({
      runtimeConfig: runtimeConfigFor("/tmp/engine/src", "/tmp/engine/src"),
      benchmarkMap: {
        suite: "causal-engine-v1",
        testFile: "src/lib/compute/__tests__/structural-equation-solver.test.ts",
        benchmarks: [
          { id: "B1", name: "B1 Confounded Fork: Y_{do(X=1)} = 1.0", expectedValue: 1 },
          { id: "B2", name: "B2 Collider Bias: Y_{do(X=2)} = 1", expectedValue: 1 },
          { id: "B3", name: "B3 Simple Chain: Y_{do(X=1)} = 0.48", expectedValue: 0.48 },
          { id: "B4", name: "B4 Common Cause: Y_{do(X=5)} = 1.0", expectedValue: 1 },
          { id: "B5", name: "B5 Multi-Intervention: Y_{do(X=2,Z=3)} = 2.6", expectedValue: 2.6 },
          { id: "B6", name: "B6 Diamond Graph: Y_{do(X=2)} = 0.4", expectedValue: 0.4 },
        ],
      },
      llmIndependence: "verified",
      notationCompliance: "compliant",
      blockers: [],
    });

    expect(result.passing).toBe(2);
    expect(result.benchmarks.B1.status).toBe("passing");
    expect(result.benchmarks.B3.status).toBe("not_implemented");
  });
});
