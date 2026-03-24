import type { BootstrapPayload } from "./view-models";

import { EmptyState, RawDisclosure, StatusBadge } from "./primitives";
import {
  asArray,
  asString,
  formatTimestamp,
  toneForState,
} from "./view-models";

export function DelegationView({
  delegationSummary,
  onRefresh,
}: {
  delegationSummary: ReturnType<typeof import("./view-models").summarizeDelegation>;
  onRefresh: () => void;
}) {
  return (
    <section className="workspace-stack cinematic-stack">
      <div className="section-heading cinematic-heading">
        <div>
          <div className="meta-chip">Delegation / live ledger</div>
          <h2>Task pressure, owner state, and blockers without transcript noise.</h2>
          <p>
            Review delegation as a compact operational ledger with per-task history only when needed.
          </p>
        </div>
        <button className="secondary-button" onClick={onRefresh}>
          Refresh queues
        </button>
      </div>

      <div className="panel-grid split-panel-grid cinematic-split-grid">
        <article className="panel-card ledger-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Delegation ledger</span>
              <h3>Tracked tasks</h3>
            </div>
            <StatusBadge tone={delegationSummary.tasks.length > 0 ? "active" : "neutral"}>
              {delegationSummary.tasks.length} task{delegationSummary.tasks.length === 1 ? "" : "s"}
            </StatusBadge>
          </header>

          {delegationSummary.tasks.length === 0 ? (
            <EmptyState title="No delegation tasks recorded.">
              The state file is not tracking any active orchestration work yet.
            </EmptyState>
          ) : (
            <div className="timeline-list">
              {delegationSummary.tasks.map((task) => {
                const history = asArray<Record<string, unknown>>(task.history);
                const latestTimestamp =
                  history.length > 0 ? formatTimestamp(history[history.length - 1]?.timestamp) : "—";

                return (
                  <details key={String(task.taskId)} className="timeline-card">
                    <summary>
                      <div className="timeline-head">
                        <div>
                          <strong>{asString(task.taskId)}</strong>
                          <span>{asString(task.taskType)}</span>
                        </div>
                        <div className="timeline-meta">
                          <StatusBadge tone={toneForState(asString(task.currentStatus))}>
                            {asString(task.currentStatus)}
                          </StatusBadge>
                          <span>{asString(task.currentAgent, "unassigned")}</span>
                        </div>
                      </div>
                      <div className="timeline-note">
                        <span>Last update {latestTimestamp}</span>
                        <span>{history.length} history entries</span>
                      </div>
                    </summary>

                    <div className="timeline-detail">
                      <div className="detail-grid">
                        <div>
                          <span className="summary-label">Owner</span>
                          <p>{asString(task.currentAgent, "unassigned")}</p>
                        </div>
                        <div>
                          <span className="summary-label">Status</span>
                          <p>{asString(task.currentStatus)}</p>
                        </div>
                      </div>

                      {history.length === 0 ? (
                        <EmptyState title="No history captured.">
                          This task has not recorded transition notes yet.
                        </EmptyState>
                      ) : (
                        <div className="history-list cinematic-history-list">
                          {history.map((entry, index) => (
                            <article
                              key={`${String(task.taskId)}-${index}`}
                              className="history-item cinematic-history-item"
                            >
                              <div className="history-heading">
                                <StatusBadge tone={toneForState(asString(entry.status))}>
                                  {asString(entry.status)}
                                </StatusBadge>
                                <time>{formatTimestamp(entry.timestamp)}</time>
                              </div>
                              <p>{asString(entry.notes, "No transition notes recorded.")}</p>
                            </article>
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

        <article className="panel-card trust-slab">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Pressure map</span>
              <h3>Blockers and queue shape</h3>
            </div>
          </header>

          <div className="status-chip-row compact-chip-row">
            {Object.entries(delegationSummary.statusCounts).length === 0 ? (
              <EmptyState title="No status distribution yet.">
                Status chips appear once tasks are written into the delegation file.
              </EmptyState>
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
                  {delegationSummary.blockers.map((blocker) => (
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
      </div>
    </section>
  );
}

export function BenchmarksView({
  bootstrap,
  benchmarkSummary,
  onRun,
}: {
  bootstrap: BootstrapPayload | null;
  benchmarkSummary: ReturnType<typeof import("./view-models").summarizeBenchmark>;
  onRun: () => void;
}) {
  return (
    <section className="workspace-stack cinematic-stack">
      <div className="section-heading cinematic-heading">
        <div>
          <div className="meta-chip">Benchmarks / B1-B6</div>
          <h2>Deterministic benchmark evidence without overclaiming readiness.</h2>
          <p>Keep the review board compact, but explicit about what is cached, verified, or still absent.</p>
        </div>
        <button className="primary-button" onClick={onRun} disabled={!bootstrap?.defaults.benchmarkTestPath}>
          Run benchmark suite
        </button>
      </div>

      <div className="panel-grid split-panel-grid cinematic-split-grid">
        <article className="panel-card benchmark-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Benchmark board</span>
              <h3>B1-B6 compact grid</h3>
            </div>
            <StatusBadge tone={benchmarkSummary.hasCachedRun ? "active" : "neutral"}>
              {benchmarkSummary.freshness}
            </StatusBadge>
          </header>

          {benchmarkSummary.tiles.length === 0 ? (
            <EmptyState title="No benchmark run cached.">
              This is an uncached state, not a zero-valued successful run.
            </EmptyState>
          ) : (
            <div className="benchmark-board cinematic-benchmark-board">
              {benchmarkSummary.tiles.map((tile) => (
                <article key={tile.id} className="benchmark-tile premium-benchmark">
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

        <article className="panel-card benchmark-decision-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Decision panel</span>
              <h3>Readiness and guardrails</h3>
            </div>
          </header>

          <div className="signal-text">{benchmarkSummary.capabilityStatement}</div>

          <div className="decision-stack">
            <div className="decision-row">
              <span>LLM independence</span>
              <StatusBadge tone={toneForState(benchmarkSummary.llmIndependence)}>
                {benchmarkSummary.llmIndependence}
              </StatusBadge>
            </div>
            <div className="decision-row">
              <span>Notation state</span>
              <StatusBadge tone={toneForState(benchmarkSummary.notationCompliance)}>
                {benchmarkSummary.notationCompliance}
              </StatusBadge>
            </div>
            <div className="decision-row">
              <span>Consolidation readiness</span>
              <StatusBadge tone={benchmarkSummary.consolidationEligible ? "success" : "warning"}>
                {benchmarkSummary.consolidationEligible ? "eligible" : "not eligible"}
              </StatusBadge>
            </div>
            <div className="decision-row">
              <span>Last cached run</span>
              <span>{benchmarkSummary.updatedAt}</span>
            </div>
          </div>

          <RawDisclosure title="View raw benchmark payload" payload={benchmarkSummary.raw} />
        </article>
      </div>
    </section>
  );
}

export function ComplianceView({
  bootstrap,
  complianceSummary,
  activeResult,
  onRunNotation,
  onRunIndependence,
  onValidateAssumptions,
}: {
  bootstrap: BootstrapPayload | null;
  complianceSummary: ReturnType<typeof import("./view-models").summarizeCompliance>;
  activeResult: Record<string, unknown> | null;
  onRunNotation: () => void;
  onRunIndependence: () => void;
  onValidateAssumptions: () => void;
}) {
  return (
    <section className="workspace-stack cinematic-stack">
      <div className="section-heading cinematic-heading">
        <div>
          <div className="meta-chip">Compliance / review safeguards</div>
          <h2>Severity-first findings with controlled operator actions.</h2>
          <p>Keep raw payloads available, but default to structured review items and narrow command surfaces.</p>
        </div>
      </div>

      <div className="panel-grid split-panel-grid cinematic-split-grid">
        <article className="panel-card command-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Quick actions</span>
              <h3>Common compliance scans</h3>
            </div>
            <StatusBadge tone={bootstrap ? "active" : "neutral"}>{bootstrap ? "ready" : "loading"}</StatusBadge>
          </header>

          <div className="action-grid compliance-command-grid">
            <button className="secondary-button" onClick={onRunNotation}>
              Run notation scan
            </button>
            <button className="secondary-button" onClick={onRunIndependence}>
              Run LLM independence
            </button>
            <button className="secondary-button" onClick={onValidateAssumptions}>
              Validate assumptions
            </button>
          </div>

          <div className="signal-row cinematic-signal-row">
            {complianceSummary.findings.map((entry) => (
              <div key={entry.label} className="signal-cell premium-signal">
                <span>{entry.label}</span>
                <StatusBadge tone={entry.tone}>{entry.value}</StatusBadge>
              </div>
            ))}
          </div>
        </article>

        <article className="panel-card review-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Latest findings</span>
              <h3>Severity-ordered review</h3>
            </div>
          </header>

          {complianceSummary.violations.length === 0 ? (
            <EmptyState title={activeResult ? "No structured findings returned." : "Run a compliance action."}>
              {activeResult
                ? "The latest result did not include structured violation records."
                : "A compliance result will populate structured findings here."}
            </EmptyState>
          ) : (
            <div className="finding-list review-list">
              {complianceSummary.violations.map((violation) => (
                <article key={`${violation.file}-${violation.title}`} className="finding-card review-item">
                  <div className="finding-head">
                    <StatusBadge tone={toneForState(violation.severity)}>{violation.severity}</StatusBadge>
                    <strong>{violation.title}</strong>
                  </div>
                  <p>{violation.message}</p>
                  <span className="finding-path review-path">{violation.file}</span>
                  <span className="finding-suggestion review-copy">{violation.suggestion}</span>
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

export function ConsolidationView({
  consolidationSummary,
  onGenerate,
  onCopy,
}: {
  consolidationSummary: ReturnType<typeof import("./view-models").summarizeConsolidation>;
  onGenerate: () => void;
  onCopy: () => void;
}) {
  return (
    <section className="workspace-stack cinematic-stack">
      <div className="section-heading cinematic-heading">
        <div>
          <div className="meta-chip">Consolidation / review cycle</div>
          <h2>Render sign-off posture as a review document, not a log dump.</h2>
          <p>Keep classification, blockers, and overclaims legible enough to paste directly into a decision flow.</p>
        </div>
        <button className="primary-button" onClick={onGenerate}>
          Generate consolidation
        </button>
      </div>

      <div className="panel-grid split-panel-grid cinematic-split-grid">
        <article className="panel-card hero-slab narrative-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Consolidation statement</span>
              <h3>Latest readiness narrative</h3>
            </div>
            <div className="copy-row">
              <StatusBadge tone={toneForState(consolidationSummary.classification)}>
                {consolidationSummary.classification}
              </StatusBadge>
              <button className="secondary-button" type="button" onClick={onCopy}>
                Copy statement
              </button>
            </div>
          </header>
          <div className="signal-text">{consolidationSummary.statement}</div>
          <p className="support-copy">{consolidationSummary.capabilityStatement}</p>
        </article>

        <article className="panel-card review-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Review detail</span>
              <h3>Overclaims, blockers, evidence</h3>
            </div>
          </header>

          <div className="summary-subgrid cinematic-summary-subgrid">
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
