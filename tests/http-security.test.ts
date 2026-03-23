import { describe, expect, it } from "vitest";

import { FixedWindowRateLimiter, redactSensitiveText, safeBearerMatch } from "../src/http/security.js";

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
});
