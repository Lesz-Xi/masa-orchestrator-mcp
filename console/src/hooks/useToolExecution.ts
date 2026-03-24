"use client";

import { useCallback, useRef, useState } from "react";

async function callTool(
  toolName: string,
  payload: Record<string, unknown>,
  confirmMutation = false
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/mcp/call", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-console-request": "1",
    },
    body: JSON.stringify({ toolName, arguments: payload, confirmMutation }),
  });

  const result = (await response.json()) as {
    success?: boolean;
    structuredContent?: Record<string, unknown>;
    error?: { message?: string };
  };

  if (!response.ok || !result.structuredContent) {
    throw new Error(result.error?.message ?? "Tool execution failed.");
  }

  return result.structuredContent;
}

export type ToolExecutionState = {
  loading: boolean;
  error: string | null;
  lastResult: Record<string, unknown> | null;
  execute: (
    toolName: string,
    payload: Record<string, unknown>,
    confirmed?: boolean
  ) => Promise<Record<string, unknown>>;
  clearError: () => void;
};

export function useToolExecution(): ToolExecutionState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (
      toolName: string,
      payload: Record<string, unknown>,
      confirmed = false
    ): Promise<Record<string, unknown>> => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const result = await callTool(toolName, payload, confirmed);
        setLastResult(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Tool execution failed.";
        setError(msg);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, lastResult, execute, clearError };
}
