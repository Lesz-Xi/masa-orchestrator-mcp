import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";

const BEARER_PREFIX = "Bearer ";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  take(key: string, now = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
    const current = this.entries.get(key);

    if (!current || now >= current.resetAt) {
      const resetAt = now + this.windowMs;
      this.entries.set(key, { count: 1, resetAt });
      this.prune(now);
      return {
        allowed: true,
        remaining: Math.max(this.maxRequests - 1, 0),
        resetAt,
      };
    }

    current.count += 1;
    this.entries.set(key, current);

    return {
      allowed: current.count <= this.maxRequests,
      remaining: Math.max(this.maxRequests - current.count, 0),
      resetAt: current.resetAt,
    };
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

export function safeBearerMatch(
  authorizationHeader: string | undefined,
  expectedToken: string | undefined
): boolean {
  if (!expectedToken) {
    return false;
  }

  if (!authorizationHeader?.startsWith(BEARER_PREFIX)) {
    return false;
  }

  const actualToken = authorizationHeader.slice(BEARER_PREFIX.length).trim();
  const actual = Buffer.from(actualToken);
  const expected = Buffer.from(expectedToken);

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}

export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]!.trim();
  }

  return req.socket.remoteAddress || "unknown";
}

export function getCallerId(req: IncomingMessage): string {
  const operatorId = req.headers["x-operator-id"];
  if (typeof operatorId === "string" && operatorId.trim()) {
    return operatorId.trim();
  }

  return `ip:${getClientIp(req)}`;
}

export function assertAllowedOrigin(req: IncomingMessage, allowedOrigins: string[]): void {
  if (allowedOrigins.length === 0) {
    return;
  }

  const origin = req.headers.origin;
  if (!origin) {
    return;
  }

  if (!allowedOrigins.includes(origin)) {
    throw new HttpError(403, "Origin not allowed.", "origin_not_allowed");
  }
}

export async function readJsonBody(
  req: IncomingMessage,
  maxBytes: number
): Promise<{ parsedBody: unknown; bytesRead: number }> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytesRead = 0;

    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += buffer.byteLength;

      if (bytesRead > maxBytes) {
        reject(new HttpError(413, "Request body too large.", "body_too_large"));
        req.destroy();
        return;
      }

      chunks.push(buffer);
    });

    req.once("end", () => {
      if (chunks.length === 0) {
        resolve({ parsedBody: undefined, bytesRead });
        return;
      }

      try {
        const parsedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve({ parsedBody, bytesRead });
      } catch (error) {
        reject(new HttpError(400, "Invalid JSON body.", "invalid_json"));
      }
    });

    req.once("error", (error) => {
      reject(error);
    });
  });
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(token|secret|password)(["'=:\s]+)([^"',\s]+)/gi, "$1$2[REDACTED]");
}
