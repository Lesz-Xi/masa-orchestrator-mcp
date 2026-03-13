import fs from "node:fs";
import path from "node:path";

import type { BenchmarkStatusSnapshot, DelegationStateFile, DelegationTask } from "../types.js";

const allowedTransitions: Record<string, string[]> = {
  delegated: ["in_review", "in_progress", "rejected", "blocked"],
  in_review: ["approved", "rejected", "blocked"],
  approved: ["delegated", "in_progress", "blocked"],
  in_progress: ["delivered", "blocked", "rejected"],
  delivered: ["verified", "rejected", "blocked"],
  verified: ["consolidated"],
  consolidated: [],
  rejected: ["rework"],
  rework: ["delegated", "in_progress"],
  blocked: ["in_review", "approved", "in_progress", "rework", "rejected"],
};

function initialState(): DelegationStateFile {
  return {
    version: 1,
    tasks: [],
    blockers: [],
  };
}

export class DelegationStore {
  constructor(private readonly stateFile: string) {}

  async read(): Promise<DelegationStateFile> {
    try {
      const raw = await fs.promises.readFile(this.stateFile, "utf8");
      return JSON.parse(raw) as DelegationStateFile;
    } catch (error) {
      return initialState();
    }
  }

  async write(state: DelegationStateFile): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.stateFile), { recursive: true });
    const tempFile = `${this.stateFile}.tmp`;
    await fs.promises.writeFile(tempFile, JSON.stringify(state, null, 2));
    await fs.promises.rename(tempFile, this.stateFile);
  }

  async updateTask(input: {
    taskId: string;
    taskType?: string;
    newStatus: string;
    agent: string;
    notes?: string;
  }): Promise<DelegationStateFile> {
    const state = await this.read();
    const existing = state.tasks.find((task) => task.taskId === input.taskId);
    const timestamp = new Date().toISOString();

    if (!existing) {
      const created: DelegationTask = {
        taskId: input.taskId,
        taskType: input.taskType || "unspecified",
        currentStatus: input.newStatus,
        currentAgent: input.agent,
        history: [
          {
            status: input.newStatus,
            agent: input.agent,
            timestamp,
            notes: input.notes || "",
          },
        ],
      };
      state.tasks.push(created);
      await this.write(state);
      return state;
    }

    const allowed = allowedTransitions[existing.currentStatus] ?? [];
    if (!allowed.includes(input.newStatus)) {
      throw new Error(
        `Invalid status transition: ${existing.currentStatus} -> ${input.newStatus}`
      );
    }

    existing.currentStatus = input.newStatus;
    existing.currentAgent = input.agent;
    existing.history.push({
      status: input.newStatus,
      agent: input.agent,
      timestamp,
      notes: input.notes || "",
    });

    await this.write(state);
    return state;
  }

  async saveBenchmarkSnapshot(snapshot: BenchmarkStatusSnapshot): Promise<void> {
    const state = await this.read();
    state.benchmarkSnapshot = snapshot;
    await this.write(state);
  }
}
