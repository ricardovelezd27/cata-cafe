import { describe, expect, it } from "vitest";
import {
  COFFEE_INVITE_TTL_DAYS,
  coffeeInviteExpiry,
  isCoffeeInviteUsable,
} from "@/lib/coffeeInvite";

describe("coffee invite rules (S8-12, F-cafes-4)", () => {
  const now = new Date("2026-11-10T12:00:00Z");

  it("new links expire after the TTL", () => {
    const exp = coffeeInviteExpiry(now);
    expect(exp.getTime() - now.getTime()).toBe(COFFEE_INVITE_TTL_DAYS * 86_400_000);
    expect(COFFEE_INVITE_TTL_DAYS).toBe(30);
  });

  it("a legacy link without expiry stays usable until seats run out", () => {
    expect(isCoffeeInviteUsable({ expiresAt: null, maxUses: null, useCount: 99 }, now)).toBe(true);
    expect(isCoffeeInviteUsable({ expiresAt: null, maxUses: 3, useCount: 3 }, now)).toBe(false);
    expect(isCoffeeInviteUsable({ expiresAt: null, maxUses: 3, useCount: 2 }, now)).toBe(true);
  });

  it("an expired link is dead, exactly at the boundary too", () => {
    expect(
      isCoffeeInviteUsable({ expiresAt: new Date("2026-11-10T11:59:59Z"), maxUses: null, useCount: 0 }, now),
    ).toBe(false);
    expect(isCoffeeInviteUsable({ expiresAt: now, maxUses: null, useCount: 0 }, now)).toBe(false);
    expect(
      isCoffeeInviteUsable({ expiresAt: new Date("2026-11-10T12:00:01Z"), maxUses: null, useCount: 0 }, now),
    ).toBe(true);
  });
});
