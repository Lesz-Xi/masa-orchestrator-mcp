import { randomBytes, scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  normalizeReturnTo,
  parseSessionToken,
  sanitizeOperatorId,
  verifyPassword,
} from "../src/lib/auth.js";
import {
  buildAuthorizationServerMetadata,
  buildPkceChallenge,
  consumeAuthorizationCode,
  isAllowedOAuthRedirectUri,
  issueAuthorizationCode,
  registerClient,
} from "../src/lib/oauth.js";

describe("console auth", () => {
  it("verifies scrypt hashes and session round-trips", () => {
    const salt = randomBytes(16);
    const derived = scryptSync("operator-pass", salt, 64);
    const passwordHash = `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;

    expect(
      verifyPassword("operator-pass", passwordHash)
    ).toBe(true);

    const token = createSessionToken(
      {
        operatorId: "ops-chief",
        issuedAt: new Date().toISOString(),
      },
      "console-secret"
    );

    expect(parseSessionToken(token, "console-secret")?.operatorId).toBe("ops-chief");
  });

  it("sanitizes operator ids", () => {
    expect(sanitizeOperatorId(" Lesz Xi / Chief ")).toBe("lesz-xi---chief");
  });

  it("normalizes return destinations and validates oauth redirect URIs", () => {
    expect(normalizeReturnTo("/api/oauth/authorize?client_id=anthropic")).toBe(
      "/api/oauth/authorize?client_id=anthropic"
    );
    expect(normalizeReturnTo("https://evil.example.com")).toBeNull();
    expect(isAllowedOAuthRedirectUri("https://claude.ai/callback")).toBe(true);
    expect(isAllowedOAuthRedirectUri("http://127.0.0.1:4317/callback")).toBe(true);
    expect(isAllowedOAuthRedirectUri("http://evil.example.com/callback")).toBe(false);
  });

  it("issues one-time authorization codes and validates pkce helper", () => {
    const code = issueAuthorizationCode({
      clientId: "anthropic-connector",
      redirectUri: "https://claude.ai/callback",
      codeChallenge: buildPkceChallenge("verifier-123"),
      codeChallengeMethod: "S256",
      operatorId: "ops-chief",
      resource: "https://mcp.wuweism.com/mcp",
    });

    const record = consumeAuthorizationCode(code);
    expect(record?.operatorId).toBe("ops-chief");
    expect(consumeAuthorizationCode(code)).toBeNull();
  });

  it("auth server metadata includes registration_endpoint", () => {
    const meta = buildAuthorizationServerMetadata("https://orchestrator.wuweism.com");
    expect(meta.registration_endpoint).toBe("https://orchestrator.wuweism.com/api/oauth/register");
    expect(meta.token_endpoint_auth_methods_supported).toContain("none");
    expect(meta.code_challenge_methods_supported).toContain("S256");
  });

  it("registers a public PKCE client via registerClient", () => {
    const result = registerClient({
      redirect_uris: ["https://claude.ai/oauth/callback"],
      client_name: "Anthropic Connector",
    });

    expect(result.error).toBeUndefined();
    expect(result.response).toBeDefined();
    expect(result.response!.client_id).toMatch(/^mcpclient-[0-9a-f]{16}$/);
    expect(result.response!.client_name).toBe("Anthropic Connector");
    expect(result.response!.redirect_uris).toEqual(["https://claude.ai/oauth/callback"]);
    expect(result.response!.grant_types).toEqual(["authorization_code"]);
    expect(result.response!.response_types).toEqual(["code"]);
    expect(result.response!.token_endpoint_auth_method).toBe("none");
    expect(result.response!.scope).toBe("mcp");
  });

  it("registerClient is idempotent for the same redirect_uris", () => {
    const r1 = registerClient({ redirect_uris: ["https://claude.ai/oauth/callback"] });
    const r2 = registerClient({ redirect_uris: ["https://claude.ai/oauth/callback"] });
    expect(r1.response!.client_id).toBe(r2.response!.client_id);
  });

  it("registerClient rejects missing redirect_uris", () => {
    const result = registerClient({ redirect_uris: [] });
    expect(result.error).toBeDefined();
    expect(result.error!.error).toBe("invalid_client_metadata");
  });

  it("registerClient rejects disallowed redirect_uris", () => {
    const result = registerClient({ redirect_uris: ["http://evil.example.com/callback"] });
    expect(result.error).toBeDefined();
    expect(result.error!.error).toBe("invalid_redirect_uri");
  });

  it("authorize/token flow works with a dynamically registered client", () => {
    const reg = registerClient({ redirect_uris: ["https://claude.ai/oauth/callback"] });
    const clientId = reg.response!.client_id;

    const code = issueAuthorizationCode({
      clientId,
      redirectUri: "https://claude.ai/oauth/callback",
      codeChallenge: buildPkceChallenge("dynamic-verifier"),
      codeChallengeMethod: "S256",
      operatorId: "ops-chief",
      resource: "https://mcp.wuweism.com/mcp",
    });

    const record = consumeAuthorizationCode(code);
    expect(record).toBeDefined();
    expect(record!.clientId).toBe(clientId);
    expect(record!.operatorId).toBe("ops-chief");

    // Verify PKCE
    expect(record!.codeChallenge).toBe(buildPkceChallenge("dynamic-verifier"));
  });
});
