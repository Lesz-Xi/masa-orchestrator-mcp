import type { ToolCatalogEntry, ToolCatalogField } from "../../lib/catalog";
import type { DelegationTask } from "../../../../src/types";

export type BootstrapPayload = {
  tools: ToolCatalogEntry[];
  defaults: {
    auditRoot: string;
    engineRoot: string;
    additionalScanRoots: string[];
    benchmarkTestPath: string;
  };
  health: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type DashboardSnapshot = {
  benchmark?: Record<string, unknown>;
  delegation?: Record<string, unknown>;
  consolidation?: Record<string, unknown>;
};

export type ViewKey =
  | "dashboard"
  | "delegation"
  | "benchmarks"
  | "compliance"
  | "consolidation"
  | "tool-runner";

export type StoredInputs = Record<string, Record<string, string>>;
export type StoredResults = Record<string, Record<string, unknown>>;
export type StatusTone = "neutral" | "active" | "success" | "warning" | "danger";

export type FindingRecord = {
  title: string;
  file: string;
  severity: string;
  message: string;
  suggestion: string;
};

export type DelegationSummary = {
  tasks: DelegationTask[];
  blockers: string[];
  statusCounts: Record<string, number>;
  activeAgents: string[];
  queue: Record<string, unknown>;
  raw: Record<string, unknown>;
};

export const VIEW_ORDER: Array<{ key: ViewKey; label: string; eyebrow: string }> = [
  { key: "dashboard", label: "Dashboard", eyebrow: "Live posture" },
  { key: "delegation", label: "Delegation", eyebrow: "Task ledger" },
  { key: "benchmarks", label: "Benchmarks", eyebrow: "B1-B6" },
  { key: "compliance", label: "Compliance", eyebrow: "Claim discipline" },
  { key: "consolidation", label: "Consolidation", eyebrow: "Review cycle" },
  { key: "tool-runner", label: "Tool Runner", eyebrow: "Structured calls" },
];

export function parseStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function formatTimestamp(value: unknown): string {
  if (typeof value !== "string") {
    return "—";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

export function formatRelativeTime(value: string | null): string {
  if (!value) {
    return "Not yet refreshed";
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  const diffMs = Date.now() - parsed;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Updated just now";
  }

  if (diffMinutes < 60) {
    return `Updated ${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  return `Updated ${diffHours}h ago`;
}

export function stringValue(value: string | number | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join("\n");
  }

  return value === undefined ? "" : String(value);
}

export function inferDefaultValue(
  tool: ToolCatalogEntry,
  field: ToolCatalogField,
  defaults: BootstrapPayload["defaults"]
): string {
  if (field.defaultValue !== undefined) {
    return stringValue(field.defaultValue);
  }

  if (tool.name === "benchmark_status" && field.name === "testPath") {
    return defaults.benchmarkTestPath;
  }

  if (tool.name === "llm_independence_check" && field.name === "enginePath") {
    return defaults.engineRoot;
  }

  if (tool.name === "validate_assumption_envelope" && field.name === "path") {
    return defaults.engineRoot;
  }

  if (tool.name === "check_notation_compliance" && field.name === "path") {
    return defaults.engineRoot || defaults.additionalScanRoots[0] || defaults.auditRoot;
  }

  if (field.name === "path") {
    return defaults.auditRoot || defaults.additionalScanRoots[0] || "";
  }

  return "";
}

export function normalizeFieldValue(field: ToolCatalogField, rawValue: string): unknown {
  if (field.kind === "number") {
    return Number(rawValue);
  }

  if (field.kind === "string-array") {
    return rawValue
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return rawValue;
}

export function isMutation(toolName: string, payload: Record<string, unknown>): boolean {
  return toolName === "delegation_chain_state" && payload.action === "update";
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asString(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function toneForState(value: string): StatusTone {
  const normalized = value.toLowerCase();
  if (["passing", "verified", "active", "ok", "ready", "completed", "healthy"].includes(normalized)) {
    return "success";
  }

  if (["warning", "violation", "unchecked", "pending_review", "not_implemented", "stale"].includes(normalized)) {
    return "warning";
  }

  if (["blocked", "failed", "danger", "invalid", "failing", "error"].includes(normalized)) {
    return "danger";
  }

  if (["in_progress", "running", "authenticated", "http", "review"].includes(normalized)) {
    return "active";
  }

  return "neutral";
}

export function summarizeBenchmark(benchmark: Record<string, unknown> | undefined) {
  const benchmarkMap = asRecord(benchmark?.benchmarks);
  const benchmarkTiles = benchmarkMap
    ? Object.entries(benchmarkMap).map(([id, value]) => {
        const result = asRecord(value);
        return {
          id,
          status: asString(result?.status, "unknown"),
          expected: result?.expectedValue,
          actual: result?.actualValue,
          lastRun: formatTimestamp(result?.lastRun),
        };
      })
    : [];

  const passing = asNumber(benchmark?.passing) ?? 0;
  const failing = asNumber(benchmark?.failing) ?? 0;
  const notImplemented = asNumber(benchmark?.notImplemented) ?? 0;
  const hasCachedRun = benchmarkTiles.length > 0 || typeof benchmark?.updatedAt === "string";

  return {
    hasCachedRun,
    passing,
    failing,
    notImplemented,
    totalResolved: passing + failing + notImplemented,
    capabilityStatement: asString(benchmark?.honestCapabilityStatement, "No benchmark run cached."),
    llmIndependence: asString(benchmark?.llmIndependence, "unchecked"),
    notationCompliance: asString(benchmark?.notationCompliance, "unchecked"),
    consolidationEligible: benchmark?.consolidationEligible === true,
    updatedAt: formatTimestamp(benchmark?.updatedAt),
    freshness: hasCachedRun ? "cached review state" : "uncached",
    tiles: benchmarkTiles,
    raw: benchmark ?? {},
  };
}

export function summarizeDelegation(delegation: Record<string, unknown> | undefined): DelegationSummary {
  const tasks = asArray<DelegationTask>(delegation?.tasks);
  const blockers = asArray<string>(delegation?.blockers);
  const statusCounts = tasks.reduce<Record<string, number>>((accumulator, task) => {
    const status = asString(task.currentStatus, "unknown");
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});
  const activeAgents = [...new Set(tasks.map((task) => asString(task.currentAgent, "")).filter(Boolean))];

  return {
    tasks,
    blockers,
    statusCounts,
    activeAgents,
    queue: asRecord(delegation?.pipeline) ?? {},
    raw: delegation ?? {},
  };
}

export function summarizeCompliance(
  latestResult: Record<string, unknown> | null,
  benchmarkSummary: ReturnType<typeof summarizeBenchmark>
) {
  const findings = [
    {
      label: "Notation compliance",
      value: benchmarkSummary.notationCompliance,
      tone: toneForState(benchmarkSummary.notationCompliance),
    },
    {
      label: "LLM independence",
      value: benchmarkSummary.llmIndependence,
      tone: toneForState(benchmarkSummary.llmIndependence),
    },
    {
      label: "Assumption envelope",
      value: latestResult?.compliant === true ? "verified" : latestResult ? "needs review" : "not run",
      tone: latestResult?.compliant === true ? "success" : latestResult ? "warning" : "neutral",
    },
  ] as Array<{ label: string; value: string; tone: StatusTone }>;

  const rawViolations = asArray<Record<string, unknown>>(latestResult?.violations);
  const normalizedViolations: FindingRecord[] = rawViolations.slice(0, 8).map((entry) => ({
    title: asString(entry.match, "Finding"),
    file: asString(entry.file, "Path unavailable"),
    severity: asString(entry.severity, "warning"),
    message: asString(entry.message, "No description."),
    suggestion: asString(entry.suggestion, "No remediation guidance."),
  }));

  return {
    findings,
    violations: normalizedViolations,
    totalFiles: asNumber(latestResult?.filesScanned),
    compliant: latestResult?.compliant === true,
    raw: latestResult ?? {},
  };
}

export function summarizeConsolidation(result: Record<string, unknown> | null) {
  return {
    statement: asString(result?.consolidationStatement, "No consolidation run captured yet."),
    classification: asString(result?.classification, "not_generated"),
    capabilityStatement: asString(result?.honestCapabilityStatement, "No readiness statement generated."),
    overclaims: asArray<string>(result?.overclaims),
    blockers: asArray<string>(result?.blockers),
    benchmarkEvidence: asRecord(result?.benchmarkEvidence) ?? {},
    raw: result ?? {},
  };
}

export function summarizeToolResult(result: Record<string, unknown> | null) {
  if (!result) {
    return {
      label: "No result cached",
      tone: "neutral" as StatusTone,
      details: [] as Array<{ label: string; value: string }>,
    };
  }

  const detailPairs = Object.entries(result)
    .slice(0, 6)
    .map(([key, value]) => ({
      label: key,
      value: typeof value === "object" ? "Structured payload" : String(value),
    }));

  if ("valid" in result) {
    return {
      label: result.valid === true ? "Validation passed" : "Validation failed",
      tone: result.valid === true ? ("success" as StatusTone) : ("danger" as StatusTone),
      details: detailPairs,
    };
  }

  if ("success" in result) {
    return {
      label: result.success === true ? "Action completed" : "Action reported issues",
      tone: result.success === true ? ("success" as StatusTone) : ("warning" as StatusTone),
      details: detailPairs,
    };
  }

  return {
    label: "Structured response ready",
    tone: "active" as StatusTone,
    details: detailPairs,
  };
}
