import { useState } from "react";
import type { ToolExecutionState } from "../../hooks/useToolExecution";
import type { ConsolidationResult } from "../../types/responses";

interface ConsolidationViewProps {
  toolExec: ToolExecutionState;
}

export function ConsolidationView({ toolExec }: ConsolidationViewProps) {
  const [cycleNumber, setCycleNumber] = useState(1);
  const [result, setResult] = useState<ConsolidationResult | null>(null);

  async function handleGenerate() {
    const data = await toolExec.execute("generate_consolidation", { cycleNumber });
    setResult(data as unknown as ConsolidationResult);
  }

  return (
    <section className="workspace-stack">
      <div className="section-heading">
        <div>
          <div className="meta-chip">Consolidation / review cycle</div>
          <h2>Readiness statement</h2>
        </div>
        <div className="section-heading__actions">
          <label className="cycle-input-label">
            <span>Cycle</span>
            <input
              type="number"
              min={1}
              max={99}
              value={cycleNumber}
              onChange={(e) => setCycleNumber(Math.max(1, Number(e.target.value)))}
              className="cycle-input"
            />
          </label>
          <button
            className="primary-button"
            disabled={toolExec.loading}
            onClick={() => void handleGenerate()}
          >
            {toolExec.loading ? "Generating…" : `Generate cycle ${cycleNumber} statement`}
          </button>
        </div>
      </div>

      {result ? (
        <>
          <article className="panel-card">
            <header>
              <div>
                <h3>Readiness statement</h3>
                <p>
                  Cycle {result.cycleNumber ?? cycleNumber} ·{" "}
                  <span
                    style={{
                      color: result.eligible ? "var(--success)" : "var(--warning)",
                    }}
                  >
                    {result.eligible ? "eligible for consolidation" : "not yet eligible"}
                  </span>
                </p>
              </div>
            </header>
            <p className="signal-text">{result.readinessStatement}</p>
          </article>

          {result.blockers && result.blockers.length > 0 && (
            <article className="panel-card">
              <header>
                <div>
                  <h3>Outstanding blockers</h3>
                  <p>Must be resolved before consolidation is eligible.</p>
                </div>
              </header>
              <ol className="blocker-list">
                {result.blockers.map((b, i) => (
                  <li key={i} className="blocker-list__item">{b}</li>
                ))}
              </ol>
            </article>
          )}

          {result.warnings && result.warnings.length > 0 && (
            <article className="panel-card">
              <header>
                <div>
                  <h3>Warnings</h3>
                  <p>Non-blocking concerns flagged during consolidation review.</p>
                </div>
              </header>
              <ul className="warning-list">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </article>
          )}
        </>
      ) : (
        <div className="empty-card">
          Generate a consolidation statement to review readiness for cycle {cycleNumber}.
        </div>
      )}
    </section>
  );
}
