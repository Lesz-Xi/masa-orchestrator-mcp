import type { ReactNode } from "react";

import type { StatusTone } from "./view-models";

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`status-badge tone-${tone}`}>{children}</span>;
}

export function RawDisclosure({
  title,
  payload,
  defaultOpen = false,
}: {
  title: string;
  payload: Record<string, unknown> | unknown[];
  defaultOpen?: boolean;
}) {
  return (
    <details className="raw-disclosure" open={defaultOpen}>
      <summary>{title}</summary>
      <pre>{JSON.stringify(payload, null, 2)}</pre>
    </details>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-card cinematic-empty">
      {title ? <strong>{title}</strong> : null}
      <p>{children}</p>
    </div>
  );
}
