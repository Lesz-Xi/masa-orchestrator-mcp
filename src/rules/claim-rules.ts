import type { OverclaimRule } from "../types.js";

export const overclaimRules: OverclaimRule[] = [
  {
    id: "production-ready",
    pattern: /\bproduction-ready\b/i,
    type: "comment",
    problem: "Production-ready is not allowed unless verification and blockers are clear.",
    suggestion: "Use locally verified or pending runtime verification.",
    severity: "error",
    applyWhenBenchmarksLessThan: 6,
  },
  {
    id: "engine-operational",
    pattern: /\bengine operational\b/i,
    type: "comment",
    problem: "Engine operational overclaims validation state.",
    suggestion: "Use implemented locally or partially validated.",
    severity: "error",
    applyWhenBenchmarksLessThan: 6,
  },
  {
    id: "causal-inference-name",
    pattern: /infer.*caus|estimateCausal|causalInference/i,
    type: "function-name",
    problem: "Function name overclaims v1.0 capability.",
    suggestion: "Prefer computeInterventionResult or structuralEquationSolve.",
    severity: "warning",
  },
  {
    id: "causal-effect-variable",
    pattern: /causalEffect|inferredValue/i,
    type: "variable-name",
    problem: "Variable name implies inference rather than deterministic computation.",
    suggestion: "Prefer interventionResult or computedValue.",
    severity: "warning",
  },
  {
    id: "effect-estimate-comment",
    pattern: /\bestimat(e|es|ed)\b.*\bcausal effect\b/i,
    type: "comment",
    problem: "Comment claims an estimated causal effect.",
    suggestion: "Use deterministic intervention result or heuristic signal, depending on the path.",
    severity: "warning",
  },
];
