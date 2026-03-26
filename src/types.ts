import type { DelegationAgent, DelegationStatus } from "./delegation-contract.js";

export type FileClass =
  | "engine-core"
  | "support"
  | "legacy-fallback"
  | "tests"
  | "docs"
  | "migrations"
  | "unclassified";

export type MatchContext = "code" | "comment" | "jsdoc" | "string";
export type Severity = "error" | "warning";

export interface RuntimeConfig {
  auditRoot: string;
  engineRoot: string;
  additionalScanRoots: string[];
  allowedScanRoots: string[];
  stateFile: string;
  benchmarkTestPath?: string;
  transport: "stdio" | "http";
  host: string;
  port: number;
  path: string;
  workspaceRoot: string;
  authMode: "none" | "bearer";
  apiToken?: string;
  allowedOrigins: string[];
  authorizationServerOrigin?: string;
  requestBodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export type ToolCategory = "workflow" | "compliance" | "benchmarks" | "delegation" | "consolidation";
export type ToolRiskLevel = "low" | "medium" | "high";
export type ToolFieldKind = "text" | "textarea" | "number" | "select" | "string-array";

export interface ToolCatalogField {
  name: string;
  label: string;
  kind: ToolFieldKind;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: string | number | string[];
  rows?: number;
}

export interface ToolCatalogEntry {
  name: string;
  displayName: string;
  category: ToolCategory;
  riskLevel: ToolRiskLevel;
  mutatesState: boolean;
  summary: string;
  recommendedInputs: string[];
  fields: ToolCatalogField[];
}

export interface NotationRule {
  id: string;
  pattern: string;
  severity: Severity;
  message: string;
  suggestion: string;
  scopes: string[];
  includeClasses: FileClass[];
  downgradeInClasses?: FileClass[];
  contextCheck?: boolean;
}

export interface BenchmarkDefinition {
  id: "B1" | "B2" | "B3" | "B4" | "B5" | "B6";
  name: string;
  expectedValue: number;
}

export interface BenchmarkMapConfig {
  suite: string;
  testFile: string;
  benchmarks: BenchmarkDefinition[];
}

export interface ScanMatch {
  file: string;
  line: number;
  column: number;
  lineText: string;
  match: string;
  context: MatchContext;
  fileClass: FileClass;
  surrounding: string;
}

export interface ToolViolation {
  file: string;
  line: number;
  column: number;
  match: string;
  pattern: string;
  severity: Severity;
  message: string;
  suggestion: string;
}

export interface ClaimFinding {
  file: string;
  line: number;
  type: "function-name" | "variable-name" | "comment" | "jsdoc";
  current: string;
  problem: string;
  suggestion: string;
  severity: Severity;
}

export interface BenchmarkResult {
  status: "passing" | "failing" | "not_implemented" | "broken";
  expectedValue: number;
  actualValue?: number;
  trace?: Record<string, number>;
  errorMessage?: string;
  lastRun?: string;
}

export interface BenchmarkStatusSnapshot {
  passing: number;
  failing: number;
  notImplemented: number;
  benchmarks: Record<BenchmarkDefinition["id"], BenchmarkResult>;
  llmIndependence: "verified" | "violation" | "unchecked";
  notationCompliance: "compliant" | "violation" | "unchecked";
  frontendCompliance?: "passing" | "failing" | "unchecked";
  honestCapabilityStatement: string;
  consolidationEligible: boolean;
  updatedAt: string;
}

export interface DelegationHistoryEntry {
  status: DelegationStatus;
  agent: DelegationAgent;
  timestamp: string;
  notes: string;
}

export interface DelegationTask {
  taskId: string;
  taskType: string;
  currentStatus: DelegationStatus;
  currentAgent: DelegationAgent;
  history: DelegationHistoryEntry[];
}

export type ActivityOutcome =
  | "success"
  | "error"
  | "unauthorized"
  | "rate_limited"
  | "bad_request"
  | "method_not_allowed";

export interface ActivityLogEntry {
  requestId: string;
  timestamp: string;
  toolName: string;
  outcome: ActivityOutcome;
  durationMs: number;
  callerId: string;
  transport: "http" | "stdio";
  errorMessage?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface DelegationStateFile {
  version: 2;
  tasks: DelegationTask[];
  benchmarkSnapshot?: BenchmarkStatusSnapshot;
  blockers: string[];
  activityLog: ActivityLogEntry[];
}

export interface OverclaimRule {
  id: string;
  pattern: RegExp;
  type: ClaimFinding["type"];
  problem: string;
  suggestion: string;
  severity: Severity;
  applyWhenBenchmarksLessThan?: number;
}
