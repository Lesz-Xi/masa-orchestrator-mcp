import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, loadConsoleEnv, parseSessionToken } from "../../../../src/lib/auth";

export async function GET() {
  const env = loadConsoleEnv();
  const cookieStore = await cookies();
  const session = parseSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value, env.sessionSecret);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    operatorId: session.operatorId,
  });
}
