import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DelegationStore } from "../src/state/delegation-store.js";
import { makeTempDir } from "./helpers.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("DelegationStore", () => {
  it("persists valid transitions and rejects invalid ones", async () => {
    const dir = makeTempDir("masa-state-");
    tempDirs.push(dir);
    const store = new DelegationStore(path.join(dir, ".orchestration-state.json"));

    await store.updateTask({
      taskId: "TASK-001",
      taskType: "Implementation",
      newStatus: "delegated",
      agent: "gemini",
      notes: "start",
    });

    await store.updateTask({
      taskId: "TASK-001",
      newStatus: "in_review",
      agent: "claude",
      notes: "reviewing",
    });

    const state = await store.read();
    expect(state.tasks[0]?.currentStatus).toBe("in_review");

    await expect(
      store.updateTask({
        taskId: "TASK-001",
        newStatus: "verified",
        agent: "gemini",
        notes: "skip ahead",
      })
    ).rejects.toThrow("Invalid status transition");
  });

  it("treats same-status updates as idempotent instead of failing", async () => {
    const dir = makeTempDir("masa-state-");
    tempDirs.push(dir);
    const store = new DelegationStore(path.join(dir, ".orchestration-state.json"));

    await store.updateTask({
      taskId: "TASK-002",
      taskType: "Implementation",
      newStatus: "delegated",
      agent: "codex",
      notes: "queued",
    });

    await store.updateTask({
      taskId: "TASK-002",
      newStatus: "in_progress",
      agent: "codex",
      notes: "started",
    });

    await expect(
      store.updateTask({
        taskId: "TASK-002",
        newStatus: "in_progress",
        agent: "codex",
        notes: "still running",
      })
    ).resolves.toBeDefined();

    const state = await store.read();
    const task = state.tasks.find((entry) => entry.taskId === "TASK-002");

    expect(task?.currentStatus).toBe("in_progress");
    expect(task?.history.at(-1)?.notes).toBe("still running");
  });

  it("normalizes legacy gpt agent entries to codex on read", async () => {
    const dir = makeTempDir("masa-state-");
    tempDirs.push(dir);
    const stateFile = path.join(dir, ".orchestration-state.json");
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        version: 2,
        tasks: [
          {
            taskId: "TASK-003",
            taskType: "Implementation",
            currentStatus: "delegated",
            currentAgent: "gpt",
            history: [
              {
                status: "delegated",
                agent: "gpt",
                timestamp: "2026-03-26T00:00:00.000Z",
                notes: "legacy entry",
              },
            ],
          },
        ],
        blockers: [],
        activityLog: [],
      })
    );

    const store = new DelegationStore(stateFile);
    const state = await store.read();

    expect(state.tasks[0]?.currentAgent).toBe("codex");
    expect(state.tasks[0]?.history[0]?.agent).toBe("codex");
  });
});
