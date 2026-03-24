import crypto from "node:crypto";

const TOKEN_PREFIX = "masa_oauth.";

export interface ConnectorAccessTokenClaims {
  sub: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  clientId: string;
  scope?: string;
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ["header"];
  scopes_supported: string[];
}

function deriveSigningKey(apiToken: string): Buffer {
  return crypto.createHash("sha256").update(`masa-orchestrator-oauth:${apiToken}`).digest();
}

function signPayload(payload: string, apiToken: string): string {
  return crypto.createHmac("sha256", deriveSigningKey(apiToken)).update(payload).digest("base64url");
}

export function normalizeAbsoluteUrl(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function buildProtectedResourceMetadata(
  resource: string,
  authorizationServerOrigin: string
): ProtectedResourceMetadata {
  return {
    resource,
    authorization_servers: [authorizationServerOrigin],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  };
}

export function buildWwwAuthenticateHeader(resourceMetadataUrl: string): string {
  return `Bearer resource_metadata="${resourceMetadataUrl}"`;
}

export function issueConnectorAccessToken(claims: ConnectorAccessTokenClaims, apiToken: string): string {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = signPayload(payload, apiToken);
  return `${TOKEN_PREFIX}${payload}.${signature}`;
}

export function verifyConnectorAccessToken(
  token: string | undefined | null,
  apiToken: string | undefined,
  expectedAudience: string,
  expectedIssuer: string
): ConnectorAccessTokenClaims | null {
  if (!token || !apiToken || !token.startsWith(TOKEN_PREFIX)) {
    return null;
  }

  const tokenBody = token.slice(TOKEN_PREFIX.length);
  const [payload, signature] = tokenBody.split(".");
  if (!payload || !signature) {
    return null;
  }

  const actual = Buffer.from(signature);
  const expected = Buffer.from(signPayload(payload, apiToken));
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectorAccessTokenClaims;
    const now = Math.floor(Date.now() / 1000);

    if (!claims.sub || !claims.clientId) {
      return null;
    }

    if (claims.exp <= now || claims.iat > now + 30) {
      return null;
    }

    if (claims.aud !== expectedAudience || claims.iss !== expectedIssuer) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}
