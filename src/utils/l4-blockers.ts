import fs from "node:fs";
import path from "node:path";

export async function readL4Blockers(workspaceRoot: string): Promise<string[]> {
  const handoffPath = path.join(workspaceRoot, ".agent", "state", "session-handoff.json");

  try {
    const raw = await fs.promises.readFile(handoffPath, "utf8");
    const parsed = JSON.parse(raw) as {
      critical_gaps?: {
        pending_migrations?: string[];
        user_action_required?: string[];
      };
    };

    const blockers = [
      ...(parsed.critical_gaps?.pending_migrations ?? []).map(
        (item) => `Pending migration: ${item}`
      ),
      ...(parsed.critical_gaps?.user_action_required ?? []),
    ];

    return Array.from(new Set(blockers));
  } catch {
    return [];
  }
}
