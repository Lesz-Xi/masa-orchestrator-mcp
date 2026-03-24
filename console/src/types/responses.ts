// Typed shapes for all MCP tool responses consumed by the console UI.

export type ViewKey =
  | "dashboard"
  | "delegation"
  | "benchmarks"
  | "compliance"
  | "consolidation"
  | "tool-runner";

// ── Benchmark types ──────────────────────────────────────────────────────────

export type BenchmarkStatus = "passing" | "failing" | "not_implemented";

export interface BenchmarkResult {
  status: BenchmarkStatus;
  expectedValue: number;
  actualValue?: number;
  lastRun?: string;
  errorMessage?: string;
}

export type BenchmarkId = "B1" | "B2" | "B3" | "B4" | "B5" | "B6";

export interface BenchmarkSnapshot {
  passing: number;
  failing: number;
  notImplemented: number;
  benchmarks: Record<BenchmarkId, BenchmarkResult>;
  llmIndependence: "verified" | "violation" | "unchecked";
  notationCompliance: "compliant" | "violation" | "unchecked";
  honestCapabilityStatement: string;
  consolidationEligible: boolean;
  updatedAt?: string;
}

// ── Delegation types ─────────────────────────────────────────────────────────

export type DelegationAgent = "gemini" | "claude" | "gpt";

export type TaskStatus =
  | "delegated"
  | "in_review"
  | "approved"
  | "in_progress"
  | "delivered"
  | "verified"
  | "consolidated"
  | "rejected"
  | "rework"
  | "blocked";

export interface HistoryEntry {
  status: string;
  agent: string;
  timestamp: string;
  notes: string;
}

export interface DelegationTask {
  taskId: string;
  taskType: string;
  currentStatus: string;
  currentAgent: string;
  history: HistoryEntry[];
}

export interface DelegationPipeline {
  thinkQueue: string[];
  actQueue: string[];
  verifyQueue: string[];
}

export interface DelegationState {
  tasks: DelegationTask[];
  pipeline: DelegationPipeline;
  blockers: string[];
}

// ── Compliance types ─────────────────────────────────────────────────────────

export interface NotationViolation {
  file: string;
  line: number;
  column?: number;
  rule?: string;
  severity: "error" | "warning";
  message: string;
  suggestion?: string;
  match: string;
  context?: string;
  fileClass?: string;
}

export interface NotationComplianceResult {
  compliant: boolean;
  violations: NotationViolation[];
  filesScanned?: number;
}

export interface LlmCheckResult {
  independent: boolean;
  violations: Array<{
    file: string;
    line: number;
    match: string;
    pattern?: string;
    message?: string;
  }>;
}

export interface EnvelopeViolation {
  file: string;
  line: number;
  category: string;
  match: string;
  severity: "error" | "warning";
  message: string;
  recommendation: string;
}

export interface EnvelopeCheckResult {
  envelopeIntact: boolean;
  violations: EnvelopeViolation[];
}

// ── Consolidation types ──────────────────────────────────────────────────────

export interface ConsolidationResult {
  readinessStatement: string;
  eligible: boolean;
  passing?: number;
  blockers?: string[];
  warnings?: string[];
  cycleNumber?: number;
}

// ── Activity types ───────────────────────────────────────────────────────────

export type ActivityOutcome =
  | "success"
  | "error"
  | "unauthorized"
  | "rate_limited"
  | "bad_request"
  | "method_not_allowed";

export interface ActivityEntry {
  requestId: string;
  timestamp: string;
  toolName: string;
  outcome: ActivityOutcome;
  durationMs?: number;
  callerId?: string;
  errorMessage?: string;
}

// ── Dashboard snapshot ───────────────────────────────────────────────────────

export interface DashboardSnapshot {
  benchmark: BenchmarkSnapshot | null;
  delegation: DelegationState | null;
}

// ── Transition graph (mirrors server-side allowedTransitions) ─────────────────

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  delegated: ["in_review", "in_progress", "rejected", "blocked"],
  in_review: ["approved", "rejected", "blocked"],
  approved: ["delegated", "in_progress", "blocked"],
  in_progress: ["delivered", "blocked", "rejected"],
  delivered: ["verified", "rejected", "blocked"],
  verified: ["consolidated"],
  consolidated: [],
  rejected: ["rework"],
  rework: ["delegated", "in_progress"],
  blocked: ["in_review", "approved", "in_progress", "rework", "rejected"],
};
