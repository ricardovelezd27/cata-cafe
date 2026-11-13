import { describe, expect, it } from "vitest";
import {
  ANNOUNCE_MINUTES,
  bannerState,
  closingAtFor,
  closingAtFromRow,
  formatClock,
  isAnnounceMinutes,
  minuteBucket,
  ownerLineState,
  remainingMs,
  shouldAutoClose,
} from "@/lib/closeAnnounce";

describe("announce minutes", () => {
  it("allows exactly 2 and 5", () => {
    expect([...ANNOUNCE_MINUTES]).toEqual([2, 5]);
    expect(isAnnounceMinutes(2)).toBe(true);
    expect(isAnnounceMinutes(5)).toBe(true);
    for (const bad of [0, 1, 3, 10, "2", null, undefined, 2.5]) expect(isAnnounceMinutes(bad)).toBe(false);
  });
  it("closingAtFor adds the lead time to the server clock", () => {
    expect(closingAtFor(1_000_000, 2).getTime()).toBe(1_000_000 + 120_000);
    expect(closingAtFor(1_000_000, 5).getTime()).toBe(1_000_000 + 300_000);
  });
});

describe("remainingMs and clock skew", () => {
  it("uses the server clock: a fast client clock is corrected", () => {
    // server is at 10_000, the client thinks it is 40_000 (30 s fast): skew = -30_000
    const skew = 10_000 - 40_000;
    expect(remainingMs(70_000, 40_000, skew)).toBe(60_000);
    expect(remainingMs(70_000, 100_000, skew)).toBe(0);
  });
});

describe("bannerState", () => {
  const base = { clientNowMs: 1_000, skew: 0, sessionClosed: false };
  it("none without an announcement, and once closed", () => {
    expect(bannerState({ ...base, closingAtMs: null })).toEqual({ kind: "none" });
    expect(bannerState({ ...base, closingAtMs: 999_999, sessionClosed: true })).toEqual({ kind: "none" });
  });
  it("counting while time is left, due at zero and after", () => {
    expect(bannerState({ ...base, closingAtMs: 61_000 })).toEqual({ kind: "counting", remainingMs: 60_000 });
    expect(bannerState({ ...base, closingAtMs: 1_000 })).toEqual({ kind: "due" });
    expect(bannerState({ ...base, closingAtMs: 500 })).toEqual({ kind: "due" });
  });
  it("a cancelled announcement (null) makes the banner disappear", () => {
    expect(bannerState({ ...base, closingAtMs: 61_000 }).kind).toBe("counting");
    expect(bannerState({ ...base, closingAtMs: null }).kind).toBe("none");
  });
});

describe("ownerLineState", () => {
  const base = { clientNowMs: 1_000, skew: 0, sessionClosed: false };
  it("counting / passed / none", () => {
    expect(ownerLineState({ ...base, closingAtMs: 31_000 })).toEqual({ kind: "counting", remainingMs: 30_000 });
    expect(ownerLineState({ ...base, closingAtMs: 1_000 })).toEqual({ kind: "passed" });
    expect(ownerLineState({ ...base, closingAtMs: null })).toEqual({ kind: "none" });
    expect(ownerLineState({ ...base, closingAtMs: 31_000, sessionClosed: true })).toEqual({ kind: "none" });
  });
});

describe("minuteBucket", () => {
  it("rounds up and never reads below 1 while time is left", () => {
    expect(minuteBucket(300_000)).toBe(5);
    expect(minuteBucket(240_001)).toBe(5);
    expect(minuteBucket(240_000)).toBe(4);
    expect(minuteBucket(60_001)).toBe(2);
    expect(minuteBucket(60_000)).toBe(1);
    expect(minuteBucket(1)).toBe(1);
    expect(minuteBucket(0)).toBe(0);
    expect(minuteBucket(-5)).toBe(0);
  });
  it("changes at most once per minute across a 5 minute countdown", () => {
    const seen: number[] = [];
    for (let ms = 300_000; ms > 0; ms -= 1000) {
      const b = minuteBucket(ms);
      if (seen[seen.length - 1] !== b) seen.push(b);
    }
    expect(seen).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("shouldAutoClose", () => {
  it("closes only after watching the countdown run out, once", () => {
    expect(shouldAutoClose({ sawTimeLeft: true, remainingMs: 0, alreadyTried: false })).toBe(true);
    expect(shouldAutoClose({ sawTimeLeft: true, remainingMs: -3000, alreadyTried: false })).toBe(true);
    expect(shouldAutoClose({ sawTimeLeft: true, remainingMs: 10, alreadyTried: false })).toBe(false);
    // page opened after the moment passed: never closes by itself
    expect(shouldAutoClose({ sawTimeLeft: false, remainingMs: -60_000, alreadyTried: false })).toBe(false);
    expect(shouldAutoClose({ sawTimeLeft: true, remainingMs: 0, alreadyTried: true })).toBe(false);
  });
});

describe("formatClock", () => {
  it("m:ss, rounding up so it never shows 0:00 with time left", () => {
    expect(formatClock(120_000)).toBe("2:00");
    expect(formatClock(61_500)).toBe("1:02");
    expect(formatClock(500)).toBe("0:01");
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(-4)).toBe("0:00");
  });
});

describe("closingAtFromRow", () => {
  it("undefined when the row does not carry the column, null when cleared, ms when set", () => {
    expect(closingAtFromRow({ id: "x" })).toBeUndefined();
    expect(closingAtFromRow({ closingAt: null })).toBeNull();
    expect(closingAtFromRow({ closing_at: null })).toBeNull();
    expect(closingAtFromRow({ closingAt: "2026-11-15T10:00:00.000+00:00" })).toBe(Date.parse("2026-11-15T10:00:00.000Z"));
    expect(closingAtFromRow({ closingAt: "2026-11-15 10:00:00" })).toBe(Date.parse("2026-11-15T10:00:00Z"));
  });
});
