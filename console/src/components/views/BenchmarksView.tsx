import { useState } from "react";
import { BenchmarkTable } from "../ui/BenchmarkTable";
import { SkeletonPanel } from "../ui/SkeletonPanel";
import type { DashboardDataState } from "../../hooks/useDashboardData";
import type { ToolExecutionState } from "../../hooks/useToolExecution";
import type { BenchmarkSnapshot } from "../../types/responses";

interface BenchmarksViewProps {
  dashboard: DashboardDataState;
  toolExec: ToolExecutionState;
}

export function BenchmarksView({ dashboard, toolExec }: BenchmarksViewProps) {
  const { benchmark, loading } = dashboard;
  const [runResult, setRunResult] = useState<BenchmarkSnapshot | null>(null);

  async function handleRunBenchmarks() {
    const result = await toolExec.execute("benchmark_status", {
      action: "run",
      testPath: "",   // server will use configured BENCHMARK_TEST_PATH
    });
    setRunResult(result as unknown as BenchmarkSnapshot);
    await dashboard.refresh();
  }

  const activeSnapshot = runResult ?? benchmark;

  return (
    <section className="workspace-stack">
      <div className="section-heading">
        <div>
          <div className="meta-chip">Benchmarks / B1–B6</div>
          <h2>Deterministic evidence status</h2>
        </div>
        <button
          className="primary-button"
          disabled={toolExec.loading}
          onClick={() => void handleRunBenchmarks()}
        >
          {toolExec.loading ? "Running…" : "Run benchmark suite"}
        </button>
      </div>

      {loading && !activeSnapshot ? (
        <SkeletonPanel height={220} />
      ) : activeSnapshot ? (
        <>
          <div className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">Passing</span>
              <strong
                style={{
                  color:
                    activeSnapshot.passing === 6
                      ? "var(--success)"
                      : activeSnapshot.passing === 0
                      ? "var(--muted)"
                      : "var(--warning)",
                }}
              >
                {activeSnapshot.passing} / 6
              </strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">LLM independence</span>
              <strong
                data-status={activeSnapshot.llmIndependence}
                style={{
                  color:
                    activeSnapshot.llmIndependence === "verified"
                      ? "var(--success)"
                      : activeSnapshot.llmIndependence === "violation"
                      ? "var(--danger)"
                      : "var(--muted)",
                }}
              >
                {activeSnapshot.llmIndependence}
              </strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Notation</span>
              <strong
                style={{
                  color:
                    activeSnapshot.notationCompliance === "compliant"
                      ? "var(--success)"
                      : activeSnapshot.notationCompliance === "violation"
                      ? "var(--danger)"
                      : "var(--muted)",
                }}
              >
                {activeSnapshot.notationCompliance}
              </strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Consolidation</span>
              <strong
                style={{
                  color: activeSnapshot.consolidationEligible
                    ? "var(--success)"
                    : "var(--muted)",
                }}
              >
                {activeSnapshot.consolidationEligible ? "eligible" : "not ready"}
              </strong>
            </article>
          </div>

          <BenchmarkTable snapshot={activeSnapshot} />

          <article className="panel-card">
            <header>
              <div>
                <h3>Capability statement</h3>
                <p>Honest readiness output based on current evidence.</p>
              </div>
            </header>
            <p className="signal-text">{activeSnapshot.honestCapabilityStatement}</p>
          </article>
        </>
      ) : (
        <div className="empty-card">
          No benchmark snapshot found. Run the benchmark suite to generate one.
        </div>
      )}
    </section>
  );
}
