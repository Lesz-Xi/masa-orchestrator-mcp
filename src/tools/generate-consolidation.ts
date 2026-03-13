import { z } from "zod";

import type { BenchmarkMapConfig, RuntimeConfig } from "../types.js";
import { DelegationStore } from "../state/delegation-store.js";
import { readL4Blockers } from "../utils/l4-blockers.js";
import { benchmarkStatus } from "./benchmark-status.js";
import { checkNotationCompliance } from "./check-notation-compliance.js";
import { llmIndependenceCheck } from "./llm-independence-check.js";

export const generateConsolidationSchema = z.object({
  cycleNumber: z.number().int().min(1),
});

export async function generateConsolidation(
  input: z.infer<typeof generateConsolidationSchema>,
  dependencies: {
    runtimeConfig: RuntimeConfig;
    benchmarkMap: BenchmarkMapConfig;
    notationRules: any[];
    store: DelegationStore;
  }
) {
  const benchmark = await benchmarkStatus(
    {
      action: "report",
      testPath:
        dependencies.runtimeConfig.benchmarkTestPath ||
        dependencies.benchmarkMap.testFile,
    },
    dependencies
  );
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
  const delegation = await dependencies.store.read();
  const l4Blockers = await readL4Blockers(dependencies.runtimeConfig.workspaceRoot);
  const blockers = Array.from(new Set([...delegation.blockers, ...l4Blockers]));

  const benchmarkEvidence = {
    passing: Object.entries(benchmark.benchmarks)
      .filter(([, result]) => result.status === "passing")
      .map(([id]) => id),
    failing: Object.entries(benchmark.benchmarks)
      .filter(([, result]) => result.status === "failing")
      .map(([id]) => id),
    notImplemented: Object.entries(benchmark.benchmarks)
      .filter(([, result]) => result.status === "not_implemented")
      .map(([id]) => id),
  };

  let classification: "validated_core" | "unvalidated_prototype" | "non_core_support" | "research_conceptual" | "speculative" =
    "speculative";

  const formalArtifactExists = benchmarkEvidence.passing.length + benchmarkEvidence.failing.length > 0;

  if (
    formalArtifactExists &&
    benchmark.passing > 0 &&
    llm.independent &&
    notation.compliant &&
    blockers.length === 0
  ) {
    classification = "validated_core";
  } else if (formalArtifactExists) {
    classification = "unvalidated_prototype";
  }

  const overclaims: string[] = [];
  if (!llm.independent) {
    overclaims.push("LLM usage detected in engine-core path.");
  }
  if (!notation.compliant) {
    overclaims.push("Notation compliance violations remain in engine-core path.");
  }
  if (blockers.length > 0) {
    overclaims.push("Unresolved L4 blockers prevent completion claims.");
  }

  return {
    consolidationStatement:
      `Cycle ${input.cycleNumber}: ${benchmark.honestCapabilityStatement} ` +
      `Passing benchmarks: ${benchmarkEvidence.passing.join(", ") || "none"}.`,
    classification,
    benchmarkEvidence,
    overclaims,
    blockers,
    honestCapabilityStatement: benchmark.honestCapabilityStatement,
  };
}
