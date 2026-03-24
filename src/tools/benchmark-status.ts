import path from "node:path";

import { z } from "zod";

import { runBenchmarks } from "../adapters/benchmark-runner.js";
import type { BenchmarkMapConfig, RuntimeConfig } from "../types.js";
import { DelegationStore } from "../state/delegation-store.js";
import { readL4Blockers } from "../utils/l4-blockers.js";
import { checkNotationCompliance } from "./check-notation-compliance.js";
import { llmIndependenceCheck } from "./llm-independence-check.js";
import { checkFrontendCompliance } from "./check-frontend-compliance.js";

export const benchmarkStatusSchema = z.object({
  testPath: z.string().min(1),
  action: z.enum(["run", "report"]),
});

export async function benchmarkStatus(
  input: z.infer<typeof benchmarkStatusSchema>,
  dependencies: {
    runtimeConfig: RuntimeConfig;
    benchmarkMap: BenchmarkMapConfig;
    notationRules: any[];
    store: DelegationStore;
  }
) {
  if (input.action === "report") {
    const state = await dependencies.store.read();
    if (state.benchmarkSnapshot) {
      return state.benchmarkSnapshot;
    }

    const benchmarks = Object.fromEntries(
      dependencies.benchmarkMap.benchmarks.map((definition) => [
        definition.id,
        {
          status: "not_implemented",
          expectedValue: definition.expectedValue,
        },
      ])
    ) as Record<"B1" | "B2" | "B3" | "B4" | "B5" | "B6", { status: "not_implemented"; expectedValue: number }>;

    return {
      passing: 0,
      failing: 0,
      notImplemented: 6,
      benchmarks,
      llmIndependence: "unchecked",
      notationCompliance: "unchecked",
      frontendCompliance: "unchecked",
      honestCapabilityStatement: "No computation implemented. The engine does not yet exist.",
      consolidationEligible: false,
    };
  }

  // Sandbox: testPath must match the server-configured benchmark path
  if (dependencies.runtimeConfig.benchmarkTestPath) {
    const resolvedInput = path.resolve(input.testPath);
    const resolvedConfigured = path.resolve(dependencies.runtimeConfig.benchmarkTestPath);
    if (resolvedInput !== resolvedConfigured) {
      throw new Error(
        `testPath must match the configured BENCHMARK_TEST_PATH. ` +
          `Expected '${resolvedConfigured}', got '${resolvedInput}'.`
      );
    }
  }

  const llm = await llmIndependenceCheck(
    {
      enginePath: dependencies.runtimeConfig.engineRoot,
      excludePaths: [],
    },
    dependencies.runtimeConfig
  );
  const notation = await checkNotationCompliance(
    {
      path: dependencies.runtimeConfig.engineRoot,
      glob: "**/*.ts",
      scope: "v1.0-engine",
    },
    dependencies.runtimeConfig,
    dependencies.notationRules
  );

  const frontend = await checkFrontendCompliance({
    targetPath: dependencies.runtimeConfig.engineRoot,
    glob: "**/*.tsx",
  });

  const delegationState = await dependencies.store.read();
  const l4Blockers = await readL4Blockers(dependencies.runtimeConfig.workspaceRoot);
  const blockers = Array.from(new Set([...delegationState.blockers, ...l4Blockers]));

  const snapshot = await runBenchmarks({
    runtimeConfig: {
      ...dependencies.runtimeConfig,
      benchmarkTestPath: input.testPath,
    },
    benchmarkMap: dependencies.benchmarkMap,
    llmIndependence: llm.independent ? "verified" : "violation",
    notationCompliance: notation.compliant ? "compliant" : "violation",
    frontendCompliance: frontend.compliant ? "passing" : "failing",
    blockers,
  });

  await dependencies.store.saveBenchmarkSnapshot(snapshot);
  return snapshot;
}
