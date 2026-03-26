import { z } from "zod";

import {
  delegationAgentSchema,
  delegationStatusSchema,
} from "../delegation-contract.js";
import { DelegationStore } from "../state/delegation-store.js";

export const delegationStateSchema = z.object({
  action: z.enum(["get", "update"]),
  taskId: z.string().optional(),
  taskType: z.string().optional(),
  newStatus: delegationStatusSchema.optional(),
  agent: delegationAgentSchema.optional(),
  notes: z.string().optional(),
});

export async function delegationChainState(
  input: z.infer<typeof delegationStateSchema>,
  store: DelegationStore
) {
  if (input.action === "get") {
    const state = await store.read();
    return {
      tasks: state.tasks,
      pipeline: {
        thinkQueue: state.tasks.filter((task) => task.currentStatus === "delegated" && task.currentAgent === "claude").map((task) => task.taskId),
        actQueue: state.tasks.filter((task) => task.currentStatus === "approved" || (task.currentStatus === "delegated" && task.currentAgent === "codex")).map((task) => task.taskId),
        verifyQueue: state.tasks.filter((task) => task.currentStatus === "delivered").map((task) => task.taskId),
      },
      blockers: state.blockers,
    };
  }

  if (!input.taskId || !input.newStatus || !input.agent) {
    throw new Error("taskId, newStatus, and agent are required for update action.");
  }

  const state = await store.updateTask({
    taskId: input.taskId,
    taskType: input.taskType,
    newStatus: input.newStatus,
    agent: input.agent,
    notes: input.notes,
  });

  return {
    tasks: state.tasks,
    pipeline: {
      thinkQueue: state.tasks.filter((task) => task.currentStatus === "delegated" && task.currentAgent === "claude").map((task) => task.taskId),
      actQueue: state.tasks.filter((task) => task.currentStatus === "approved" || (task.currentStatus === "delegated" && task.currentAgent === "codex")).map((task) => task.taskId),
      verifyQueue: state.tasks.filter((task) => task.currentStatus === "delivered").map((task) => task.taskId),
    },
    blockers: state.blockers,
  };
}
