"use client";

import { useCallback, useState } from "react";
import type { BenchmarkSnapshot, DelegationState } from "../types/responses";

async function callTool(
  toolName: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch("/api/mcp/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-console-request": "1",
      },
      body: JSON.stringify({ toolName, arguments: payload, confirmMutation: false }),
      cache: "no-store",
    });

    if (!response.ok) return null;
    const result = (await response.json()) as { structuredContent?: Record<string, unknown> };
    return result.structuredContent ?? null;
  } catch {
    return null;
  }
}

export type DashboardDataState = {
  benchmark: BenchmarkSnapshot | null;
  delegation: DelegationState | null;
  health: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

function normalizeDelegationState(
  value: Record<string, unknown> | null
): DelegationState | null {
  if (!value) {
    return null;
  }

  const tasks = Array.isArray(value.tasks) ? value.tasks : [];
  const blockers = Array.isArray(value.blockers) ? value.blockers : [];
  const pipelineValue =
    value.pipeline && typeof value.pipeline === "object" ? value.pipeline : {};
  const pipeline = pipelineValue as Record<string, unknown>;

  return {
    ...(value as DelegationState),
    tasks: tasks as DelegationState["tasks"],
    blockers: blockers as string[],
    pipeline: {
      thinkQueue: Array.isArray(pipeline.thinkQueue) ? (pipeline.thinkQueue as string[]) : [],
      actQueue: Array.isArray(pipeline.actQueue) ? (pipeline.actQueue as string[]) : [],
      verifyQueue: Array.isArray(pipeline.verifyQueue) ? (pipeline.verifyQueue as string[]) : [],
    },
  };
}

export function useDashboardData(): DashboardDataState {
  const [benchmark, setBenchmark] = useState<BenchmarkSnapshot | null>(null);
  const [delegation, setDelegation] = useState<DelegationState | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch health + tools catalog (no tool call needed — just fetch the endpoint)
      const healthPromise = fetch("/api/mcp/tools", {
        headers: { "x-console-request": "1" },
        cache: "no-store",
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ health: Record<string, unknown> }>) : null))
        .then((r) => r?.health ?? null)
        .catch(() => null);

      const benchmarkPromise = callTool("benchmark_status", { action: "report" });
      const delegationPromise = callTool("delegation_chain_state", { action: "get" });

      const [healthResult, benchmarkResult, delegationResult] = await Promise.all([
        healthPromise,
        benchmarkPromise,
        delegationPromise,
      ]);

      setHealth(healthResult);
      setBenchmark(benchmarkResult as BenchmarkSnapshot | null);
      setDelegation(normalizeDelegationState(delegationResult));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  return { benchmark, delegation, health, loading, error, refresh };
}
