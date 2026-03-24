"use client";

import { useEffect, useMemo, useState } from "react";

import type { ActivityLogEntry, ToolCatalogEntry, ToolCatalogField } from "../lib/catalog";

type BootstrapPayload = {
  tools: ToolCatalogEntry[];
  defaults: {
    auditRoot: string;
    engineRoot: string;
    benchmarkTestPath: string;
  };
  health: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type DashboardSnapshot = {
  benchmark?: Record<string, unknown>;
  delegation?: Record<string, unknown>;
  consolidation?: Record<string, unknown>;
};

type ViewKey = "dashboard" | "delegation" | "benchmarks" | "compliance" | "consolidation" | "tool-runner";
type StoredInputs = Record<string, Record<string, string>>;
type StoredResults = Record<string, Record<string, unknown>>;
type StatusTone = "neutral" | "active" | "success" | "warning" | "danger";
type DelegationTask = Record<string, unknown>;
type FindingRecord = {
  title: string;
  file: string;
  severity: string;
  message: string;
  suggestion: string;
};

const VIEW_ORDER: Array<{ key: ViewKey; label: string; eyebrow: string }> = [
  { key: "dashboard", label: "Dashboard", eyebrow: "Live posture" },
  { key: "delegation", label: "Delegation", eyebrow: "Task ledger" },
  { key: "benchmarks", label: "Benchmarks", eyebrow: "B1-B6" },
  { key: "compliance", label: "Compliance", eyebrow: "Claim discipline" },
  { key: "consolidation", label: "Consolidation", eyebrow: "Review cycle" },
  { key: "tool-runner", label: "Tool Runner", eyebrow: "Structured calls" },
];

const RECENT_INPUTS_KEY = "masa.console.recentInputs";
const RECENT_RESULTS_KEY = "masa.console.recentResults";

function parseStoredJson<T>(key: string, fallback: T): T {
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

function formatTimestamp(value: unknown): string {
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

function formatRelativeTime(value: string | null): string {
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

function stringValue(value: string | number | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join("\n");
  }

  return value === undefined ? "" : String(value);
}

function inferDefaultValue(
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
    return defaults.engineRoot || defaults.auditRoot;
  }

  if (field.name === "path") {
    return defaults.auditRoot;
  }

  return "";
}

function normalizeFieldValue(field: ToolCatalogField, rawValue: string): unknown {
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

function isMutation(toolName: string, payload: Record<string, unknown>): boolean {
  return toolName === "delegation_chain_state" && payload.action === "update";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown, fallback = "—"): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function toneForState(value: string): StatusTone {
  const normalized = value.toLowerCase();
  if (["passing", "verified", "active", "ok", "ready", "completed"].includes(normalized)) {
    return "success";
  }

  if (["warning", "violation", "unchecked", "pending_review", "not_implemented", "stale"].includes(normalized)) {
    return "warning";
  }

  if (["blocked", "failed", "danger", "invalid", "failing"].includes(normalized)) {
    return "danger";
  }

  if (["in_progress", "running", "authenticated", "http"].includes(normalized)) {
    return "active";
  }

  return "neutral";
}

function summarizeBenchmark(benchmark: Record<string, unknown> | undefined) {
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

  return {
    hasCachedRun: benchmarkTiles.length > 0 || typeof benchmark?.updatedAt === "string",
    passing: asNumber(benchmark?.passing) ?? 0,
    failing: asNumber(benchmark?.failing) ?? 0,
    notImplemented: asNumber(benchmark?.notImplemented) ?? 0,
    capabilityStatement: asString(benchmark?.honestCapabilityStatement, "No benchmark run cached."),
    llmIndependence: asString(benchmark?.llmIndependence, "unchecked"),
    notationCompliance: asString(benchmark?.notationCompliance, "unchecked"),
    consolidationEligible: benchmark?.consolidationEligible === true,
    updatedAt: formatTimestamp(benchmark?.updatedAt),
    tiles: benchmarkTiles,
    raw: benchmark ?? {},
  };
}

function summarizeDelegation(delegation: Record<string, unknown> | undefined) {
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

function summarizeCompliance(latestResult: Record<string, unknown> | null, benchmarkSummary: ReturnType<typeof summarizeBenchmark>) {
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

function summarizeConsolidation(result: Record<string, unknown> | null) {
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

function summarizeToolResult(result: Record<string, unknown> | null) {
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

function StatusBadge({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  return <span className={`status-badge tone-${tone}`}>{children}</span>;
}

function RawDisclosure({ title, payload }: { title: string; payload: Record<string, unknown> | unknown[] }) {
  return (
    <details className="raw-disclosure">
      <summary>{title}</summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty-card">{children}</div>;
}

export function OperatorConsole({ operatorId }: { operatorId: string }) {
  const [view, setView] = useState<ViewKey>("dashboard");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSnapshot>({});
  const [selectedToolName, setSelectedToolName] = useState<string>("validate_task_header");
  const [formValues, setFormValues] = useState<StoredInputs>({});
  const [recentResults, setRecentResults] = useState<StoredResults>({});
  const [liveResult, setLiveResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmMutation, setConfirmMutation] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);

  useEffect(() => {
    setFormValues(parseStoredJson<StoredInputs>(RECENT_INPUTS_KEY, {}));
    setRecentResults(parseStoredJson<StoredResults>(RECENT_RESULTS_KEY, {}));
  }, []);

  useEffect(() => {
    if (!bootstrap) {
      void loadBootstrap();
    }
  }, [bootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(RECENT_INPUTS_KEY, JSON.stringify(formValues));
  }, [formValues]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(RECENT_RESULTS_KEY, JSON.stringify(recentResults));
  }, [recentResults]);

  const selectedTool = useMemo(
    () => bootstrap?.tools.find((tool) => tool.name === selectedToolName) || bootstrap?.tools[0] || null,
    [bootstrap, selectedToolName]
  );

  const activeResult = liveResult ?? (selectedTool ? recentResults[selectedTool.name] ?? null : null);
  const benchmarkSummary = useMemo(() => summarizeBenchmark(dashboard.benchmark), [dashboard.benchmark]);
  const delegationSummary = useMemo(() => summarizeDelegation(dashboard.delegation), [dashboard.delegation]);
  const complianceSummary = useMemo(
    () => summarizeCompliance(activeResult, benchmarkSummary),
    [activeResult, benchmarkSummary]
  );
  const consolidationResult =
    liveResult && ("consolidationStatement" in liveResult || "classification" in liveResult)
      ? liveResult
      : (recentResults.generate_consolidation ?? null);
  const consolidationSummary = useMemo(
    () => summarizeConsolidation(consolidationResult),
    [consolidationResult]
  );
  const toolResultSummary = useMemo(() => summarizeToolResult(activeResult), [activeResult]);

  async function loadBootstrap() {
    setLoading(true);
    setError(null);

    try {
      const [bootstrapResponse, activityResponse] = await Promise.all([
        fetch("/api/mcp/tools", { cache: "no-store" }),
        fetch("/api/activity", { cache: "no-store" }),
      ]);

      if (!bootstrapResponse.ok) {
        throw new Error("Failed to load tool catalog.");
      }

      if (!activityResponse.ok) {
        throw new Error("Failed to load recent activity.");
      }

      const bootstrapPayload = (await bootstrapResponse.json()) as BootstrapPayload;
      const activityPayload = (await activityResponse.json()) as { activity: ActivityLogEntry[] };

      setBootstrap(bootstrapPayload);
      setActivity(activityPayload.activity);
      setSelectedToolName((previous) => previous || bootstrapPayload.tools[0]?.name || "validate_task_header");
      await loadDashboard(bootstrapPayload);
      setLastRefreshAt(new Date().toISOString());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load console.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard(currentBootstrap = bootstrap) {
    if (!currentBootstrap) {
      return;
    }

    const benchmarkPromise = currentBootstrap.defaults.benchmarkTestPath
      ? runTool(
          "benchmark_status",
          {
            testPath: currentBootstrap.defaults.benchmarkTestPath,
            action: "report",
          },
          false
        )
      : Promise.resolve(undefined);

    const delegationPromise = runTool("delegation_chain_state", { action: "get" }, false);

    const [benchmark, delegation] = await Promise.all([benchmarkPromise, delegationPromise]);

    setDashboard((previous) => ({
      ...previous,
      benchmark,
      delegation,
    }));
    setLastRefreshAt(new Date().toISOString());
  }

  async function runTool(
    toolName: string,
    payload: Record<string, unknown>,
    useLoadingState = true,
    confirmed = false
  ) {
    if (useLoadingState) {
      setLoading(true);
      setError(null);
    }

    try {
      const response = await fetch("/api/mcp/call", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          toolName,
          arguments: payload,
          confirmMutation: confirmed,
        }),
      });

      const result = (await response.json()) as {
        success?: boolean;
        structuredContent?: Record<string, unknown>;
        error?: { message?: string };
      };

      if (!response.ok || !result.structuredContent) {
        throw new Error(result.error?.message || "Tool execution failed.");
      }

      if (useLoadingState) {
        setLiveResult(result.structuredContent);
        setRecentResults((previous) => ({
          ...previous,
          [toolName]: result.structuredContent as Record<string, unknown>,
        }));
        setLastRefreshAt(new Date().toISOString());
      }

      return result.structuredContent;
    } catch (runError) {
      if (useLoadingState) {
        setError(runError instanceof Error ? runError.message : "Tool execution failed.");
      }

      throw runError;
    } finally {
      if (useLoadingState) {
        setLoading(false);
      }
    }
  }

  function currentFormValues(): Record<string, string> {
    if (!selectedTool || !bootstrap) {
      return {};
    }

    const saved = formValues[selectedTool.name] || {};
    return Object.fromEntries(
      selectedTool.fields.map((field) => [
        field.name,
        saved[field.name] ?? inferDefaultValue(selectedTool, field, bootstrap.defaults),
      ])
    );
  }

  async function submitSelectedTool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedTool || !bootstrap) {
      return;
    }

    const currentValues = currentFormValues();
    const payload: Record<string, unknown> = {};

    for (const field of selectedTool.fields) {
      const rawValue = currentValues[field.name] ?? "";
      const trimmed = rawValue.trim();

      if (!trimmed && !field.required) {
        continue;
      }

      payload[field.name] = normalizeFieldValue(field, trimmed);
    }

    const requiresConfirmation = isMutation(selectedTool.name, payload);
    if (requiresConfirmation && !confirmMutation) {
      setError("Mutation tools require explicit confirmation.");
      return;
    }

    setFormValues((previous) => ({
      ...previous,
      [selectedTool.name]: currentValues,
    }));

    await runTool(selectedTool.name, payload, true, confirmMutation);
    await loadBootstrap();
  }

  function updateField(fieldName: string, value: string) {
    if (!selectedTool) {
      return;
    }

    setFormValues((previous) => ({
      ...previous,
      [selectedTool.name]: {
        ...currentFormValues(),
        [fieldName]: value,
      },
    }));
  }

  async function signOut() {
    await fetch("/api/session/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function renderDashboard() {
    const compliancePosture = complianceSummary.findings;
    const recentActivity = activity.slice(0, 4);
    const benchmarkHeadline = benchmarkSummary.hasCachedRun ? String(benchmarkSummary.passing) : "—";
    const benchmarkSubtle = benchmarkSummary.hasCachedRun
      ? `${benchmarkSummary.failing} failing · ${benchmarkSummary.notImplemented} pending`
      : "No cached benchmark run";

    return (
      <section className="workspace-stack">
        <section className="hero-panel">
          <div className="hero-copy">
            <div className="meta-chip">MASA / authenticated operator surface</div>
            <h2>System posture, delegation flow, and review truth in one place.</h2>
            <p>
              A compressed operator surface for benchmark state, delegation pressure, compliance posture,
              and authenticated MCP traffic.
            </p>
          </div>
          <div className="hero-signal">
            <span className="signal-label">Capability statement</span>
            <p>{benchmarkSummary.capabilityStatement}</p>
            <div className="signal-chip-row">
              <StatusBadge tone={benchmarkSummary.consolidationEligible ? "success" : "warning"}>
                {benchmarkSummary.consolidationEligible ? "Consolidation ready" : "Not consolidation-ready"}
              </StatusBadge>
              <StatusBadge tone={toneForState(benchmarkSummary.notationCompliance)}>
                Notation {benchmarkSummary.notationCompliance}
              </StatusBadge>
            </div>
          </div>
        </section>

        <div className="metric-grid compact-metric-grid">
          <article className="metric-card metric-card-emphasis">
            <span className="metric-label">Transport</span>
            <strong>{asString(bootstrap?.health?.transport)}</strong>
            <span className="metric-subtle">Auth {asString(bootstrap?.health?.authMode)}</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Benchmark state</span>
            <strong>{benchmarkHeadline}</strong>
            <span className="metric-subtle">{benchmarkSubtle}</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Delegation state</span>
            <strong>{delegationSummary.tasks.length}</strong>
            <span className="metric-subtle">{delegationSummary.blockers.length} blockers tracked</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Compatibility</span>
            <strong>{asString(bootstrap?.health?.consoleCompatibilityVersion)}</strong>
            <span className="metric-subtle">Console handshake contract</span>
          </article>
        </div>

        <div className="dashboard-grid">
          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">System posture</span>
                <h3>Backend trust boundary</h3>
              </div>
            </header>
            <dl className="data-list">
              <div>
                <dt>Health</dt>
                <dd><StatusBadge tone="success">Healthy</StatusBadge></dd>
              </div>
              <div>
                <dt>Transport</dt>
                <dd>{asString(bootstrap?.health?.transport)}</dd>
              </div>
              <div>
                <dt>Auth mode</dt>
                <dd>{asString(bootstrap?.health?.authMode)}</dd>
              </div>
              <div>
                <dt>MCP path</dt>
                <dd>{asString(bootstrap?.health?.path)}</dd>
              </div>
              <div>
                <dt>Last refresh</dt>
                <dd>{formatRelativeTime(lastRefreshAt)}</dd>
              </div>
            </dl>
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Benchmark state</span>
                <h3>B1-B6 cached posture</h3>
              </div>
              <button className="secondary-button" onClick={() => void loadDashboard()}>
                Refresh
              </button>
            </header>
            {benchmarkSummary.tiles.length === 0 ? (
              <EmptyState>No benchmark run cached.</EmptyState>
            ) : (
              <div className="mini-tile-grid">
                {benchmarkSummary.tiles.map((tile) => (
                  <article key={tile.id} className="mini-tile">
                    <div className="mini-tile-header">
                      <strong>{tile.id}</strong>
                      <StatusBadge tone={toneForState(tile.status)}>{tile.status}</StatusBadge>
                    </div>
                    <span>Expected {String(tile.expected ?? "—")}</span>
                    <span>Actual {String(tile.actual ?? "—")}</span>
                  </article>
                ))}
              </div>
            )}
            <RawDisclosure title="View raw benchmark payload" payload={benchmarkSummary.raw} />
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Delegation state</span>
                <h3>Live queues and blockers</h3>
              </div>
            </header>
            <div className="status-chip-row">
              {Object.keys(delegationSummary.statusCounts).length === 0 ? (
                <EmptyState>No delegation tasks recorded.</EmptyState>
              ) : (
                Object.entries(delegationSummary.statusCounts).map(([status, count]) => (
                  <StatusBadge key={status} tone={toneForState(status)}>
                    {status} · {count}
                  </StatusBadge>
                ))
              )}
            </div>
            <div className="summary-subgrid">
              <div className="summary-block">
                <span className="summary-label">Active agents</span>
                <p>{delegationSummary.activeAgents.join(", ") || "No active agents recorded."}</p>
              </div>
              <div className="summary-block">
                <span className="summary-label">Blockers</span>
                {delegationSummary.blockers.length === 0 ? (
                  <p>No blockers recorded.</p>
                ) : (
                  <div className="chip-stack">
                    {delegationSummary.blockers.slice(0, 4).map((blocker) => (
                      <StatusBadge key={blocker} tone="warning">
                        {blocker}
                      </StatusBadge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <RawDisclosure title="View raw delegation payload" payload={delegationSummary.raw} />
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Compliance posture</span>
                <h3>Claim discipline signals</h3>
              </div>
            </header>
            <div className="signal-row">
              {compliancePosture.map((entry) => (
                <div key={entry.label} className="signal-cell">
                  <span>{entry.label}</span>
                  <StatusBadge tone={entry.tone}>{entry.value}</StatusBadge>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card panel-card-wide">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Recent activity</span>
                <h3>Authenticated MCP traffic</h3>
              </div>
            </header>
            {recentActivity.length === 0 ? (
              <EmptyState>No recent audit traffic.</EmptyState>
            ) : (
              <div className="activity-table">
                {recentActivity.map((entry) => (
                  <div key={entry.requestId} className="activity-row">
                    <div>
                      <strong>{entry.toolName}</strong>
                      <span>{entry.callerId || "operator"}</span>
                    </div>
                    <StatusBadge tone={toneForState(entry.outcome)}>{entry.outcome}</StatusBadge>
                    <time>{formatTimestamp(entry.timestamp)}</time>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>
    );
  }

  function renderDelegation() {
    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">Delegation / live state</div>
            <h2>Task ledger and transition detail</h2>
          </div>
          <button className="secondary-button" onClick={() => void loadDashboard()}>
            Refresh queues
          </button>
        </div>

        <div className="panel-grid split-panel-grid">
          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Task ledger</span>
                <h3>Current tracked tasks</h3>
              </div>
            </header>
            {delegationSummary.tasks.length === 0 ? (
              <EmptyState>No delegation tasks recorded yet.</EmptyState>
            ) : (
              <div className="ledger-table">
                {delegationSummary.tasks.map((task) => {
                  const history = asArray<Record<string, unknown>>(task.history);
                  return (
                    <details key={String(task.taskId)} className="ledger-row">
                      <summary>
                        <div className="ledger-main">
                          <strong>{asString(task.taskId)}</strong>
                          <span>{asString(task.taskType)}</span>
                        </div>
                        <div className="ledger-meta">
                          <StatusBadge tone={toneForState(asString(task.currentStatus))}>
                            {asString(task.currentStatus)}
                          </StatusBadge>
                          <span>{asString(task.currentAgent, "unassigned")}</span>
                        </div>
                      </summary>
                      <div className="ledger-detail">
                        <div className="detail-grid">
                          <div>
                            <span className="summary-label">History depth</span>
                            <p>{history.length} transitions</p>
                          </div>
                          <div>
                            <span className="summary-label">Current owner</span>
                            <p>{asString(task.currentAgent, "unassigned")}</p>
                          </div>
                        </div>
                        {history.length === 0 ? (
                          <EmptyState>No transition history captured.</EmptyState>
                        ) : (
                          <div className="history-list">
                            {history.map((entry, index) => (
                              <div key={`${String(task.taskId)}-${index}`} className="history-item">
                                <div className="history-heading">
                                  <StatusBadge tone={toneForState(asString(entry.status))}>
                                    {asString(entry.status)}
                                  </StatusBadge>
                                  <time>{formatTimestamp(entry.timestamp)}</time>
                                </div>
                                <p>{asString(entry.notes, "No notes recorded.")}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Blockers</span>
                <h3>Items preventing clean completion</h3>
              </div>
            </header>
            {delegationSummary.blockers.length === 0 ? (
              <EmptyState>No blockers recorded.</EmptyState>
            ) : (
              <div className="chip-stack">
                {delegationSummary.blockers.map((blocker) => (
                  <StatusBadge key={blocker} tone="warning">
                    {blocker}
                  </StatusBadge>
                ))}
              </div>
            )}
            <RawDisclosure title="View raw delegation payload" payload={delegationSummary.raw} />
          </article>
        </div>
      </section>
    );
  }

  function renderBenchmarks() {
    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">Benchmarks / B1-B6</div>
            <h2>Deterministic evidence board</h2>
          </div>
          <button
            className="primary-button"
            onClick={() =>
              bootstrap?.defaults.benchmarkTestPath
                ? void runTool(
                    "benchmark_status",
                    {
                      testPath: bootstrap.defaults.benchmarkTestPath,
                      action: "run",
                    },
                    true
                  ).then(() => loadDashboard())
                : undefined
            }
          >
            Run benchmark suite
          </button>
        </div>

        <div className="panel-grid split-panel-grid">
          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Benchmark board</span>
                <h3>Current B1-B6 statuses</h3>
              </div>
            </header>
            {benchmarkSummary.tiles.length === 0 ? (
              <EmptyState>No benchmark run cached.</EmptyState>
            ) : (
              <div className="benchmark-board">
                {benchmarkSummary.tiles.map((tile) => (
                  <article key={tile.id} className="benchmark-tile">
                    <div className="benchmark-head">
                      <strong>{tile.id}</strong>
                      <StatusBadge tone={toneForState(tile.status)}>{tile.status}</StatusBadge>
                    </div>
                    <div className="benchmark-meta">
                      <span>Expected {String(tile.expected ?? "—")}</span>
                      <span>Actual {String(tile.actual ?? "—")}</span>
                      <span>{tile.lastRun}</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Decision panel</span>
                <h3>Capability and gating</h3>
              </div>
            </header>
            <div className="signal-text">{benchmarkSummary.capabilityStatement}</div>
            <div className="status-chip-row">
              <StatusBadge tone={toneForState(benchmarkSummary.llmIndependence)}>
                LLM independence · {benchmarkSummary.llmIndependence}
              </StatusBadge>
              <StatusBadge tone={toneForState(benchmarkSummary.notationCompliance)}>
                Notation · {benchmarkSummary.notationCompliance}
              </StatusBadge>
              <StatusBadge tone={benchmarkSummary.consolidationEligible ? "success" : "warning"}>
                {benchmarkSummary.consolidationEligible ? "Eligible" : "Not eligible"}
              </StatusBadge>
            </div>
            <p className="support-copy">Last benchmark update: {benchmarkSummary.updatedAt}</p>
            <RawDisclosure title="View raw benchmark payload" payload={benchmarkSummary.raw} />
          </article>
        </div>
      </section>
    );
  }

  function renderCompliance() {
    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">Compliance / evidence-aware</div>
            <h2>Claim discipline and repo guardrails</h2>
          </div>
        </div>

        <div className="panel-grid split-panel-grid">
          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Quick actions</span>
                <h3>Common compliance scans</h3>
              </div>
            </header>
            <div className="action-grid">
              <button
                className="secondary-button"
                onClick={() =>
                  bootstrap
                    ? void runTool("check_notation_compliance", {
                        path: bootstrap.defaults.engineRoot || bootstrap.defaults.auditRoot,
                        scope: "v1.0-engine",
                      })
                    : undefined
                }
              >
                Run notation scan
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  bootstrap
                    ? void runTool("llm_independence_check", {
                        enginePath: bootstrap.defaults.engineRoot,
                      })
                    : undefined
                }
              >
                Run LLM independence
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  bootstrap
                    ? void runTool("validate_assumption_envelope", {
                        path: bootstrap.defaults.engineRoot,
                      })
                    : undefined
                }
              >
                Validate assumptions
              </button>
            </div>
            <div className="signal-row">
              {complianceSummary.findings.map((entry) => (
                <div key={entry.label} className="signal-cell">
                  <span>{entry.label}</span>
                  <StatusBadge tone={entry.tone}>{entry.value}</StatusBadge>
                </div>
              ))}
            </div>
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Latest findings</span>
                <h3>Operator-safe summary</h3>
              </div>
            </header>
            {complianceSummary.violations.length === 0 ? (
              <EmptyState>
                {activeResult ? "No structured violations were returned for the latest compliance action." : "Run a compliance action to populate findings."}
              </EmptyState>
            ) : (
              <div className="finding-list">
                {complianceSummary.violations.map((violation) => (
                  <article key={`${violation.file}-${violation.title}`} className="finding-card">
                    <div className="finding-head">
                      <StatusBadge tone={toneForState(violation.severity)}>{violation.severity}</StatusBadge>
                      <strong>{violation.title}</strong>
                    </div>
                    <p>{violation.message}</p>
                    <span className="finding-path">{violation.file}</span>
                    <span className="finding-suggestion">{violation.suggestion}</span>
                  </article>
                ))}
              </div>
            )}
            <RawDisclosure title="View raw compliance payload" payload={complianceSummary.raw} />
          </article>
        </div>
      </section>
    );
  }

  function renderConsolidation() {
    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">Consolidation / review cycle</div>
            <h2>Readiness statement and blocker scope</h2>
          </div>
          <button
            className="primary-button"
            onClick={() => void runTool("generate_consolidation", { cycleNumber: 1 })}
          >
            Generate cycle 1 statement
          </button>
        </div>

        <div className="panel-grid split-panel-grid">
          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Readiness statement</span>
                <h3>Latest consolidation output</h3>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(consolidationSummary.statement)}
              >
                Copy statement
              </button>
            </header>
            <div className="signal-text">{consolidationSummary.statement}</div>
            <div className="status-chip-row">
              <StatusBadge tone={toneForState(consolidationSummary.classification)}>
                {consolidationSummary.classification}
              </StatusBadge>
            </div>
            <p className="support-copy">{consolidationSummary.capabilityStatement}</p>
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Blockers and overclaims</span>
                <h3>Review detail</h3>
              </div>
            </header>
            <div className="summary-subgrid">
              <div className="summary-block">
                <span className="summary-label">Overclaims</span>
                {consolidationSummary.overclaims.length === 0 ? (
                  <p>No overclaims reported.</p>
                ) : (
                  <ul className="bullet-list">
                    {consolidationSummary.overclaims.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="summary-block">
                <span className="summary-label">Blockers</span>
                {consolidationSummary.blockers.length === 0 ? (
                  <p>No blockers recorded.</p>
                ) : (
                  <ul className="bullet-list">
                    {consolidationSummary.blockers.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <RawDisclosure title="View raw consolidation payload" payload={consolidationSummary.raw} />
          </article>
        </div>
      </section>
    );
  }

  function renderToolRunner() {
    const values = currentFormValues();

    if (!selectedTool) {
      return <EmptyState>No tool selected.</EmptyState>;
    }

    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">
              {selectedTool.category} / risk {selectedTool.riskLevel}
            </div>
            <h2>{selectedTool.displayName}</h2>
          </div>
        </div>

        <div className="panel-grid split-panel-grid">
          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Structured input</span>
                <h3>{selectedTool.summary}</h3>
              </div>
            </header>

            <form className="tool-form" onSubmit={(event) => void submitSelectedTool(event)}>
              {selectedTool.fields.map((field) => (
                <label key={field.name}>
                  <span>{field.label}</span>
                  {field.kind === "textarea" || field.kind === "string-array" ? (
                    <textarea
                      rows={field.rows || 4}
                      value={values[field.name] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) => updateField(field.name, event.target.value)}
                    />
                  ) : field.kind === "select" ? (
                    <select
                      value={values[field.name] ?? ""}
                      onChange={(event) => updateField(field.name, event.target.value)}
                    >
                      <option value="">Select…</option>
                      {(field.options || []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.kind === "number" ? "number" : "text"}
                      value={values[field.name] ?? ""}
                      placeholder={field.placeholder}
                      onChange={(event) => updateField(field.name, event.target.value)}
                    />
                  )}
                </label>
              ))}

              {selectedTool.mutatesState ? (
                <label className="confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmMutation}
                    onChange={(event) => setConfirmMutation(event.target.checked)}
                  />
                  <span>I confirm this state-changing action is intentional.</span>
                </label>
              ) : null}

              <div className="form-actions">
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? "Running…" : "Run tool"}
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setLiveResult(recentResults[selectedTool.name] ?? null)}
                >
                  Load last result
                </button>
              </div>
            </form>
          </article>

          <article className="panel-card">
            <header className="panel-heading">
              <div>
                <span className="eyebrow">Result viewer</span>
                <h3>{toolResultSummary.label}</h3>
              </div>
              <StatusBadge tone={toolResultSummary.tone}>{toolResultSummary.label}</StatusBadge>
            </header>

            {toolResultSummary.details.length === 0 ? (
              <EmptyState>No result cached for this tool yet.</EmptyState>
            ) : (
              <div className="data-list compact-data-list">
                {toolResultSummary.details.map((detail) => (
                  <div key={detail.label}>
                    <dt>{detail.label}</dt>
                    <dd>{detail.value}</dd>
                  </div>
                ))}
              </div>
            )}

            <RawDisclosure
              title="View raw tool result"
              payload={activeResult ?? recentResults[selectedTool.name] ?? {}}
            />
          </article>
        </div>
      </section>
    );
  }

  return (
    <main className="console-shell overhaul-shell">
      <aside className="console-nav compact-nav">
        <div className="nav-brand">
          <div className="meta-chip">MASA / workbench</div>
          <div>
            <h1>Operator Console</h1>
            <p>Minimal review surface for benchmark truth, delegation flow, and guarded MCP execution.</p>
          </div>
        </div>

        <div className="nav-identity">
          <div>
            <span className="summary-label">Operator</span>
            <strong>{operatorId}</strong>
          </div>
          <div>
            <span className="summary-label">Transport</span>
            <StatusBadge tone={toneForState(asString(bootstrap?.health?.transport, "http"))}>
              {asString(bootstrap?.health?.transport)}
            </StatusBadge>
          </div>
        </div>

        <nav className="nav-stack">
          {VIEW_ORDER.map((item) => (
            <button
              key={item.key}
              className={`nav-link ${view === item.key ? "active" : ""}`}
              onClick={() => setView(item.key)}
            >
              <span>{item.label}</span>
              <small>{item.eyebrow}</small>
            </button>
          ))}
        </nav>
      </aside>

      <section className="console-workspace">
        <div className="utility-strip">
          <div className="utility-cluster">
            <StatusBadge tone="success">Backend healthy</StatusBadge>
            <StatusBadge tone={toneForState(asString(bootstrap?.health?.authMode, "bearer"))}>
              Auth {asString(bootstrap?.health?.authMode)}
            </StatusBadge>
            <span className="utility-meta">{formatRelativeTime(lastRefreshAt)}</span>
          </div>
          <div className="utility-cluster">
            <button className="secondary-button" onClick={() => void loadBootstrap()}>
              {loading ? "Refreshing…" : "Refresh console"}
            </button>
            <button className="secondary-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>

        {error ? <div className="warning-card">{error}</div> : null}
        {view === "dashboard" && renderDashboard()}
        {view === "delegation" && renderDelegation()}
        {view === "benchmarks" && renderBenchmarks()}
        {view === "compliance" && renderCompliance()}
        {view === "consolidation" && renderConsolidation()}
        {view === "tool-runner" && renderToolRunner()}
      </section>

      <aside className="console-rail sticky-rail">
        <article className="rail-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Recent activity</span>
                <h3>Authenticated MCP traffic</h3>
            </div>
          </header>
          <div className="timeline-list">
            {activity.length === 0 ? (
              <EmptyState>No recent audit traffic.</EmptyState>
            ) : (
              activity.slice(0, 6).map((entry) => (
                <div key={entry.requestId} className="timeline-item compact-timeline-item">
                  <div>
                    <strong>{entry.toolName}</strong>
                    <StatusBadge tone={toneForState(entry.outcome)}>{entry.outcome}</StatusBadge>
                  </div>
                  <p>{formatTimestamp(entry.timestamp)}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rail-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Trust rail</span>
              <h3>Provenance defaults</h3>
            </div>
          </header>
          <ul className="signal-list">
            <li>Browser traffic never carries the MCP bearer token.</li>
            <li>State mutations require explicit confirmation before dispatch.</li>
            <li>Raw JSON stays available, but only as secondary evidence.</li>
            <li>Recent results persist locally to preserve operator continuity.</li>
          </ul>
        </article>

        <article className="rail-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Evidence inspector</span>
              <h3>Current raw payload</h3>
            </div>
          </header>
          <RawDisclosure title="Open structured payload" payload={activeResult ?? dashboard.benchmark ?? {}} />
        </article>
      </aside>
    </main>
  );
}
