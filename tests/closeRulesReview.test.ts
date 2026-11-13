import { describe, expect, it } from "vitest";
import {
  CRON_CLOSE_START_BUDGET_MS,
  IDLE_SILENT_CLOSE_MS,
  LIVE_AUTO_CLOSE_MS,
  canCloseNow,
  closedSilently,
  idleAtCloseMs,
  repairEmailMode,
  shouldSendLiveIdleReminder,
  LIVE_IDLE_MS,
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

// Second review M-A: the repair pass must not mail a silent idle close.
describe("idleAtCloseMs", () => {
  const begun = new Date(Date.UTC(2026, 0, 1));
  it("closedAt minus the later of startedAt and the last evaluation before the close", () => {
    const closedAt = new Date(begun.getTime() + 90 * DAY);
    expect(idleAtCloseMs({ startedAt: begun, closedAt }, null)).toBe(90 * DAY);
    expect(idleAtCloseMs({ startedAt: begun, closedAt }, new Date(begun.getTime() + 60 * DAY))).toBe(30 * DAY);
  });
  it("null when never started or not closed", () => {
    expect(idleAtCloseMs({ startedAt: null, closedAt: new Date() }, null)).toBeNull();
    expect(idleAtCloseMs({ startedAt: begun, closedAt: null }, null)).toBeNull();
  });
});

describe("repairEmailMode / closedSilently", () => {
  const base = { isLiveGroup: true, idleAtCloseMs: 90 * DAY, closeEmailLedgerRows: 0 };
  it("skip exactly for a live group session idle 30+ days at close with no ledger row", () => {
    expect(repairEmailMode(base)).toBe("skip");
    expect(closedSilently(base)).toBe(true);
  });
  it("the 30-day boundary is the one of idleCloseEmailMode (inclusive)", () => {
    expect(repairEmailMode({ ...base, idleAtCloseMs: IDLE_SILENT_CLOSE_MS })).toBe("skip");
    expect(repairEmailMode({ ...base, idleAtCloseMs: IDLE_SILENT_CLOSE_MS - 1 })).toBe("await");
    for (const ms of [0, 7 * DAY, 29 * DAY, 30 * DAY, 90 * DAY]) {
      expect(repairEmailMode({ ...base, idleAtCloseMs: ms })).toBe(idleCloseEmailMode(ms));
    }
  });
  it("await when it is not a live group session (deadline, solo)", () => {
    expect(repairEmailMode({ ...base, isLiveGroup: false })).toBe("await");
  });
  it("await when idle is unknown (never started)", () => {
    expect(repairEmailMode({ ...base, idleAtCloseMs: null })).toBe("await");
  });
  it("await when anybody already started emailing it (any ledger row)", () => {
    expect(repairEmailMode({ ...base, closeEmailLedgerRows: 1 })).toBe("await");
    expect(closedSilently({ ...base, closeEmailLedgerRows: 3 })).toBe(false);
  });
});

describe("shouldSendLiveIdleReminder (L3)", () => {
  const now = Date.UTC(2026, 5, 30);
  const row = (daysIdle: number) => ({
    isGroup: true,
    isAsync: false,
    closesAt: null,
    status: "active",
    startedAt: new Date(now - daysIdle * DAY),
  });
  it("sends between 24 h and 7 days idle, not before and not at 7 days or more", () => {
    expect(LIVE_IDLE_MS).toBe(DAY);
    expect(shouldSendLiveIdleReminder(row(0.5), null, now)).toBe(false);
    expect(shouldSendLiveIdleReminder(row(1), null, now)).toBe(true);
    expect(shouldSendLiveIdleReminder(row(6.9), null, now)).toBe(true);
    expect(shouldSendLiveIdleReminder(row(7), null, now)).toBe(false);
    expect(shouldSendLiveIdleReminder(row(20), null, now)).toBe(false);
  });
});
