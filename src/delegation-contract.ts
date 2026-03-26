import { z } from "zod";

export const DELEGATION_AGENT_LIST = ["codex", "claude", "gemini"] as const;
export const DELEGATION_STATUS_LIST = [
  "delegated",
  "in_review",
  "approved",
  "in_progress",
  "delivered",
  "verified",
  "consolidated",
  "rejected",
  "rework",
  "blocked",
] as const;

export const delegationAgentSchema = z.preprocess(
  (value) => (value === "gpt" ? "codex" : value),
  z.enum(DELEGATION_AGENT_LIST)
);

export const delegationStatusSchema = z.enum(DELEGATION_STATUS_LIST);

export type DelegationAgent = z.infer<typeof delegationAgentSchema>;
export type DelegationStatus = z.infer<typeof delegationStatusSchema>;

export const ALLOWED_TRANSITIONS: Record<DelegationStatus, DelegationStatus[]> = {
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

export function normalizeDelegationAgent(agent: string): DelegationAgent {
  return delegationAgentSchema.parse(agent);
}
