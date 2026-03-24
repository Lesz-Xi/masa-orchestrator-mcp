import type { ActivityLogEntry } from "../../lib/catalog";
import type { BootstrapPayload } from "./view-models";

import { EmptyState, RawDisclosure, StatusBadge } from "./primitives";
import { asString, formatRelativeTime, formatTimestamp, toneForState } from "./view-models";

export function DashboardView({
  bootstrap,
  benchmarkSummary,
  delegationSummary,
  complianceSummary,
  activity,
  lastRefreshAt,
  onRefresh,
}: {
  bootstrap: BootstrapPayload | null;
  benchmarkSummary: ReturnType<typeof import("./view-models").summarizeBenchmark>;
  delegationSummary: ReturnType<typeof import("./view-models").summarizeDelegation>;
  complianceSummary: ReturnType<typeof import("./view-models").summarizeCompliance>;
  activity: ActivityLogEntry[];
  lastRefreshAt: string | null;
  onRefresh: () => void;
}) {
  const recentActivity = activity.slice(0, 4);
  const benchmarkHeadline = benchmarkSummary.hasCachedRun ? String(benchmarkSummary.passing) : "—";
  const benchmarkSubtle = benchmarkSummary.hasCachedRun
    ? `${benchmarkSummary.failing} failing · ${benchmarkSummary.notImplemented} pending`
    : "No cached benchmark run";

  return (
    <section className="workspace-stack cinematic-stack">
      <section className="hero-slab">
        <div className="hero-copy cinematic-copy">
          <div className="meta-chip">MASA / authenticated operator surface</div>
          <h2>System truth, delegation pressure, and review posture in one screen.</h2>
          <p>
            A cinematic-minimal command board for benchmark posture, active delegation, compliance
            pressure, and authenticated MCP execution.
          </p>
        </div>

        <div className="hero-signal capability-slab">
          <span className="signal-label">Capability statement</span>
          <p>{benchmarkSummary.capabilityStatement}</p>
          <div className="signal-chip-row">
            <StatusBadge tone={benchmarkSummary.consolidationEligible ? "success" : "warning"}>
              {benchmarkSummary.consolidationEligible ? "Consolidation ready" : "Not consolidation-ready"}
            </StatusBadge>
            <StatusBadge tone={toneForState(benchmarkSummary.notationCompliance)}>
              Notation {benchmarkSummary.notationCompliance}
            </StatusBadge>
            <StatusBadge tone={benchmarkSummary.hasCachedRun ? "active" : "neutral"}>
              {benchmarkSummary.hasCachedRun ? benchmarkSummary.freshness : "No cached run"}
            </StatusBadge>
          </div>
        </div>
      </section>

      <div className="metric-grid compact-metric-grid cinematic-metrics">
        <article className="metric-card metric-card-emphasis">
          <span className="metric-label">Transport</span>
          <strong>{asString(bootstrap?.health?.transport)}</strong>
          <span className="metric-subtle">Auth {asString(bootstrap?.health?.authMode)}</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Benchmark posture</span>
          <strong>{benchmarkHeadline}</strong>
          <span className="metric-subtle">{benchmarkSubtle}</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Delegation pressure</span>
          <strong>{delegationSummary.tasks.length}</strong>
          <span className="metric-subtle">{delegationSummary.blockers.length} blockers tracked</span>
        </article>
        <article className="metric-card">
          <span className="metric-label">Compatibility</span>
          <strong>{asString(bootstrap?.health?.consoleCompatibilityVersion)}</strong>
          <span className="metric-subtle">Console handshake contract</span>
        </article>
      </div>

      <div className="dashboard-grid cinematic-dashboard-grid">
        <article className="panel-card panel-card-wide cinematic-summary-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">System posture</span>
              <h3>Backend trust boundary</h3>
            </div>
            <StatusBadge tone="success">Healthy</StatusBadge>
          </header>
          <dl className="data-list cinematic-data-list">
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

        <article className="panel-card cinematic-summary-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Benchmark posture</span>
              <h3>B1-B6 cached posture</h3>
            </div>
            <button className="secondary-button" onClick={onRefresh}>
              Refresh
            </button>
          </header>
          {benchmarkSummary.tiles.length === 0 ? (
            <EmptyState title="No benchmark run cached.">
              Run the suite to separate an uncached state from true benchmark zeros.
            </EmptyState>
          ) : (
            <div className="mini-tile-grid cinematic-mini-tiles">
              {benchmarkSummary.tiles.map((tile) => (
                <article key={tile.id} className="mini-tile premium-tile">
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

        <article className="panel-card cinematic-summary-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Delegation pressure</span>
              <h3>Queues, owners, and blockers</h3>
            </div>
          </header>
          <div className="status-chip-row">
            {Object.keys(delegationSummary.statusCounts).length === 0 ? (
              <EmptyState title="No delegation tasks recorded.">The ledger has no active queue state yet.</EmptyState>
            ) : (
              Object.entries(delegationSummary.statusCounts).map(([status, count]) => (
                <StatusBadge key={status} tone={toneForState(status)}>
                  {status} · {count}
                </StatusBadge>
              ))
            )}
          </div>
          <div className="summary-subgrid cinematic-summary-subgrid">
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
        </article>

        <article className="panel-card cinematic-summary-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Compliance posture</span>
              <h3>Claim discipline signals</h3>
            </div>
          </header>
          <div className="signal-row cinematic-signal-row">
            {complianceSummary.findings.map((entry) => (
              <div key={entry.label} className="signal-cell premium-signal">
                <span>{entry.label}</span>
                <StatusBadge tone={entry.tone}>{entry.value}</StatusBadge>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card panel-card-wide cinematic-summary-card">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Recent activity</span>
              <h3>Recent authenticated MCP traffic</h3>
            </div>
          </header>
          {recentActivity.length === 0 ? (
            <EmptyState title="No recent audit traffic.">Authenticated HTTP calls will appear here as they arrive.</EmptyState>
          ) : (
            <div className="activity-table cinematic-activity-table">
              {recentActivity.map((entry) => (
                <div key={entry.requestId} className="activity-row cinematic-activity-row">
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
