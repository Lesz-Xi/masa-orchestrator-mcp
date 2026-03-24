"use client";

import { useEffect, useMemo, useState } from "react";

import type { ActivityLogEntry } from "../lib/catalog";

import { DashboardView } from "./console/dashboard-view";
import {
  BenchmarksView,
  ComplianceView,
  ConsolidationView,
  DelegationView,
} from "./console/operational-views";
import { StatusBadge } from "./console/primitives";
import { ToolRunnerView } from "./console/tool-runner-view";
import { TrustRail } from "./console/trust-rail";
import {
  VIEW_ORDER,
  asString,
  formatRelativeTime,
  inferDefaultValue,
  isMutation,
  normalizeFieldValue,
  parseStoredJson,
  summarizeBenchmark,
  summarizeCompliance,
  summarizeConsolidation,
  summarizeDelegation,
  summarizeToolResult,
  toneForState,
  type BootstrapPayload,
  type DashboardSnapshot,
  type StoredInputs,
  type StoredResults,
  type ViewKey,
} from "./console/view-models";

const RECENT_INPUTS_KEY = "masa.console.recentInputs";
const RECENT_RESULTS_KEY = "masa.console.recentResults";

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
  const activePayload = activeResult ?? {};

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
        ).catch(() => undefined)
      : Promise.resolve(undefined);

    const delegationPromise = runTool("delegation_chain_state", { action: "get" }, false).catch(
      () => undefined
    );

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

    if (!selectedTool) {
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

  function renderCurrentView() {
    switch (view) {
      case "delegation":
        return <DelegationView delegationSummary={delegationSummary} onRefresh={() => void loadDashboard()} />;
      case "benchmarks":
        return (
          <BenchmarksView
            bootstrap={bootstrap}
            benchmarkSummary={benchmarkSummary}
            onRun={() =>
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
          />
        );
      case "compliance":
        return (
          <ComplianceView
            bootstrap={bootstrap}
            complianceSummary={complianceSummary}
            activeResult={activeResult}
            onRunNotation={() =>
              bootstrap
                ? void runTool("check_notation_compliance", {
                    path: bootstrap.defaults.engineRoot || bootstrap.defaults.auditRoot,
                    scope: "v1.0-engine",
                  })
                : undefined
            }
            onRunIndependence={() =>
              bootstrap
                ? void runTool("llm_independence_check", {
                    enginePath: bootstrap.defaults.engineRoot,
                  })
                : undefined
            }
            onValidateAssumptions={() =>
              bootstrap
                ? void runTool("validate_assumption_envelope", {
                    path: bootstrap.defaults.engineRoot,
                  })
                : undefined
            }
          />
        );
      case "consolidation":
        return (
          <ConsolidationView
            consolidationSummary={consolidationSummary}
            onGenerate={() => void runTool("generate_consolidation", { cycleNumber: 1 })}
            onCopy={() => void navigator.clipboard?.writeText(consolidationSummary.statement)}
          />
        );
      case "tool-runner":
        return (
          <ToolRunnerView
            selectedTool={selectedTool}
            values={currentFormValues()}
            loading={loading}
            confirmMutation={confirmMutation}
            onConfirmMutation={setConfirmMutation}
            onSubmit={(event) => void submitSelectedTool(event)}
            onUpdateField={updateField}
            onLoadLastResult={() => setLiveResult(selectedTool ? recentResults[selectedTool.name] ?? null : null)}
            toolResultSummary={toolResultSummary}
            activePayload={activePayload}
          />
        );
      case "dashboard":
      default:
        return (
          <DashboardView
            bootstrap={bootstrap}
            benchmarkSummary={benchmarkSummary}
            delegationSummary={delegationSummary}
            complianceSummary={complianceSummary}
            activity={activity}
            lastRefreshAt={lastRefreshAt}
            onRefresh={() => void loadBootstrap()}
          />
        );
    }
  }

  return (
    <main className="workbench-shell cinematic-shell">
      <aside className="workbench-nav">
        <div className="nav-brand">
          <div className="meta-chip">MASA / workbench</div>
          <div className="brand-stack">
            <h1>Operator Console</h1>
            <p>Minimal review surface for benchmark truth, delegation flow, and guarded MCP execution.</p>
          </div>
        </div>

        <div className="nav-context-card">
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

        <nav className="nav-cluster">
          {VIEW_ORDER.map((item) => (
            <button
              key={item.key}
              className={`nav-link ${view === item.key ? "active" : ""}`}
              onClick={() => {
                setView(item.key);
                if (item.key === "tool-runner" && bootstrap?.tools[0] && !selectedToolName) {
                  setSelectedToolName(bootstrap.tools[0].name);
                }
              }}
              type="button"
            >
              <strong>{item.label}</strong>
              <span>{item.eyebrow}</span>
            </button>
          ))}
        </nav>

        {bootstrap?.tools.length ? (
          <div className="nav-tool-picker">
            <span className="summary-label">Active tool</span>
            <select
              value={selectedToolName}
              onChange={(event) => {
                setSelectedToolName(event.target.value);
                setView("tool-runner");
              }}
            >
              {bootstrap.tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.displayName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </aside>

      <section className="workbench-main">
        <header className="utility-strip refined-utility">
          <div className="utility-left">
            <StatusBadge tone="success">Backend healthy</StatusBadge>
            <StatusBadge tone={toneForState(asString(bootstrap?.health?.authMode, "bearer"))}>
              Auth {asString(bootstrap?.health?.authMode)}
            </StatusBadge>
            <span className="utility-meta">{formatRelativeTime(lastRefreshAt)}</span>
          </div>

          <div className="utility-right">
            {error ? <span className="error-banner">{error}</span> : null}
            <div className="utility-actions">
              <button className="secondary-button" onClick={() => void loadBootstrap()}>
                {loading ? "Refreshing…" : "Refresh console"}
              </button>
              <button className="secondary-button" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="workspace-stage">
          <div className="workspace-stage-scroll">{renderCurrentView()}</div>
        </div>
      </section>

      <aside className="workbench-rail">
        <TrustRail
          activity={activity}
          lastRefreshAt={lastRefreshAt}
          activeToolName={selectedTool?.displayName ?? "No tool selected"}
          toolResultSummary={toolResultSummary}
          activePayload={activePayload}
        />
      </aside>
    </main>
  );
}
