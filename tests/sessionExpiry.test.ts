import { describe, expect, it } from "vitest";
import {
  assertSessionStarted,
  assertSessionWritable,
  canEditSessionSettings,
  canViewGroupResults,
  isSessionExpired,
} from "@/lib/sessionState";

const NOW = new Date("2026-11-10T12:00:00.000Z");

describe("isSessionExpired", () => {
  it("closesAt === now is NOT expired (strict <, same as results page and cron)", () => {
    expect(isSessionExpired({ status: "active", closesAt: new Date(NOW) }, NOW)).toBe(false);
  });
  it("one millisecond past closesAt is expired", () => {
    expect(isSessionExpired({ status: "active", closesAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(true);
  });
  it("future closesAt is writable", () => {
    expect(isSessionExpired({ status: "active", closesAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(false);
  });
  it("null/undefined closesAt falls back to status", () => {
    expect(isSessionExpired({ status: "active", closesAt: null }, NOW)).toBe(false);
    expect(isSessionExpired({ status: "active" }, NOW)).toBe(false);
    expect(isSessionExpired({ status: "closed" }, NOW)).toBe(true);
  });
  it("closed with a future closesAt is still expired", () => {
    expect(isSessionExpired({ status: "closed", closesAt: new Date(NOW.getTime() + 1e6) }, NOW)).toBe(true);
  });
  it("accepts ISO strings and epoch numbers", () => {
    expect(isSessionExpired({ status: "active", closesAt: "2026-11-10T11:59:59.999Z" }, NOW.getTime())).toBe(true);
    expect(isSessionExpired({ status: "active", closesAt: "2026-11-10T12:00:00.001Z" }, NOW)).toBe(false);
  });
  it("agrees with the old results-page expression", () => {
    for (const closesAt of [null, new Date(NOW.getTime() - 5), new Date(NOW.getTime() + 5)]) {
      const old = closesAt ? closesAt < NOW : false;
      expect(isSessionExpired({ status: "active", closesAt }, NOW)).toBe(old);
    }
  });
  it("feeds canViewGroupResults like the page does", () => {
    const row = { status: "active", closesAt: new Date(NOW.getTime() - 1) };
    expect(
      canViewGroupResults({
        isGroup: true,
        ownerRead: false,
        status: row.status,
        sessionExpired: isSessionExpired(row, NOW),
      }),
    ).toBe(true);
  });
});

describe("canEditSessionSettings (S10 WP4a, Kim C9: never reopen)", () => {
  it("an open session with a future or no date can be edited", () => {
    expect(canEditSessionSettings({ status: "active", closesAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(true);
    expect(canEditSessionSettings({ status: "active", closesAt: null }, NOW)).toBe(true);
  });
  it("closesAt === now is still editable (strict <, like the rest)", () => {
    expect(canEditSessionSettings({ status: "active", closesAt: new Date(NOW) }, NOW)).toBe(true);
  });
  it("an expired but not yet closed session refuses ANY change, so the date cannot be moved or cleared", () => {
    expect(canEditSessionSettings({ status: "active", closesAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(false);
  });
  it("a closed session refuses too", () => {
    expect(canEditSessionSettings({ status: "closed", closesAt: null }, NOW)).toBe(false);
  });
});

describe("assertSessionWritable", () => {
  it("throws session_closed once closesAt has passed, status still active", () => {
    expect(() =>
      assertSessionWritable({ status: "active", closesAt: new Date(NOW.getTime() - 1) }, NOW),
    ).toThrow("session_closed");
  });
  it("the status-only call shape keeps working", () => {
    expect(() => assertSessionWritable({ status: "active" }, NOW)).not.toThrow();
    expect(() => assertSessionWritable({ status: "draft" }, NOW)).not.toThrow();
    expect(() => assertSessionWritable({ status: "closed" }, NOW)).toThrow("session_closed");
  });
});

describe("assertSessionStarted", () => {
  const live = { isGroup: true, isAsync: false, startedAt: null, isOwner: false };
  it("blocks a participant on a live group session that has not started", () => {
    expect(() => assertSessionStarted(live)).toThrow("session_not_started");
  });
  it("never blocks the owner, async, solo or a started session", () => {
    expect(() => assertSessionStarted({ ...live, isOwner: true })).not.toThrow();
    expect(() => assertSessionStarted({ ...live, isAsync: true })).not.toThrow();
    expect(() => assertSessionStarted({ ...live, isGroup: false })).not.toThrow();
    expect(() => assertSessionStarted({ ...live, startedAt: NOW })).not.toThrow();
  });
});
