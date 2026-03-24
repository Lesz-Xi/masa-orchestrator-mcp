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
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

/* ------------------------------------------------------------------ */
/*  RFC 7591 - Dynamic Client Registration (minimal, stateless)       */
/* ------------------------------------------------------------------ */

export interface ClientRegistrationRequest {
  redirect_uris: string[];
  client_name?: string;
  grant_types?: string[];
  response_types?: string[];
  token_endpoint_auth_method?: string;
  scope?: string;
}

export interface ClientRegistrationResponse {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope: string;
}

/**
 * Deterministic client_id derived from the sorted redirect URIs.
 * This keeps registration stateless and idempotent — re-registering
 * with the same redirect_uris always returns the same client_id.
 */
function deriveClientId(redirectUris: string[]): string {
  const canonical = [...redirectUris].sort().join("\n");
  const hash = crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return `mcpclient-${hash}`;
}

export function registerClient(body: unknown): {
  response?: ClientRegistrationResponse;
  error?: { error: string; error_description: string };
} {
  if (!body || typeof body !== "object") {
    return { error: { error: "invalid_client_metadata", error_description: "Request body must be a JSON object." } };
  }

  const req = body as Record<string, unknown>;

  // redirect_uris is required per RFC 7591
  if (!Array.isArray(req.redirect_uris) || req.redirect_uris.length === 0) {
    return { error: { error: "invalid_client_metadata", error_description: "redirect_uris must be a non-empty array." } };
  }

  const redirectUris: string[] = [];
  for (const uri of req.redirect_uris) {
    if (typeof uri !== "string") {
      return { error: { error: "invalid_client_metadata", error_description: "Each redirect_uri must be a string." } };
    }
    if (!isAllowedOAuthRedirectUri(uri)) {
      return { error: { error: "invalid_redirect_uri", error_description: `Redirect URI not allowed: ${uri}` } };
    }
    redirectUris.push(uri);
  }

  // Validate grant_types if provided — we only support authorization_code
  const grantTypes = Array.isArray(req.grant_types) ? req.grant_types as string[] : ["authorization_code"];
  if (!grantTypes.includes("authorization_code")) {
    return { error: { error: "invalid_client_metadata", error_description: "Only authorization_code grant type is supported." } };
  }

  // Validate token_endpoint_auth_method — we only support "none" (public client)
  const authMethod = typeof req.token_endpoint_auth_method === "string"
    ? req.token_endpoint_auth_method
    : "none";
  if (authMethod !== "none") {
    return { error: { error: "invalid_client_metadata", error_description: "Only token_endpoint_auth_method \"none\" is supported." } };
  }

  const clientName = typeof req.client_name === "string" ? req.client_name : undefined;

  const response: ClientRegistrationResponse = {
    client_id: deriveClientId(redirectUris),
    ...(clientName ? { client_name: clientName } : {}),
    redirect_uris: redirectUris,
    grant_types: ["authorization_code"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: "mcp",
  };

  return { response };
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
