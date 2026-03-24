import type { FormEvent } from "react";

import type { ToolCatalogEntry } from "../../lib/catalog";

import { EmptyState, RawDisclosure, StatusBadge } from "./primitives";

export function ToolRunnerView({
  selectedTool,
  values,
  loading,
  confirmMutation,
  onConfirmMutation,
  onSubmit,
  onUpdateField,
  onLoadLastResult,
  toolResultSummary,
  activePayload,
}: {
  selectedTool: ToolCatalogEntry | null;
  values: Record<string, string>;
  loading: boolean;
  confirmMutation: boolean;
  onConfirmMutation: (value: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateField: (fieldName: string, value: string) => void;
  onLoadLastResult: () => void;
  toolResultSummary: ReturnType<typeof import("./view-models").summarizeToolResult>;
  activePayload: Record<string, unknown>;
}) {
  if (!selectedTool) {
    return (
      <section className="workspace-stack cinematic-stack">
        <EmptyState title="No tool selected.">Choose a tool from the left rail to begin a structured call.</EmptyState>
      </section>
    );
  }

  return (
    <section className="workspace-stack cinematic-stack">
      <div className="section-heading cinematic-heading">
        <div>
          <div className="meta-chip">
            {selectedTool.category} / risk {selectedTool.riskLevel}
          </div>
          <h2>{selectedTool.displayName}</h2>
          <p>{selectedTool.summary}</p>
        </div>
      </div>

      <div className="panel-grid split-panel-grid cinematic-split-grid">
        <article className="panel-card command-panel">
          <header className="panel-heading">
            <div>
              <span className="eyebrow">Structured input</span>
              <h3>Operator-safe form surface</h3>
            </div>
          </header>

          <form className="tool-form tool-form-grid" onSubmit={onSubmit}>
            {selectedTool.fields.map((field) => (
              <label key={field.name}>
                <span>{field.label}</span>
                {field.kind === "textarea" || field.kind === "string-array" ? (
                  <textarea
                    rows={field.rows || 4}
                    value={values[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(event) => onUpdateField(field.name, event.target.value)}
                  />
                ) : field.kind === "select" ? (
                  <select
                    value={values[field.name] ?? ""}
                    onChange={(event) => onUpdateField(field.name, event.target.value)}
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
                    onChange={(event) => onUpdateField(field.name, event.target.value)}
                  />
                )}
              </label>
            ))}

            {selectedTool.mutatesState ? (
              <label className="confirm-row">
                <input
                  type="checkbox"
                  checked={confirmMutation}
                  onChange={(event) => onConfirmMutation(event.target.checked)}
                />
                <span>I confirm this state-changing action is intentional.</span>
              </label>
            ) : null}

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? "Running…" : "Run tool"}
              </button>
              <button className="secondary-button" type="button" onClick={onLoadLastResult}>
                Load last result
              </button>
            </div>
          </form>
        </article>

        <article className="panel-card result-panel">
          <header className="panel-heading result-header">
            <div>
              <span className="eyebrow">Result summary</span>
              <h3>{toolResultSummary.label}</h3>
            </div>
            <StatusBadge tone={toolResultSummary.tone}>{toolResultSummary.label}</StatusBadge>
          </header>

          {toolResultSummary.details.length === 0 ? (
            <EmptyState title="No result cached.">
              Run the tool or load the previous result to populate the structured inspector.
            </EmptyState>
          ) : (
            <div className="data-list compact-data-list result-summary-grid">
              {toolResultSummary.details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </div>
          )}

          <RawDisclosure title="View raw tool result" payload={activePayload} />
        </article>
      </div>
    </section>
  );
}

