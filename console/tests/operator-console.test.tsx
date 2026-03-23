import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OperatorConsole } from "../src/components/operator-console.js";

describe("OperatorConsole", () => {
  it("renders the workbench shell and tool runner", async () => {
    global.fetch = async (input: RequestInfo | URL) => {
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
        return new Response(JSON.stringify({ activity: [] }), { status: 200 });
      }

      if (url.endsWith("/api/mcp/call")) {
        return new Response(JSON.stringify({ structuredContent: { valid: true } }), { status: 200 });
      }

      return new Response(JSON.stringify({ tasks: [], blockers: [] }), { status: 200 });
    };

    render(<OperatorConsole operatorId="ops-chief" />);

    expect(await screen.findByText("Orchestrator Console")).toBeTruthy();
    fireEvent.click(screen.getByText("Tool Runner"));
    expect(await screen.findByText("Validate Task Header")).toBeTruthy();
  });
});
