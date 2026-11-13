import { describe, expect, it } from "vitest";
import {
  CRON_CLOSE_START_BUDGET_MS,
  IDLE_SILENT_CLOSE_MS,
  LIVE_AUTO_CLOSE_MS,
  canCloseNow,
  idleCloseEmailMode,
  liveIdleMs,
  mayStartAnotherClose,
} from "@/lib/closeRules";

const DAY = 24 * 3_600_000;

describe("idleCloseEmailMode (S10 WP4a review H2)", () => {
  it("7 days up to under 30 days: the designed flow, with emails", () => {
    expect(idleCloseEmailMode(LIVE_AUTO_CLOSE_MS)).toBe("await");
    expect(idleCloseEmailMode(7 * DAY + 1)).toBe("await");
    expect(idleCloseEmailMode(20 * DAY)).toBe("await");
    expect(idleCloseEmailMode(30 * DAY - 1)).toBe("await");
  });
  it("30 days or more: closed silently, boundary included", () => {
    expect(IDLE_SILENT_CLOSE_MS).toBe(30 * DAY);
    expect(idleCloseEmailMode(30 * DAY)).toBe("skip");
    expect(idleCloseEmailMode(30 * DAY + 1)).toBe("skip");
    expect(idleCloseEmailMode(200 * DAY)).toBe("skip");
  });
});

describe("liveIdleMs", () => {
  const now = Date.UTC(2026, 10, 20);
  const live = {
    isGroup: true,
    isAsync: false,
    closesAt: null,
    status: "active",
    startedAt: new Date(now - 10 * DAY),
  };
  it("is now minus the later of the start and the last evaluation", () => {
    expect(liveIdleMs(live, null, now)).toBe(10 * DAY);
    expect(liveIdleMs(live, new Date(now - 3_600_000), now)).toBe(3_600_000);
    expect(liveIdleMs(live, new Date(now - 20 * DAY), now)).toBe(10 * DAY);
  });
  it("is null for anything that is not a started live group session", () => {
    expect(liveIdleMs({ ...live, isGroup: false }, null, now)).toBeNull();
    expect(liveIdleMs({ ...live, isAsync: true }, null, now)).toBeNull();
    expect(liveIdleMs({ ...live, closesAt: new Date(now) }, null, now)).toBeNull();
    expect(liveIdleMs({ ...live, status: "closed" }, null, now)).toBeNull();
    expect(liveIdleMs({ ...live, startedAt: null }, null, now)).toBeNull();
  });
});

describe("mayStartAnotherClose (review M1)", () => {
  it("allows a new close before the budget and refuses from it on", () => {
    expect(CRON_CLOSE_START_BUDGET_MS).toBe(150_000);
    expect(mayStartAnotherClose(0)).toBe(true);
    expect(mayStartAnotherClose(149_999)).toBe(true);
    expect(mayStartAnotherClose(150_000)).toBe(false);
    expect(mayStartAnotherClose(299_000)).toBe(false);
    expect(mayStartAnotherClose(10, 5)).toBe(false);
  });
});

describe("canCloseNow (review M2)", () => {
  const ok = { isOwner: true, isGroup: true, status: "active", expired: true };
  it("only the owner of an expired, not closed group session", () => {
    expect(canCloseNow(ok)).toBe(true);
  });
  it("never for anyone else or any other state", () => {
    expect(canCloseNow({ ...ok, isOwner: false })).toBe(false);
    expect(canCloseNow({ ...ok, isGroup: false })).toBe(false);
    expect(canCloseNow({ ...ok, status: "closed" })).toBe(false);
    expect(canCloseNow({ ...ok, expired: false })).toBe(false);
  });
});
