import { OutcomeChip } from "./OutcomeChip";
import type { ActivityEntry } from "../../types/responses";

interface ActivityRailProps {
  activity: ActivityEntry[];
  onRefresh?: () => void;
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

export function ActivityRail({ activity, onRefresh }: ActivityRailProps) {
  return (
    <article className="rail-card">
      <header>
        <div>
          <h3>Audit activity</h3>
          <p>Recent authenticated tool traffic.</p>
        </div>
        {onRefresh && (
          <button className="secondary-button" onClick={onRefresh} aria-label="Refresh activity">
            ↺
          </button>
        )}
      </header>

      <div className="activity-list">
        {activity.length === 0 ? (
          <div className="empty-card">No audit activity recorded yet.</div>
        ) : (
          activity.map((entry) => (
            <div key={entry.requestId} className="activity-item">
              <div className="activity-item__row">
                <span className="activity-item__tool">{entry.toolName}</span>
                <OutcomeChip outcome={entry.outcome} />
              </div>
              <div className="activity-item__meta">
                <span>{relativeTime(entry.timestamp)}</span>
                {entry.durationMs !== undefined && (
                  <span>{entry.durationMs}ms</span>
                )}
                {entry.callerId && <span>{entry.callerId}</span>}
              </div>
              {entry.errorMessage && (
                <p className="activity-item__error">{entry.errorMessage}</p>
              )}
            </div>
          ))
        )}
      </div>
    </article>
  );
}
