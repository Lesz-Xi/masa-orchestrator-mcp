import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const stateDir = path.join(packageRoot, ".agent", "state");

const files = [
  {
    path: path.join(stateDir, "session-handoff.json"),
    content: JSON.stringify(
      {
        generatedBy: "masa-orchestrator-mcp bootstrap",
        generatedAt: new Date().toISOString(),
        summary: "Bootstrap placeholder. Replace with active session handoff content.",
        critical_gaps: {
          pending_migrations: [],
          user_action_required: [
            "Populate .agent/state/session-handoff.json with current session context before relying on bootstrap-derived blockers.",
          ],
        },
      },
      null,
      2
    ),
  },
  {
    path: path.join(stateDir, "session-handoff.md"),
    content: [
      "# Session Handoff",
      "",
      "Bootstrap placeholder.",
      "",
      "Replace this file with the active handoff summary for the current session.",
      "",
      "## Critical Gaps",
      "",
      "- HUMAN FOLLOW-UP REQUIRED: populate the session handoff before relying on bootstrap state.",
      "",
    ].join("\n"),
  },
  {
    path: path.join(stateDir, "causal-graph-registry.json"),
    content: JSON.stringify(
      {
        scmRegistryVersion: 1,
        graphs: [],
      },
      null,
      2
    ),
  },
  {
    path: path.join(stateDir, "identification-cache.json"),
    content: JSON.stringify(
      {
        cacheVersion: 1,
        queries: [],
      },
      null,
      2
    ),
  },
];

fs.mkdirSync(stateDir, { recursive: true });

for (const file of files) {
  if (!fs.existsSync(file.path)) {
    fs.writeFileSync(file.path, file.content);
  }
}

const handoff = JSON.parse(
  fs.readFileSync(path.join(stateDir, "session-handoff.json"), "utf8")
);
const criticalGaps = handoff?.critical_gaps?.user_action_required ?? [];

console.log("MASA bootstrap ready");
for (const file of files) {
  console.log(`- ${path.relative(packageRoot, file.path)}`);
}

if (criticalGaps.length > 0) {
  console.log("critical_gaps.user_action_required:");
  for (const gap of criticalGaps) {
    console.log(`- ${gap}`);
  }
}
