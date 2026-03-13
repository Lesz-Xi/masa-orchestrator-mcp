import path from "node:path";

import type { FileClass } from "../types.js";

export interface ClassificationInput {
  filePath: string;
  engineRoot: string;
  content?: string;
}

const legacyFilePatterns = [
  /lib\/ai\/causal-blueprint\.[tj]sx?$/i,
  /lib\/services\/causal-solver\.[tj]sx?$/i,
  /lib\/services\/counterfactual-trace\.[tj]sx?$/i,
  /lib\/services\/causal-interventions\.[tj]sx?$/i,
];

const engineCorePatterns = [
  /lib\/compute\/.+\.[tj]sx?$/i,
  /types\/scm\.[tj]sx?$/i,
];

export function classifyFile({ filePath, engineRoot, content }: ClassificationInput): FileClass {
  const normalized = filePath.replace(/\\/g, "/");
  const relativeToEngine = path.relative(engineRoot, filePath).replace(/\\/g, "/");

  if (/(__tests__|\/tests\/|\.test\.[tj]sx?$|\.spec\.[tj]sx?$)/i.test(normalized)) {
    return "tests";
  }

  if (/\/migrations\/|\.sql$/i.test(normalized)) {
    return "migrations";
  }

  if (/\.(md|mdx|txt)$/i.test(normalized) || /\/docs\/|\/Agentic-Spec-Driven-Audit\//i.test(normalized)) {
    return "docs";
  }

  for (const pattern of legacyFilePatterns) {
    if (pattern.test(relativeToEngine)) {
      return "legacy-fallback";
    }
  }

  if (content && /heuristic_bfs_propagation|fallback narrative only/i.test(content) && relativeToEngine.startsWith("lib/")) {
    return "legacy-fallback";
  }

  for (const pattern of engineCorePatterns) {
    if (pattern.test(relativeToEngine)) {
      return "engine-core";
    }
  }

  if (!relativeToEngine.startsWith("..") && !path.isAbsolute(relativeToEngine)) {
    return "support";
  }

  return "unclassified";
}
