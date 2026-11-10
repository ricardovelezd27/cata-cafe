import { describe, expect, it } from "vitest";
import { isInviteUsable } from "../lib/inviteUsable";

describe("isInviteUsable", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("is false without an invite", () => {
    expect(isInviteUsable(null, now)).toBe(false);
  });
  it("respects expiry", () => {
    expect(isInviteUsable({ expiresAt: new Date("2026-11-10T11:00:00Z"), maxUses: null, useCount: 0 }, now)).toBe(false);
    expect(isInviteUsable({ expiresAt: new Date("2026-11-11T11:00:00Z"), maxUses: null, useCount: 0 }, now)).toBe(true);
  });
  it("treats a revoked invite as unusable", () => {
    expect(isInviteUsable({ expiresAt: null, maxUses: null, useCount: 0, active: false }, now)).toBe(false);
    expect(isInviteUsable({ expiresAt: null, maxUses: null, useCount: 0, active: true }, now)).toBe(true);
  });
  it("respects the seat cap", () => {
    expect(isInviteUsable({ expiresAt: null, maxUses: 5, useCount: 5 }, now)).toBe(false);
    expect(isInviteUsable({ expiresAt: null, maxUses: 5, useCount: 4 }, now)).toBe(true);
    expect(isInviteUsable({ expiresAt: null, maxUses: null, useCount: 999 }, now)).toBe(true);
  });
});
