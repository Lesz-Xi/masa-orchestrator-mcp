import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, loadConsoleEnv, parseSessionToken } from "../../../src/lib/auth";
import { fetchRemoteActivity } from "../../../src/lib/mcp-client";

export async function GET() {
  const env = loadConsoleEnv();
  const cookieStore = await cookies();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, env.sessionSecret);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    return NextResponse.json({
      activity: await fetchRemoteActivity(session, 30),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load activity.",
      },
      { status: 502 }
    );
  }
}
