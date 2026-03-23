import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "../../../../src/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
  });

  return NextResponse.json({ authenticated: false });
}
