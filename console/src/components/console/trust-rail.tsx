import type { ActivityLogEntry } from "../../lib/catalog";

import { EmptyState, RawDisclosure, StatusBadge } from "./primitives";
import { formatRelativeTime, formatTimestamp, toneForState } from "./view-models";

export function TrustRail({
  activity,
  lastRefreshAt,
  activeToolName,
  toolResultSummary,
  activePayload,
}: {
  activity: ActivityLogEntry[];
  lastRefreshAt: string | null;
  activeToolName: string;
  toolResultSummary: ReturnType<typeof import("./view-models").summarizeToolResult>;
  activePayload: Record<string, unknown>;
}) {
  const railActivity = activity.slice(0, 6);

  return (
    <div className="trust-rail">
      <section className="rail-card trust-rail-card">
        <header className="rail-card-header">
          <span className="eyebrow">Recent activity</span>
          <h3>Authenticated MCP traffic</h3>
          <p>{formatRelativeTime(lastRefreshAt)}</p>
        </header>

        {railActivity.length === 0 ? (
          <EmptyState title="No recent traffic.">Authenticated calls will appear here once operators interact with the MCP.</EmptyState>
        ) : (
          <div className="rail-activity-stack">
            {railActivity.map((entry) => (
              <article key={entry.requestId} className="rail-activity-card">
                <div className="rail-activity-head">
                  <strong>{entry.toolName}</strong>
                  <StatusBadge tone={toneForState(entry.outcome)}>{entry.outcome}</StatusBadge>
                </div>
                <span>{formatTimestamp(entry.timestamp)}</span>
                <span>{entry.callerId || "operator"}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rail-card trust-rail-card">
        <header className="rail-card-header">
          <span className="eyebrow">Trust rail</span>
          <h3>Provenance defaults</h3>
        </header>
        <ul className="bullet-list compact-bullet-list">
          <li>Browser traffic never carries the MCP bearer token.</li>
          <li>Mutation tools still require explicit confirmation.</li>
          <li>Raw payloads stay secondary to operator-safe summaries.</li>
          <li>HTTP health remains public; MCP execution remains authenticated.</li>
        </ul>
      </section>

      <section className="rail-card trust-rail-card">
        <header className="rail-card-header">
          <span className="eyebrow">Result inspector</span>
          <h3>{activeToolName}</h3>
        </header>
        <div className="signal-row rail-result-row">
          <StatusBadge tone={toolResultSummary.tone}>{toolResultSummary.label}</StatusBadge>
        </div>
        <RawDisclosure title="Inspect raw payload" payload={activePayload} />
      </section>
    </div>
  );
}
