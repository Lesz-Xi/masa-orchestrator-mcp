import { z } from "zod";

import { TOOL_NAME_LIST } from "./tool-names.js";

const toolNameEnum = z.enum(TOOL_NAME_LIST);

export const clientIdSchema = z.enum(["codex", "claude", "gemini"]);
export const clientRoleSchema = z.enum(["executor", "specifier", "auditor"]);
export const transportSchema = z.enum(["stdio", "http"]);
export const fallbackTransportSchema = z.enum(["stdio", "http", "none"]);
export const strictClaimModeSchema = z.enum(["standard", "strict"]);
export const delegationAuthoritySchema = z.enum(["read_only", "update_state"]);
export const outputStyleSchema = z.enum(["implementation", "review", "audit"]);

export const clientProfileSchema = z
  .object({
    id: clientIdSchema,
    displayName: z.string().min(1),
    role: clientRoleSchema,
    preferredTransport: transportSchema,
    fallbackTransport: fallbackTransportSchema,
    enabledTools: z.array(toolNameEnum).min(1),
    toolPriority: z.array(toolNameEnum).min(1),
    strictClaimMode: strictClaimModeSchema,
    delegationAuthority: delegationAuthoritySchema,
    defaultTaskLens: z.string().min(1),
    promptTemplate: z.string().min(1),
    outputStyle: outputStyleSchema,
    notes: z.array(z.string()),
  })
  .superRefine((profile, context) => {
    const enabledTools = new Set(profile.enabledTools);

    for (const tool of profile.toolPriority) {
      if (!enabledTools.has(tool)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `toolPriority entry '${tool}' must be present in enabledTools.`,
          path: ["toolPriority"],
        });
      }
    }

    if (
      profile.fallbackTransport !== "none" &&
      profile.preferredTransport === profile.fallbackTransport
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "preferredTransport and fallbackTransport must differ unless fallbackTransport is 'none'.",
        path: ["fallbackTransport"],
      });
    }

    if (profile.id === "codex" && profile.delegationAuthority !== "update_state") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Codex profile must use delegationAuthority='update_state' in v1.",
        path: ["delegationAuthority"],
      });
    }

    if (
      (profile.id === "claude" || profile.id === "gemini") &&
      profile.delegationAuthority !== "read_only"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${profile.id} profile must use delegationAuthority='read_only' in v1.`,
        path: ["delegationAuthority"],
      });
    }
  });

export type ClientProfile = z.infer<typeof clientProfileSchema>;
