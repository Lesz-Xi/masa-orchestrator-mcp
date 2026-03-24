import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createSessionToken,
  normalizeReturnTo,
  parseSessionToken,
  sanitizeOperatorId,
  verifyPassword,
} from "../src/lib/auth.js";
import {
  buildPkceChallenge,
  consumeAuthorizationCode,
  isAllowedOAuthRedirectUri,
  issueAuthorizationCode,
} from "../src/lib/oauth.js";

describe("console auth", () => {
  it("verifies scrypt hashes and session round-trips", () => {
    const passwordHash = `sha256:${createHash("sha256").update("operator-pass").digest("hex")}`;

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
});
