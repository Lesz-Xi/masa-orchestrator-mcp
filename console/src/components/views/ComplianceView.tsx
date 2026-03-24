import { useState } from "react";
import type { ToolExecutionState } from "../../hooks/useToolExecution";
import type {
  NotationComplianceResult,
  LlmCheckResult,
  EnvelopeCheckResult,
} from "../../types/responses";

type ScanResult =
  | { kind: "notation"; data: NotationComplianceResult }
  | { kind: "llm"; data: LlmCheckResult }
  | { kind: "envelope"; data: EnvelopeCheckResult }
  | null;

interface ComplianceViewProps {
  toolExec: ToolExecutionState;
  engineRoot: string;
  auditRoot: string;
}

export function ComplianceView({ toolExec, engineRoot, auditRoot }: ComplianceViewProps) {
  const [lastScan, setLastScan] = useState<ScanResult>(null);

  async function runNotation() {
    const result = await toolExec.execute("check_notation_compliance", {
      path: engineRoot || auditRoot,
      scope: "v1.0-engine",
    });
    setLastScan({ kind: "notation", data: result as unknown as NotationComplianceResult });
  }

  async function runLlm() {
    const result = await toolExec.execute("llm_independence_check", {
      enginePath: engineRoot,
    });
    setLastScan({ kind: "llm", data: result as unknown as LlmCheckResult });
  }

  async function runEnvelope() {
    const result = await toolExec.execute("validate_assumption_envelope", {
      path: engineRoot,
    });
    setLastScan({ kind: "envelope", data: result as unknown as EnvelopeCheckResult });
  }

  return (
    <section className="workspace-stack">
      <div className="section-heading">
        <div>
          <div className="meta-chip">Compliance / evidence-aware</div>
          <h2>Notation, claim, and independence controls</h2>
        </div>
      </div>

      <div className="panel-grid">
        <article className="panel-card">
          <header>
            <div>
              <h3>Quick scans</h3>
              <p>Run compliance checks using server-configured roots.</p>
            </div>
          </header>
          <div className="action-stack">
            <button
              className="secondary-button"
              onClick={() => void runNotation()}
              disabled={toolExec.loading}
            >
              {toolExec.loading ? "Scanning…" : "Notation compliance scan"}
            </button>
            <button
              className="secondary-button"
              onClick={() => void runLlm()}
              disabled={toolExec.loading}
            >
              {toolExec.loading ? "Scanning…" : "LLM independence check"}
            </button>
            <button
              className="secondary-button"
              onClick={() => void runEnvelope()}
              disabled={toolExec.loading}
            >
              {toolExec.loading ? "Scanning…" : "Assumption envelope check"}
            </button>
          </div>
        </article>

        <article className="panel-card">
          <header>
            <div>
              <h3>Scan results</h3>
              <p>Structured findings from the most recent scan.</p>
            </div>
          </header>
          {!lastScan ? (
            <div className="empty-card">Run a scan to see results here.</div>
          ) : lastScan.kind === "notation" ? (
            <NotationResults data={lastScan.data} />
          ) : lastScan.kind === "llm" ? (
            <LlmResults data={lastScan.data} />
          ) : (
            <EnvelopeResults data={lastScan.data} />
          )}
        </article>
      </div>
    </section>
  );
}

function NotationResults({ data }: { data: NotationComplianceResult }) {
  return (
    <div className="scan-results">
      <div
        className="scan-summary"
        data-status={data.compliant ? "compliant" : "violation"}
      >
        {data.compliant ? "✓ Compliant" : `✗ ${data.violations.length} violation${data.violations.length !== 1 ? "s" : ""}`}
      </div>
      {data.violations.length > 0 && (
        <div className="violations-list">
          {data.violations.map((v, i) => (
            <div key={i} className="violation-item" data-severity={v.severity}>
              <div className="violation-item__location">
                <span className="meta-chip">{v.severity}</span>
                <span className="violation-item__file">
                  {v.file.split("/").slice(-2).join("/")}:{v.line}
                </span>
              </div>
              <p className="violation-item__message">{v.message}</p>
              {v.suggestion && (
                <p className="violation-item__suggestion">→ {v.suggestion}</p>
              )}
              <code className="violation-item__match">{v.match}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LlmResults({ data }: { data: LlmCheckResult }) {
  return (
    <div className="scan-results">
      <div
        className="scan-summary"
        data-status={data.independent ? "compliant" : "violation"}
      >
        {data.independent
          ? "✓ LLM-independent"
          : `✗ ${data.violations.length} LLM dependenc${data.violations.length !== 1 ? "ies" : "y"} found`}
      </div>
      {data.violations.map((v, i) => (
        <div key={i} className="violation-item" data-severity="error">
          <span className="violation-item__file">
            {v.file.split("/").slice(-2).join("/")}:{v.line}
          </span>
          <code className="violation-item__match">{v.match}</code>
          {v.message && <p className="violation-item__message">{v.message}</p>}
        </div>
      ))}
    </div>
  );
}

function EnvelopeResults({ data }: { data: EnvelopeCheckResult }) {
  return (
    <div className="scan-results">
      <div
        className="scan-summary"
        data-status={data.envelopeIntact ? "compliant" : "violation"}
      >
        {data.envelopeIntact
          ? "✓ Assumption envelope intact"
          : `✗ ${data.violations.length} violation${data.violations.length !== 1 ? "s" : ""}`}
      </div>
      {data.violations.map((v, i) => (
        <div key={i} className="violation-item" data-severity={v.severity}>
          <div className="violation-item__location">
            <span className="meta-chip">{v.category.replace(/_/g, " ")}</span>
            <span className="violation-item__file">
              {v.file.split("/").slice(-2).join("/")}:{v.line}
            </span>
          </div>
          <p className="violation-item__message">{v.message}</p>
          <p className="violation-item__suggestion">→ {v.recommendation}</p>
          <code className="violation-item__match">{v.match}</code>
        </div>
      ))}
    </div>
  );
}
