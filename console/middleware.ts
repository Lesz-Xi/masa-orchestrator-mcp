import { NextRequest, NextResponse } from "next/server";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/api/session/login" && req.method === "POST") {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const now = Date.now();
    const entry = loginAttempts.get(ip);

    if (entry && now < entry.resetAt) {
      if (entry.count >= MAX_ATTEMPTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return NextResponse.json(
          { error: "Too many login attempts. Try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfter) },
          }
        );
      }
      entry.count += 1;
      loginAttempts.set(ip, entry);
    } else {
      loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/session/login"],
};
