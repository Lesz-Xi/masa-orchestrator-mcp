import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, loadConsoleEnv, parseSessionToken } from "../../../../src/lib/auth";
import { TOOL_CATALOG_BY_NAME } from "../../../../src/lib/catalog";
import { callRemoteTool } from "../../../../src/lib/mcp-client";

function requiresConfirmation(toolName: string, toolArgs: Record<string, unknown>): boolean {
  const entry = TOOL_CATALOG_BY_NAME[toolName];
  if (!entry?.mutatesState) return false;
  // Allow read-only actions on otherwise-mutable tools
  const action = toolArgs.action;
  if (typeof action === "string" && ["get", "report"].includes(action)) return false;
  return true;
}

export async function POST(request: Request) {
  const env = loadConsoleEnv();
  const cookieStore = await cookies();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, env.sessionSecret);

  if (!session) {
    return NextResponse.json({ error: { message: "Unauthorized." } }, { status: 401 });
  }

  const csrfHeader = request.headers.get("x-console-request");
  if (csrfHeader !== "1") {
    return NextResponse.json({ error: { message: "CSRF validation failed." } }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        toolName?: string;
        arguments?: Record<string, unknown>;
        confirmMutation?: boolean;
      }
    | null;

  if (!body?.toolName || !TOOL_CATALOG_BY_NAME[body.toolName]) {
    return NextResponse.json({ error: { message: "Unknown tool." } }, { status: 400 });
  }

  const toolArgs = body.arguments || {};
  if (requiresConfirmation(body.toolName, toolArgs) && !body.confirmMutation) {
    return NextResponse.json(
      { error: { message: "Mutation confirmation is required for this action." } },
      { status: 400 }
    );
  }

  try {
    const structuredContent = await callRemoteTool(session, body.toolName, toolArgs);
    return NextResponse.json({
      success: true,
      structuredContent,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Remote tool call failed.",
        },
      },
      { status: 502 }
    );
  }
}
