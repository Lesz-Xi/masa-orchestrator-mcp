import fs from "node:fs";
import path from "node:path";

import { ACTIVITY_LOG_LIMIT } from "../constants.js";
import type {
  ActivityLogEntry,
  BenchmarkStatusSnapshot,
  DelegationStateFile,
  DelegationTask,
} from "../types.js";

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

const KNOWN_STATUSES = new Set(Object.keys(allowedTransitions));

function initialState(): DelegationStateFile {
  return {
    version: 2,
    tasks: [],
    blockers: [],
    activityLog: [],
  };
}

function normalizeState(raw: unknown): DelegationStateFile {
  if (!raw || typeof raw !== "object") {
    return initialState();
  }

  const candidate = raw as Partial<DelegationStateFile> & {
    version?: number;
    tasks?: DelegationTask[];
    blockers?: string[];
    activityLog?: ActivityLogEntry[];
  };

  return {
    version: 2,
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
    benchmarkSnapshot: candidate.benchmarkSnapshot,
    blockers: Array.isArray(candidate.blockers) ? candidate.blockers : [],
    activityLog: Array.isArray(candidate.activityLog) ? candidate.activityLog : [],
  };
}

export class DelegationStore {
  constructor(private readonly stateFile: string) {}

  async read(): Promise<DelegationStateFile> {
    try {
      const raw = await fs.promises.readFile(this.stateFile, "utf8");
      return normalizeState(JSON.parse(raw));
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
      if (!KNOWN_STATUSES.has(input.newStatus)) {
        throw new Error(
          `Unknown initial status '${input.newStatus}'. Valid statuses: ${[...KNOWN_STATUSES].sort().join(", ")}.`
        );
      }

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

    if (existing.currentStatus === input.newStatus) {
      existing.currentAgent = input.agent;

      const lastHistoryEntry = existing.history.at(-1);
      const nextNotes = input.notes || "";
      const shouldAppendHistory =
        !lastHistoryEntry ||
        lastHistoryEntry.status !== input.newStatus ||
        lastHistoryEntry.agent !== input.agent ||
        lastHistoryEntry.notes !== nextNotes;

      if (shouldAppendHistory) {
        existing.history.push({
          status: input.newStatus,
          agent: input.agent,
          timestamp,
          notes: nextNotes,
        });
        await this.write(state);
      }

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

  async appendActivity(entry: ActivityLogEntry): Promise<void> {
    const state = await this.read();
    state.activityLog = [entry, ...state.activityLog].slice(0, ACTIVITY_LOG_LIMIT);
    await this.write(state);
  }

  async listRecentActivity(limit = 25): Promise<ActivityLogEntry[]> {
    const state = await this.read();
    return state.activityLog.slice(0, limit);
  }
}
