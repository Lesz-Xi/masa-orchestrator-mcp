import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "masa_orchestrator_console";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export interface ConsoleEnv {
  mcpUrl: string;
  apiToken: string;
  passwordHash: string;
  sessionSecret: string;
}

export interface OperatorSession {
  operatorId: string;
  issuedAt: string;
}

export function loadConsoleEnv(): ConsoleEnv {
  const mcpUrl = process.env.ORCHESTRATOR_MCP_URL;
  const apiToken = process.env.ORCHESTRATOR_API_TOKEN;
  const passwordHash = process.env.ORCHESTRATOR_CONSOLE_PASSWORD_HASH;
  const sessionSecret = process.env.ORCHESTRATOR_CONSOLE_SECRET;

  if (!mcpUrl || !apiToken || !passwordHash || !sessionSecret) {
    throw new Error(
      "Missing ORCHESTRATOR_MCP_URL, ORCHESTRATOR_API_TOKEN, ORCHESTRATOR_CONSOLE_PASSWORD_HASH, or ORCHESTRATOR_CONSOLE_SECRET."
    );
  }

  return {
    mcpUrl,
    apiToken,
    passwordHash,
    sessionSecret,
  };
}

export function sanitizeOperatorId(input?: string): string {
  const trimmed = (input || "").trim().toLowerCase();
  if (!trimmed) {
    return "internal-operator";
  }

  return trimmed.replace(/[^a-z0-9_-]/g, "-").slice(0, 48) || "internal-operator";
}

export function normalizeReturnTo(input?: string | string[] | null): string | null {
  const value = Array.isArray(input) ? input[0] : input;
  if (!value?.startsWith("/")) {
    return null;
  }

  if (value.startsWith("//")) {
    return null;
  }

  return value;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  if (passwordHash.startsWith("scrypt:")) {
    const [, saltHex, hashHex] = passwordHash.split(":");
    if (!saltHex || !hashHex) {
      return false;
    }

    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  if (passwordHash.startsWith("sha256:")) {
    const expected = Buffer.from(passwordHash.slice("sha256:".length), "hex");
    const actual = crypto.createHash("sha256").update(password).digest();
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  return false;
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(session: OperatorSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function parseSessionToken(token: string | undefined | null, secret: string): OperatorSession | null {
  if (!token) {
    return null;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = sign(payload, secret);
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OperatorSession;
    const issuedAtMs = Date.parse(parsed.issuedAt);

    if (!parsed.operatorId || Number.isNaN(issuedAtMs) || Date.now() - issuedAtMs > SESSION_TTL_MS) {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}
