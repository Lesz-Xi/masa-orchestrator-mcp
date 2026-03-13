import type { Severity } from "../types.js";

export interface EnvelopeRule {
  id: string;
  patterns: RegExp[];
  severity: Severity;
  message: string;
  recommendation: string;
}

export const envelopeRules: EnvelopeRule[] = [
  {
    id: "hidden_confounders",
    patterns: [
      /hidden.*confounder/i,
      /unobserved.*cause/i,
      /latent.*variable/i,
      /U_[A-Z](?!_i\s*=\s*0)/,
    ],
    severity: "error",
    message: "Hidden confounders are outside v1.0 scope.",
    recommendation: "Move to deferred scope or remove from engine-core.",
  },
  {
    id: "nonlinear",
    patterns: [/Math\.pow/, /Math\.exp/, /Math\.log/, /\*\*\s*\d/, /polynomial/i, /nonlinear/i],
    severity: "warning",
    message: "Nonlinear equations are deferred to v1.1.",
    recommendation: "Keep engine-core linear or move logic to deferred scope.",
  },
  {
    id: "distributional",
    patterns: [/noise/i, /random/i, /stochastic/i, /sample\(/, /distribution/i, /variance/i],
    severity: "error",
    message: "Distributional or stochastic computation is outside deterministic v1.0 scope.",
    recommendation: "Remove stochastic behavior from engine-core.",
  },
  {
    id: "cyclic",
    patterns: [/feedback.*loop/i, /cyclic.*graph/i, /bidirectional.*cause/i],
    severity: "error",
    message: "Cyclic graphs are outside v1.0 scope.",
    recommendation: "Restrict engine-core to DAGs.",
  },
  {
    id: "semi_markovian",
    patterns: [/semi.?markov/i, /bidirected.*edge/i, /\bADMG\b/],
    severity: "error",
    message: "Semi-Markovian models are outside scope.",
    recommendation: "Move this logic out of v1.0 engine-core.",
  },
];
