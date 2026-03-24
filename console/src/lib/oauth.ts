import crypto, { randomUUID } from "node:crypto";

import { issueConnectorAccessToken, normalizeAbsoluteUrl } from "../../../src/http/oauth";

const AUTHORIZATION_CODE_TTL_MS = 1000 * 60 * 5;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 10;

interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  operatorId: string;
  resource: string;
  issuedAt: number;
}

const GLOBAL_CODE_STORE = Symbol.for("masa-orchestrator.oauth.codes");

function codeStore(): Map<string, AuthorizationCodeRecord> {
  const globalState = globalThis as Record<PropertyKey, unknown>;
  if (!globalState[GLOBAL_CODE_STORE]) {
    globalState[GLOBAL_CODE_STORE] = new Map<string, AuthorizationCodeRecord>();
  }

  return globalState[GLOBAL_CODE_STORE] as Map<string, AuthorizationCodeRecord>;
}

function pruneExpiredCodes(now = Date.now()): void {
  for (const [code, record] of codeStore()) {
    if (now - record.issuedAt > AUTHORIZATION_CODE_TTL_MS) {
      codeStore().delete(code);
    }
  }
}

export function isAllowedOAuthRedirectUri(value: string | null): value is string {
  const normalized = normalizeAbsoluteUrl(value);
  if (!normalized) {
    return false;
  }

  const url = new URL(normalized);
  if (url.protocol === "https:") {
    return true;
  }

  return url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
}

export function buildAuthorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

export function issueAuthorizationCode(record: Omit<AuthorizationCodeRecord, "issuedAt">): string {
  pruneExpiredCodes();
  const code = randomUUID();
  codeStore().set(code, {
    ...record,
    issuedAt: Date.now(),
  });
  return code;
}

export function consumeAuthorizationCode(code: string): AuthorizationCodeRecord | null {
  pruneExpiredCodes();
  const record = codeStore().get(code) || null;
  if (record) {
    codeStore().delete(code);
  }
  return record;
}

export function buildAuthorizeErrorRedirect(
  redirectUri: string,
  error: string,
  state?: string | null,
  description?: string
): URL {
  const location = new URL(redirectUri);
  location.searchParams.set("error", error);
  if (state) {
    location.searchParams.set("state", state);
  }
  if (description) {
    location.searchParams.set("error_description", description);
  }
  return location;
}

export function buildPkceChallenge(codeVerifier: string): string {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

export function issueAuthorizationCodeAccessToken(params: {
  apiToken: string;
  authServerOrigin: string;
  clientId: string;
  operatorId: string;
  resource: string;
}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    accessToken: issueConnectorAccessToken(
      {
        sub: params.operatorId,
        aud: params.resource,
        iss: params.authServerOrigin,
        iat: issuedAt,
        exp: issuedAt + ACCESS_TOKEN_TTL_SECONDS,
        clientId: params.clientId,
        scope: "mcp",
      },
      params.apiToken
    ),
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}
