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

const VIEW_ORDER: Array<{ key: ViewKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "delegation", label: "Delegation" },
  { key: "benchmarks", label: "Benchmarks" },
  { key: "compliance", label: "Compliance" },
  { key: "consolidation", label: "Consolidation" },
  { key: "tool-runner", label: "Tool Runner" },
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
      setSelectedToolName(bootstrapPayload.tools[0]?.name || selectedToolName);
      await loadDashboard(bootstrapPayload);
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
      ? runTool("benchmark_status", {
          testPath: currentBootstrap.defaults.benchmarkTestPath,
          action: "report",
        }, false)
      : Promise.resolve(undefined);

    const delegationPromise = runTool("delegation_chain_state", { action: "get" }, false);

    const [benchmark, delegation] = await Promise.all([benchmarkPromise, delegationPromise]);

    setDashboard((previous) => ({
      ...previous,
      benchmark,
      delegation,
    }));
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
      selectedTool.fields.map((field) => [field.name, saved[field.name] ?? inferDefaultValue(selectedTool, field, bootstrap.defaults)])
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

  function renderDashboard() {
    return (
      <section className="workspace-stack">
        <div className="hero-card">
          <div className="meta-chip">Operator / {operatorId}</div>
          <h2>MASA orchestration remains a trust-first instrument.</h2>
          <p>
            Remote HTTP is authenticated, the MCP backend stays authoritative, and the console only speaks
            through the server-side proxy layer.
          </p>
        </div>

        <div className="metric-grid">
          <article className="metric-card">
            <span className="metric-label">Transport</span>
            <strong>{String(bootstrap?.health?.transport || "—")}</strong>
            <span className="metric-subtle">Auth {String(bootstrap?.health?.authMode || "—")}</span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Benchmarks</span>
            <strong>{String(dashboard.benchmark?.passing ?? "—")} passing</strong>
            <span className="metric-subtle">
              {String(dashboard.benchmark?.notImplemented ?? "—")} not implemented
            </span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Delegation Tasks</span>
            <strong>{Array.isArray(dashboard.delegation?.tasks) ? dashboard.delegation?.tasks.length : "—"}</strong>
            <span className="metric-subtle">
              {Array.isArray(dashboard.delegation?.blockers) ? dashboard.delegation?.blockers.length : "—"} blockers
            </span>
          </article>
          <article className="metric-card">
            <span className="metric-label">Compatibility</span>
            <strong>{String(bootstrap?.health?.consoleCompatibilityVersion || "—")}</strong>
            <span className="metric-subtle">Console handshake contract</span>
          </article>
        </div>

        <div className="panel-grid">
          <article className="panel-card">
            <header>
              <div>
                <h3>Benchmark posture</h3>
                <p>Current cached B1-B6 state and capability statement.</p>
              </div>
              <button className="secondary-button" onClick={() => void loadDashboard()}>
                Refresh
              </button>
            </header>
            <pre>{JSON.stringify(dashboard.benchmark ?? {}, null, 2)}</pre>
          </article>

          <article className="panel-card">
            <header>
              <div>
                <h3>Delegation queues</h3>
                <p>Live queue state from the shared orchestration file.</p>
              </div>
            </header>
            <pre>{JSON.stringify(dashboard.delegation ?? {}, null, 2)}</pre>
          </article>
        </div>
      </section>
    );
  }

  function renderDelegation() {
    const tasks = Array.isArray(dashboard.delegation?.tasks) ? (dashboard.delegation?.tasks as Array<Record<string, unknown>>) : [];

    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">Delegation / live state</div>
            <h2>Task and blocker ledger</h2>
          </div>
          <button className="secondary-button" onClick={() => void loadDashboard()}>
            Refresh queues
          </button>
        </div>
        <div className="panel-grid">
          <article className="panel-card">
            <header>
              <div>
                <h3>Tasks</h3>
                <p>Status, ownership, and transition history.</p>
              </div>
            </header>
            {tasks.length === 0 ? (
              <div className="empty-card">No delegation tasks recorded yet.</div>
            ) : (
              <div className="timeline-list">
                {tasks.map((task) => (
                  <div key={String(task.taskId)} className="timeline-item">
                    <div>
                      <strong>{String(task.taskId)}</strong>
                      <span>{String(task.currentStatus)}</span>
                    </div>
                    <p>{String(task.currentAgent)}</p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="panel-card">
            <header>
              <div>
                <h3>Blockers</h3>
                <p>Outstanding items preventing clean consolidation.</p>
              </div>
            </header>
            <pre>{JSON.stringify(dashboard.delegation?.blockers ?? [], null, 2)}</pre>
          </article>
        </div>
      </section>
    );
  }

  function renderBenchmarks() {
    const benchmark = (dashboard.benchmark ?? {}) as Record<string, unknown>;
    const benchmarkEntries = benchmark.benchmarks && typeof benchmark.benchmarks === "object"
      ? Object.entries(benchmark.benchmarks as Record<string, Record<string, unknown>>)
      : [];

    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">Benchmarks / B1-B6</div>
            <h2>Deterministic evidence status</h2>
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
        <div className="metric-grid">
          {benchmarkEntries.map(([id, result]) => (
            <article key={id} className="metric-card">
              <span className="metric-label">{id}</span>
              <strong>{String(result.status || "—")}</strong>
              <span className="metric-subtle">Expected {String(result.expectedValue || "—")}</span>
            </article>
          ))}
        </div>
        <article className="panel-card">
          <header>
            <div>
              <h3>Capability statement</h3>
              <p>Current truthful readiness output.</p>
            </div>
          </header>
          <div className="signal-text">{String(benchmark.honestCapabilityStatement || "No benchmark snapshot yet.")}</div>
        </article>
      </section>
    );
  }

  function renderCompliance() {
    return (
      <section className="workspace-stack">
        <div className="section-heading">
          <div>
            <div className="meta-chip">Compliance / evidence-aware</div>
            <h2>Notation, claim, and LLM independence controls</h2>
          </div>
        </div>
        <div className="panel-grid">
          <article className="panel-card">
            <header>
              <div>
                <h3>Fast scans</h3>
                <p>Run the most common compliance checks with repo defaults.</p>
              </div>
            </header>
            <div className="action-stack">
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
                Validate assumption envelope
              </button>
            </div>
          </article>

          <article className="panel-card">
            <header>
              <div>
                <h3>Latest result</h3>
                <p>Structured output from the current compliance action.</p>
              </div>
            </header>
            <pre>{JSON.stringify(liveResult ?? {}, null, 2)}</pre>
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
            <h2>Readiness statement and blockers</h2>
          </div>
          <button
            className="primary-button"
            onClick={() => void runTool("generate_consolidation", { cycleNumber: 1 })}
          >
            Generate cycle 1 statement
          </button>
        </div>
        <article className="panel-card">
          <header>
            <div>
              <h3>Latest consolidation result</h3>
              <p>Conservative summary from verified benchmark and blocker state.</p>
            </div>
          </header>
          <pre>{JSON.stringify(liveResult ?? recentResults.generate_consolidation ?? {}, null, 2)}</pre>
        </article>
      </section>
    );
  }

  function renderToolRunner() {
    const values = currentFormValues();

    if (!selectedTool) {
      return <div className="empty-card">No tool selected.</div>;
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

        <div className="panel-grid">
          <article className="panel-card">
            <header>
              <div>
                <h3>Structured input</h3>
                <p>{selectedTool.summary}</p>
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
                <button className="secondary-button" type="button" onClick={() => setLiveResult(recentResults[selectedTool.name] ?? null)}>
                  Load last result
                </button>
              </div>
            </form>
          </article>

          <article className="panel-card">
            <header>
              <div>
                <h3>Result</h3>
                <p>Structured JSON with the latest execution metadata.</p>
              </div>
            </header>
            <pre>{JSON.stringify(liveResult ?? recentResults[selectedTool.name] ?? {}, null, 2)}</pre>
          </article>
        </div>
      </section>
    );
  }

  return (
    <main className="console-shell">
      <aside className="console-nav">
        <div className="nav-header">
          <div className="meta-chip">MASA workbench</div>
          <h1>Orchestrator Console</h1>
          <p>Internal operator surface for guarded MCP execution.</p>
        </div>
        <nav className="nav-stack">
          {VIEW_ORDER.map((item) => (
            <button
              key={item.key}
              className={`nav-link ${view === item.key ? "active" : ""}`}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="nav-footer">
          <span className="meta-chip">Operator / {operatorId}</span>
          <span className="meta-chip">Auth / {String(bootstrap?.health?.authMode || "…")}</span>
        </div>
      </aside>

      <section className="console-workspace">
        {error ? <div className="warning-card">{error}</div> : null}
        {view === "dashboard" && renderDashboard()}
        {view === "delegation" && renderDelegation()}
        {view === "benchmarks" && renderBenchmarks()}
        {view === "compliance" && renderCompliance()}
        {view === "consolidation" && renderConsolidation()}
        {view === "tool-runner" && renderToolRunner()}
      </section>

      <aside className="console-rail">
        <article className="rail-card">
          <header>
            <div>
              <h3>Recent audit activity</h3>
              <p>Latest authenticated HTTP tool traffic.</p>
            </div>
          </header>
          <div className="timeline-list">
            {activity.length === 0 ? (
              <div className="empty-card">No audit activity recorded yet.</div>
            ) : (
              activity.map((entry) => (
                <div key={entry.requestId} className="timeline-item">
                  <div>
                    <strong>{entry.toolName}</strong>
                    <span>{entry.outcome}</span>
                  </div>
                  <p>{formatTimestamp(entry.timestamp)}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rail-card">
          <header>
            <div>
              <h3>Trust rail</h3>
              <p>Evidence, provenance, and operator-safe defaults.</p>
            </div>
          </header>
          <ul className="signal-list">
            <li>Browser traffic never carries the MCP bearer token.</li>
            <li>State mutations require explicit confirmation.</li>
            <li>Benchmark and consolidation output remain structured, not freeform.</li>
            <li>Recent runs persist locally for operator continuity.</li>
          </ul>
        </article>
      </aside>
    </main>
  );
}
