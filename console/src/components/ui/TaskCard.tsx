import { useState } from "react";
import { StatusChip } from "./StatusChip";
import { ALLOWED_TRANSITIONS } from "../../types/responses";
import type { DelegationAgent, DelegationTask } from "../../types/responses";

interface TaskCardProps {
  task: DelegationTask;
  onTransition: (
    taskId: string,
    newStatus: string,
    agent: DelegationAgent,
    notes: string,
    confirmed: boolean
  ) => Promise<void>;
}

function relativeTime(iso: string): string {
  const delta = Date.now() - Date.parse(iso);
  const mins = Math.floor(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TaskCard({ task, onTransition }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<DelegationAgent>(
    task.currentAgent as DelegationAgent
  );
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const validNext = ALLOWED_TRANSITIONS[task.currentStatus] ?? [];

  async function handleTransition() {
    if (!selectedStatus || !confirmed) return;
    setTransitioning(true);
    try {
      await onTransition(task.taskId, selectedStatus, selectedAgent, notes, true);
      setSelectedStatus("");
      setNotes("");
      setConfirmed(false);
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="task-card">
      <div className="task-card__header">
        <div className="task-card__identity">
          <span className="meta-chip">{task.taskId}</span>
          <StatusChip status={task.currentStatus} />
          <span className="task-card__agent">{task.currentAgent}</span>
        </div>
        <button
          className="task-card__toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="task-card__type">{task.taskType}</div>

      {expanded && (
        <>
          {/* History timeline */}
          {task.history.length > 0 && (
            <div className="task-history">
              <div className="task-history__label">Transition history</div>
              <div className="task-history__entries">
                {task.history.map((entry, idx) => (
                  <div key={idx} className="task-history__entry">
                    <StatusChip status={entry.status} size="sm" />
                    <span className="task-history__agent">{entry.agent}</span>
                    <span className="task-history__time">{relativeTime(entry.timestamp)}</span>
                    {entry.notes && (
                      <span className="task-history__notes">{entry.notes}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transition controls */}
          {validNext.length > 0 && (
            <div className="task-transition">
              <div className="task-transition__label">Transition to</div>
              <div className="task-transition__controls">
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="task-transition__select"
                >
                  <option value="">Select next state…</option>
                  {validNext.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value as DelegationAgent)}
                  className="task-transition__select"
                >
                  <option value="codex">codex</option>
                  <option value="claude">claude</option>
                  <option value="gemini">gemini</option>
                </select>
              </div>
              <textarea
                className="task-transition__notes"
                placeholder="Transition notes (rationale, blockers, context)…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
              {selectedStatus && (
                <label className="task-transition__confirm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    Confirm: transition <strong>{task.taskId}</strong> from{" "}
                    <StatusChip status={task.currentStatus} /> to{" "}
                    <StatusChip status={selectedStatus} />
                  </span>
                </label>
              )}
              {selectedStatus && (
                <button
                  className="primary-button"
                  disabled={!confirmed || transitioning}
                  onClick={() => void handleTransition()}
                >
                  {transitioning ? "Applying…" : "Apply transition"}
                </button>
              )}
            </div>
          )}

          {validNext.length === 0 && task.currentStatus === "consolidated" && (
            <p className="task-card__terminal">Task is fully consolidated. No further transitions.</p>
          )}
        </>
      )}
    </div>
  );
}
