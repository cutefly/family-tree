import { describe, expect, it } from "vitest";
import {
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "@/lib/auth";

describe("password hashing", () => {
  it("verifies matching password and rejects wrong password", async () => {
    const hash = await hashPassword("secret-pass-123");
    expect(await verifyPassword("secret-pass-123", hash)).toBe(true);
    expect(await verifyPassword("wrong-pass", hash)).toBe(false);
  });
});

describe("session token", () => {
  it("signs and verifies a valid session token", () => {
    const token = signSessionToken({ userId: "u-1", email: "a@example.com" });
    expect(verifySessionToken(token)).toEqual({
      userId: "u-1",
      email: "a@example.com",
    });
  });

  it("returns null for tampered, malformed, or expired tokens", () => {
    const token = signSessionToken({ userId: "u-1", email: "a@example.com" });
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    expect(verifySessionToken(tampered)).toBeNull();
    expect(verifySessionToken("invalid")).toBeNull();

    const expired = signSessionToken(
      { userId: "u-1", email: "a@example.com" },
      -1000
    );
    expect(verifySessionToken(expired)).toBeNull();
  });
});
