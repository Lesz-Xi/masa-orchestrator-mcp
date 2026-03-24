import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter, redactSensitiveText, safeBearerMatch } from "../src/http/security.js";
import {
  buildProtectedResourceMetadata,
  buildWwwAuthenticateHeader,
  issueConnectorAccessToken,
  verifyConnectorAccessToken,
} from "../src/http/oauth.js";

describe("HTTP security helpers", () => {
  it("matches bearer tokens using timing-safe comparison", () => {
    expect(safeBearerMatch("Bearer shared-token", "shared-token")).toBe(true);
    expect(safeBearerMatch("Bearer wrong-token", "shared-token")).toBe(false);
    expect(safeBearerMatch(undefined, "shared-token")).toBe(false);
  });

  it("redacts bearer and token-like secrets from logs", () => {
    const redacted = redactSensitiveText("Authorization: Bearer abc123 token=secret123 password: pass123");
    expect(redacted).not.toContain("abc123");
    expect(redacted).not.toContain("secret123");
    expect(redacted).not.toContain("pass123");
    expect(redacted).toContain("[REDACTED]");
  });

  it("enforces a fixed-window limit", () => {
    const limiter = new FixedWindowRateLimiter(2, 1000);

    expect(limiter.take("ip:1", 100).allowed).toBe(true);
    expect(limiter.take("ip:1", 200).allowed).toBe(true);
    expect(limiter.take("ip:1", 300).allowed).toBe(false);
    expect(limiter.take("ip:1", 1200).allowed).toBe(true);
  });

  it("issues and verifies connector access tokens", () => {
    const token = issueConnectorAccessToken(
      {
        sub: "ops-chief",
        aud: "https://mcp.wuweism.com/mcp",
        iss: "https://orchestrator.wuweism.com",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
        clientId: "anthropic-connector",
        scope: "mcp",
      },
      "shared-token"
    );

    expect(
      verifyConnectorAccessToken(
        token,
        "shared-token",
        "https://mcp.wuweism.com/mcp",
        "https://orchestrator.wuweism.com"
      )?.sub
    ).toBe("ops-chief");
    expect(
      verifyConnectorAccessToken(
        token,
        "shared-token",
        "https://mcp.wuweism.com/other",
        "https://orchestrator.wuweism.com"
      )
    ).toBeNull();
  });

  it("builds protected resource metadata and authenticate header", () => {
    expect(
      buildProtectedResourceMetadata("https://mcp.wuweism.com/mcp", "https://orchestrator.wuweism.com")
    ).toMatchObject({
      resource: "https://mcp.wuweism.com/mcp",
      authorization_servers: ["https://orchestrator.wuweism.com"],
      bearer_methods_supported: ["header"],
    });

    expect(buildWwwAuthenticateHeader("https://mcp.wuweism.com/.well-known/oauth-protected-resource")).toContain(
      "resource_metadata="
    );
  });
});
