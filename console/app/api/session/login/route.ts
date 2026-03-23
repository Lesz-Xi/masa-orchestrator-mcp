import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  loadConsoleEnv,
  sanitizeOperatorId,
  verifyPassword,
} from "../../../../src/lib/auth";

export async function POST(request: Request) {
  const env = loadConsoleEnv();
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
    operatorId?: string;
  };

  if (!body.password || !verifyPassword(body.password, env.passwordHash)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const operatorId = sanitizeOperatorId(body.operatorId);
  const sessionToken = createSessionToken(
    {
      operatorId,
      issuedAt: new Date().toISOString(),
    },
    env.sessionSecret
  );

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: sessionToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return NextResponse.json({
    authenticated: true,
    operatorId,
  });
}
