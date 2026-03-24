import { SystemStatusBar } from "../ui/SystemStatusBar";
import { SkeletonPanel } from "../ui/SkeletonPanel";
import { StatusChip } from "../ui/StatusChip";
import type { DashboardDataState } from "../../hooks/useDashboardData";
import type { ViewKey } from "../../types/responses";

interface DashboardViewProps {
  dashboard: DashboardDataState;
  onNavigate: (view: ViewKey) => void;
}

export function DashboardView({ dashboard, onNavigate }: DashboardViewProps) {
  const { benchmark, delegation, health, loading } = dashboard;

  return (
    <section className="workspace-stack">
      <div className="section-heading">
        <div>
          <div className="meta-chip">Dashboard / overview</div>
          <h2>System state</h2>
        </div>
        <button className="secondary-button" onClick={() => void dashboard.refresh()}>
          Refresh
        </button>
      </div>

      <SystemStatusBar
        health={health}
        benchmark={benchmark}
        delegation={delegation}
        loading={loading}
      />

      <div className="panel-grid">
        {/* Benchmark posture */}
        <article className="panel-card">
          <header>
            <div>
              <h3>Benchmark posture</h3>
              <p>B1–B6 deterministic evidence summary.</p>
            </div>
            <button
              className="secondary-button"
              onClick={() => onNavigate("benchmarks")}
            >
              Full view →
            </button>
          </header>
          {loading && !benchmark ? (
            <SkeletonPanel lines={4} />
          ) : benchmark ? (
            <div className="bench-summary">
              <div className="metric-grid">
                {(["B1", "B2", "B3", "B4", "B5", "B6"] as const).map((id) => {
                  const result = benchmark.benchmarks[id];
                  return (
                    <div key={id} className="bench-mini-card" data-status={result.status}>
                      <span className="metric-label">{id}</span>
                      <span className="bench-status-dot" data-status={result.status} />
                      <span className="bench-mini-status">
                        {result.status === "not_implemented"
                          ? "—"
                          : result.status === "passing"
                          ? "✓"
                          : "✗"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {benchmark.honestCapabilityStatement && (
                <p className="signal-text" style={{ marginTop: "12px" }}>
                  {benchmark.honestCapabilityStatement}
                </p>
              )}
            </div>
          ) : (
            <div className="empty-card">No benchmark snapshot. Run benchmarks to populate.</div>
          )}
        </article>

        {/* Delegation queues */}
        <article className="panel-card">
          <header>
            <div>
              <h3>Delegation queues</h3>
              <p>Live task and blocker state.</p>
            </div>
            <button
              className="secondary-button"
              onClick={() => onNavigate("delegation")}
            >
              Full view →
            </button>
          </header>
          {loading && !delegation ? (
            <SkeletonPanel lines={4} />
          ) : delegation ? (
            <div>
              {delegation.tasks.length === 0 ? (
                <div className="empty-card">No delegation tasks recorded.</div>
              ) : (
                <div className="task-mini-list">
                  {delegation.tasks.slice(0, 5).map((task) => (
                    <div key={task.taskId} className="task-mini-row">
                      <span className="meta-chip">{task.taskId}</span>
                      <StatusChip status={task.currentStatus} />
                      <span className="task-mini-agent">{task.currentAgent}</span>
                    </div>
                  ))}
                  {delegation.tasks.length > 5 && (
                    <p className="task-mini-more">
                      +{delegation.tasks.length - 5} more tasks
                    </p>
                  )}
                </div>
              )}
              {delegation.blockers.length > 0 && (
                <div className="blocker-summary">
                  <span className="blocker-label">
                    {delegation.blockers.length} blocker{delegation.blockers.length > 1 ? "s" : ""}
                  </span>
                  {delegation.blockers.slice(0, 2).map((b, i) => (
                    <p key={i} className="blocker-item">{b}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="empty-card">Failed to load delegation state.</div>
          )}
        </article>
      </div>
    </section>
  );
}
