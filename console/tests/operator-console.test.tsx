import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OperatorConsole } from "../src/components/operator-console.js";

describe("OperatorConsole", () => {
  it("renders summary-first dashboard and tool runner", async () => {
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/mcp/tools")) {
        return new Response(
          JSON.stringify({
            tools: [
              {
                name: "validate_task_header",
                displayName: "Validate Task Header",
                category: "workflow",
                riskLevel: "low",
                mutatesState: false,
                summary: "Check task headers.",
                recommendedInputs: [],
                fields: [
                  { name: "taskId", label: "Task ID", kind: "text", required: true },
                  { name: "taskType", label: "Task Type", kind: "text", required: true },
                ],
              },
            ],
            defaults: {
              auditRoot: "/audit",
              engineRoot: "/engine",
              benchmarkTestPath: "/bench.test.ts",
            },
            health: {
              transport: "http",
              authMode: "bearer",
              consoleCompatibilityVersion: "1.0.0",
            },
            metadata: {},
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/api/activity")) {
        return new Response(
          JSON.stringify({
            activity: [
              {
                requestId: "req-1",
                toolName: "benchmark_status",
                outcome: "success",
                timestamp: "2026-03-24T01:00:00.000Z",
                callerId: "ops-chief",
              },
            ],
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/api/mcp/call")) {
        const parsed = init?.body ? JSON.parse(String(init.body)) : {};
        const toolName = parsed.toolName as string | undefined;

        return new Response(
          JSON.stringify({
            structuredContent: toolName === "benchmark_status"
              ? {
                  passing: 6,
                  failing: 0,
                  notImplemented: 0,
                  benchmarks: {
                    B1: { status: "passing", expectedValue: 1, actualValue: 1 },
                  },
                  honestCapabilityStatement: "Benchmarks are green.",
                  llmIndependence: "verified",
                  notationCompliance: "warning",
                  consolidationEligible: false,
                  updatedAt: "2026-03-24T01:00:00.000Z",
                }
              : toolName === "delegation_chain_state"
                ? {
                    tasks: [
                      {
                        taskId: "TASK-001",
                        taskType: "Integration",
                        currentStatus: "in_progress",
                        currentAgent: "codex",
                        history: [],
                      },
                    ],
                    blockers: ["Waiting on reviewer"],
                    pipeline: {
                      thinkQueue: [],
                      actQueue: [],
                      verifyQueue: [],
                    },
                  }
                : { valid: true, normalizedHeader: { taskId: "TASK-001" } },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ tasks: [], blockers: [] }), { status: 200 });
    };

    render(<OperatorConsole operatorId="ops-chief" />);

    expect(await screen.findByText("Operator Console")).toBeTruthy();
    expect(await screen.findByText("System truth, delegation pressure, and review posture in one screen.")).toBeTruthy();
    expect(await screen.findByText("B1-B6 cached posture")).toBeTruthy();
    expect((await screen.findAllByText("Authenticated MCP traffic")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Provenance defaults")).toBeTruthy();
    fireEvent.click(screen.getByText("Tool Runner"));
    expect(await screen.findByText("Operator-safe form surface")).toBeTruthy();
    expect(await screen.findByText("Inspect raw payload")).toBeTruthy();
  });
});
