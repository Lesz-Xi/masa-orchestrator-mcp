"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ToolCatalogEntry, ToolCatalogField } from "../../lib/catalog";
import { useToolExecution } from "../../hooks/useToolExecution";
import { SkeletonPanel } from "../ui/SkeletonPanel";
import { ErrorCard } from "../ui/ErrorCard";

const RECENT_INPUTS_KEY = "masa.console.recentInputs.v2";

type StoredInputs = Record<string, Record<string, string>>;

function parseStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // QuotaExceededError — silently skip persistence
    console.warn("[ToolRunnerView] localStorage quota exceeded; form values will not persist.");
  }
}

function normalizeFieldValue(field: ToolCatalogField, rawValue: string): unknown {
  if (field.kind === "number") return Number(rawValue);
  if (field.kind === "string-array") {
    return rawValue
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return rawValue;
}

function stringValue(value: string | number | string[] | undefined): string {
  if (Array.isArray(value)) return value.join("\n");
  return value === undefined ? "" : String(value);
}

interface ToolRunnerViewProps {
  tools: readonly ToolCatalogEntry[];
  operatorId: string;
}

export function ToolRunnerView({ tools, operatorId: _operatorId }: ToolRunnerViewProps) {
  const toolExec = useToolExecution();
  const [selectedToolName, setSelectedToolName] = useState(tools[0]?.name ?? "");
  const [formValues, setFormValues] = useState<StoredInputs>({});
  const [confirmMutation, setConfirmMutation] = useState(false);

  // Reset confirm on tool change
  useEffect(() => {
    setConfirmMutation(false);
  }, [selectedToolName]);

  // Restore persisted inputs on mount
  useEffect(() => {
    setFormValues(parseStoredJson<StoredInputs>(RECENT_INPUTS_KEY, {}));
  }, []);

  // Persist inputs on change
  useEffect(() => {
    if (Object.keys(formValues).length > 0) {
      safeLocalStorageSet(RECENT_INPUTS_KEY, JSON.stringify(formValues));
    }
  }, [formValues]);

  const selectedTool = useMemo(
    () => tools.find((t) => t.name === selectedToolName) ?? tools[0] ?? null,
    [tools, selectedToolName]
  );

  const currentValues = useMemo((): Record<string, string> => {
    if (!selectedTool) return {};
    const saved = formValues[selectedTool.name] ?? {};
    return Object.fromEntries(
      selectedTool.fields.map((field) => [
        field.name,
        saved[field.name] ?? stringValue(field.defaultValue),
      ])
    );
  }, [selectedTool, formValues]);

  const updateField = useCallback(
    (fieldName: string, value: string) => {
      if (!selectedTool) return;
      setFormValues((prev) => ({
        ...prev,
        [selectedTool.name]: {
          ...currentValues,
          [fieldName]: value,
        },
      }));
    },
    [selectedTool, currentValues]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTool) return;

    const payload: Record<string, unknown> = {};
    for (const field of selectedTool.fields) {
      const rawValue = (currentValues[field.name] ?? "").trim();
      if (!rawValue && !field.required) continue;
      payload[field.name] = normalizeFieldValue(field, rawValue);
    }

    if (selectedTool.mutatesState && !confirmMutation) {
      return;
    }

    // Persist current values
    setFormValues((prev) => ({
      ...prev,
      [selectedTool.name]: currentValues,
    }));

    await toolExec.execute(selectedTool.name, payload, confirmMutation);
  }

  if (!selectedTool) {
    return <div className="empty-card">No tools available.</div>;
  }

  return (
    <section className="workspace-stack">
      <div className="section-heading">
        <div>
          <div className="meta-chip">
            Tool runner / {selectedTool.category} · risk {selectedTool.riskLevel}
          </div>
          <h2>{selectedTool.displayName}</h2>
        </div>
      </div>

      {/* Tool selector */}
      <div className="tool-selector">
        {tools.map((tool) => (
          <button
            key={tool.name}
            className={`tool-tab ${selectedToolName === tool.name ? "active" : ""}`}
            onClick={() => setSelectedToolName(tool.name)}
          >
            <span>{tool.displayName}</span>
            {tool.mutatesState && <span className="tool-tab__risk">mut</span>}
          </button>
        ))}
      </div>

      {toolExec.error && (
        <ErrorCard
          error={toolExec.error}
          onDismiss={() => toolExec.clearError()}
          onRetry={undefined}
        />
      )}

      <div className="panel-grid">
        <article className="panel-card">
          <header>
            <div>
              <h3>Input</h3>
              <p>{selectedTool.summary}</p>
            </div>
          </header>

          <form className="tool-form" onSubmit={(e) => void handleSubmit(e)}>
            {selectedTool.fields.map((field) => (
              <label key={field.name}>
                <span>
                  {field.label}
                  {field.required && <span style={{ color: "var(--danger)" }}> *</span>}
                </span>
                {field.kind === "textarea" || field.kind === "string-array" ? (
                  <textarea
                    rows={field.rows ?? 4}
                    value={currentValues[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => updateField(field.name, e.target.value)}
                  />
                ) : field.kind === "select" ? (
                  <select
                    value={currentValues[field.name] ?? ""}
                    onChange={(e) => updateField(field.name, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {(field.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.kind === "number" ? "number" : "text"}
                    value={currentValues[field.name] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => updateField(field.name, e.target.value)}
                  />
                )}
              </label>
            ))}

            {selectedTool.mutatesState && (
              <label className="confirm-row">
                <input
                  type="checkbox"
                  checked={confirmMutation}
                  onChange={(e) => setConfirmMutation(e.target.checked)}
                />
                <span>I confirm this state-changing action is intentional.</span>
              </label>
            )}

            <div className="form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={toolExec.loading || (selectedTool.mutatesState && !confirmMutation)}
              >
                {toolExec.loading ? "Running…" : "Run tool"}
              </button>
            </div>
          </form>
        </article>

        <article className="panel-card">
          <header>
            <div>
              <h3>Result</h3>
              <p>Structured output from the most recent execution.</p>
            </div>
          </header>
          {toolExec.loading ? (
            <SkeletonPanel lines={5} />
          ) : toolExec.lastResult ? (
            <pre>{JSON.stringify(toolExec.lastResult, null, 2)}</pre>
          ) : (
            <div className="empty-card">
              No result yet. Run the tool to see output here.
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
