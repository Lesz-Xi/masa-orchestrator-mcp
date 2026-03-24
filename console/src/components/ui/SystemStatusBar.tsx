import type { BenchmarkSnapshot, DelegationState } from "../../types/responses";

interface SystemStatusBarProps {
  health: Record<string, unknown> | null;
  benchmark: BenchmarkSnapshot | null;
  delegation: DelegationState | null;
  loading: boolean;
}

function SignalRow({
  label,
  value,
  kind = "neutral",
}: {
  label: string;
  value: string;
  kind?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div className="signal-row" data-kind={kind}>
      <span className="signal-label">{label}</span>
      <span className="signal-value" data-kind={kind}>{value}</span>
    </div>
  );
}

export function SystemStatusBar({
  health,
  benchmark,
  delegation,
  loading,
}: SystemStatusBarProps) {
  const backendOk = health !== null;
  const passing = benchmark?.passing ?? null;
  const blockerCount = delegation?.blockers.length ?? 0;
  const taskCount = delegation?.tasks.length ?? 0;
  const lastRun = benchmark?.updatedAt;

  function formatTime(iso: string | undefined): string {
    if (!iso) return "never";
    const parsed = Date.parse(iso);
    if (Number.isNaN(parsed)) return "unknown";
    const delta = Date.now() - parsed;
    const mins = Math.floor(delta / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  return (
    <div className="system-status-bar">
      <div className="meta-chip">System status</div>
      <div className="signal-stack">
        <SignalRow
          label="Backend"
          value={loading ? "…" : backendOk ? "reachable" : "unreachable"}
          kind={loading ? "neutral" : backendOk ? "success" : "danger"}
        />
        <SignalRow
          label="Benchmarks"
          value={
            passing === null
              ? "no snapshot"
              : `${passing}/6 passing`
          }
          kind={
            passing === null
              ? "neutral"
              : passing === 6
              ? "success"
              : passing === 0
              ? "danger"
              : "warning"
          }
        />
        <SignalRow
          label="Last run"
          value={formatTime(lastRun)}
          kind="neutral"
        />
        <SignalRow
          label="Tasks"
          value={taskCount === 0 ? "none" : `${taskCount} active`}
          kind="neutral"
        />
        <SignalRow
          label="Blockers"
          value={blockerCount === 0 ? "none" : `${blockerCount} active`}
          kind={blockerCount > 0 ? "warning" : "success"}
        />
        <SignalRow
          label="Eligibility"
          value={
            benchmark === null
              ? "unchecked"
              : benchmark.consolidationEligible
              ? "ready"
              : "not ready"
          }
          kind={
            benchmark?.consolidationEligible ? "success" : "neutral"
          }
        />
      </div>
    </div>
  );
}
