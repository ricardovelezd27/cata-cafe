import { describe, expect, it } from "vitest";
import { joinBlock } from "../lib/joinability";

const NOW = new Date("2026-11-10T12:00:00Z");
const H = 3600_000;
const open = { status: "active", closesAt: null as Date | null };
const free = { expiresAt: null as Date | null, maxUses: null as number | null, useCount: 0 };

describe("joinBlock", () => {
  it("lets a live invite on an open session through", () => {
    expect(joinBlock(free, open, NOW)).toBeNull();
  });

  it("unknown invite or session is invalid_token", () => {
    expect(joinBlock(null, open, NOW)).toBe("invalid_token");
    expect(joinBlock(free, null, NOW)).toBe("invalid_token");
  });

  it("an expired invite wins over everything after it", () => {
    const expired = { ...free, expiresAt: new Date(NOW.getTime() - H), maxUses: 1, useCount: 1 };
    expect(joinBlock(expired, { status: "closed", closesAt: null }, NOW)).toBe("token_expired");
  });

  it("a closed or past-deadline session is session_closed, before seats", () => {
    const full = { ...free, maxUses: 1, useCount: 1 };
    expect(joinBlock(full, { status: "closed", closesAt: null }, NOW)).toBe("session_closed");
    expect(joinBlock(free, { status: "active", closesAt: new Date(NOW.getTime() - H) }, NOW)).toBe("session_closed");
    expect(joinBlock(free, { status: "active", closesAt: new Date(NOW.getTime() + H) }, NOW)).toBeNull();
  });

  it("a full invite is token_exhausted; one seat left is fine", () => {
    expect(joinBlock({ ...free, maxUses: 5, useCount: 5 }, open, NOW)).toBe("token_exhausted");
    expect(joinBlock({ ...free, maxUses: 5, useCount: 4 }, open, NOW)).toBeNull();
  });
});
