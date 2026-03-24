import type { BenchmarkId, BenchmarkResult, BenchmarkSnapshot } from "../../types/responses";

const BENCHMARK_LABELS: Record<BenchmarkId, string> = {
  B1: "Confounded fork",
  B2: "Collider bias",
  B3: "Simple chain",
  B4: "Common cause",
  B5: "Multi-intervention",
  B6: "Diamond graph",
};

interface BenchmarkTableProps {
  snapshot: BenchmarkSnapshot;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(
    parsed
  );
}

function BenchmarkRow({
  id,
  result,
}: {
  id: BenchmarkId;
  result: BenchmarkResult;
}) {
  return (
    <tr className="bench-row" data-status={result.status}>
      <td className="bench-cell bench-cell--id">
        <span className="meta-chip">{id}</span>
      </td>
      <td className="bench-cell bench-cell--name">{BENCHMARK_LABELS[id]}</td>
      <td className="bench-cell bench-cell--status">
        <span className="bench-status-dot" data-status={result.status} />
        <span>{result.status.replace(/_/g, " ")}</span>
      </td>
      <td className="bench-cell bench-cell--expected">{result.expectedValue}</td>
      <td className="bench-cell bench-cell--actual">
        {result.actualValue !== undefined ? result.actualValue : "—"}
      </td>
      <td className="bench-cell bench-cell--time">{formatTimestamp(result.lastRun)}</td>
    </tr>
  );
}

export function BenchmarkTable({ snapshot }: BenchmarkTableProps) {
  const ids: BenchmarkId[] = ["B1", "B2", "B3", "B4", "B5", "B6"];

  return (
    <div className="bench-table-wrap">
      <table className="bench-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Benchmark</th>
            <th>Status</th>
            <th>Expected</th>
            <th>Actual</th>
            <th>Last run</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => (
            <BenchmarkRow key={id} id={id} result={snapshot.benchmarks[id]} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
