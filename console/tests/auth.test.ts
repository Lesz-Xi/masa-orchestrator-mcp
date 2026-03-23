import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createSessionToken, parseSessionToken, sanitizeOperatorId, verifyPassword } from "../src/lib/auth.js";

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
});
