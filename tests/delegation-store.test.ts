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
});
