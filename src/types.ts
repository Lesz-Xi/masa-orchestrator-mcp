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
  stateFile: string;
  benchmarkTestPath?: string;
  transport: "stdio" | "http";
  host: string;
  port: number;
  path: string;
  workspaceRoot: string;
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
  honestCapabilityStatement: string;
  consolidationEligible: boolean;
  updatedAt: string;
}

export interface DelegationHistoryEntry {
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
  history: DelegationHistoryEntry[];
}

export interface DelegationStateFile {
  version: 1;
  tasks: DelegationTask[];
  benchmarkSnapshot?: BenchmarkStatusSnapshot;
  blockers: string[];
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
