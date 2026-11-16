// Audit J-01 (2026-11-15): a session stored with `closesAt` in the year 20228
// took the whole sessions list down. These pin the two halves of the fix:
// nothing outside years 0000..9999 is accepted any more, and a page that meets
// one anyway serialises it as null instead of throwing.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_DATE_INPUT,
  MAX_PLAIN_ISO_MS,
  MIN_PLAIN_ISO_MS,
  isPlainIsoDate,
  toIsoOrNull,
} from "@/lib/safeDate";
import { LAST_CLOSING_DAY, endOfDayInZone, isCalendarDay } from "@/lib/closeRules";
import { dateOnlyEndOfDay, isoDate } from "@/lib/validate";
import { isSessionExpired, planClosesAtChange } from "@/lib/sessionState";
import { sessionHref } from "@/lib/sessionRouting";

const NOW = Date.parse("2026-11-16T12:00:00.000Z");

describe("isPlainIsoDate", () => {
  it("accepts years 0000..9999 inclusive", () => {
    expect(isPlainIsoDate(new Date(MIN_PLAIN_ISO_MS))).toBe(true);
    expect(isPlainIsoDate(new Date(MAX_PLAIN_ISO_MS))).toBe(true);
    expect(isPlainIsoDate(new Date("2026-08-25T23:59:59.999Z"))).toBe(true);
  });
  it("refuses the year 20228, the year 10000 and an invalid Date", () => {
    expect(isPlainIsoDate(new Date(Date.UTC(20228, 7, 25)))).toBe(false);
    expect(isPlainIsoDate(new Date(MAX_PLAIN_ISO_MS + 1))).toBe(false);
    expect(isPlainIsoDate(new Date(MIN_PLAIN_ISO_MS - 1))).toBe(false);
    expect(isPlainIsoDate(new Date(Number.NaN))).toBe(false);
  });
  it("refuses what is not a Date", () => {
    expect(isPlainIsoDate("2026-08-25")).toBe(false);
    expect(isPlainIsoDate(Date.now())).toBe(false);
    expect(isPlainIsoDate(null)).toBe(false);
  });
});

describe("toIsoOrNull", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is toISOString for an ordinary date and null for no date", () => {
    expect(toIsoOrNull(new Date("2026-08-25T23:59:59.999Z"))).toBe("2026-08-25T23:59:59.999Z");
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(undefined)).toBeNull();
  });

  it("never throws: an invalid Date and a five-digit year become null", () => {
    expect(() => new Date(Number.NaN).toISOString()).toThrow(RangeError);
    expect(toIsoOrNull(new Date(Number.NaN))).toBeNull();
    expect(toIsoOrNull(new Date(Date.UTC(20228, 7, 25)))).toBeNull();
  });

  it("logs a bad date with the context ids only, and nothing for a good one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ctx = { where: "sessions.list", field: "closesAt", sessionId: "cmt7ih71p000204jlfm9fm764" };
    toIsoOrNull(new Date("2026-08-25T00:00:00.000Z"), ctx);
    expect(warn).not.toHaveBeenCalled();
    toIsoOrNull(new Date(Number.NaN), ctx);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line).toMatchObject({
      level: "warn",
      where: "sessions.list",
      field: "closesAt",
      sessionId: "cmt7ih71p000204jlfm9fm764",
      code: "unserialisable_date",
    });
  });

  it("does not log without a context", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    toIsoOrNull(new Date(Number.NaN));
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isCalendarDay", () => {
  it("accepts a real day with a four-digit year", () => {
    expect(isCalendarDay("2026-08-25")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay(MAX_DATE_INPUT)).toBe(true);
  });
  it("refuses the typo of audit J-01 and other shapes", () => {
    expect(isCalendarDay("20228-08-25")).toBe(false);
    expect(isCalendarDay("226-08-25")).toBe(false);
    expect(isCalendarDay("2026-8-25")).toBe(false);
    expect(isCalendarDay("2026-08-25T00:00")).toBe(false);
    expect(isCalendarDay(20260825)).toBe(false);
  });
  it("refuses a day the month does not have (no roll-over into the next month)", () => {
    expect(isCalendarDay("2026-02-31")).toBe(false);
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("2026-00-10")).toBe(false);
  });
});

describe("endOfDayInZone refuses a closing date it cannot store (wizard create path)", () => {
  it("five-digit year, impossible day, past the last closing day", () => {
    expect(() => endOfDayInZone("20228-08-25", "America/Santiago")).toThrow("invalid_input");
    expect(() => endOfDayInZone("2026-02-31", "America/Santiago")).toThrow("invalid_input");
    expect(() => endOfDayInZone("9999-12-31", "America/Santiago")).toThrow("invalid_input");
    expect(() => endOfDayInZone("9999-12-31", null)).toThrow("invalid_input");
  });
  it("the last closing day still works in every zone and serialises", () => {
    for (const zone of [null, "UTC", "Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Santiago"]) {
      const end = endOfDayInZone(LAST_CLOSING_DAY, zone);
      expect(isPlainIsoDate(end)).toBe(true);
      expect(() => end.toISOString()).not.toThrow();
    }
  });
  it("an ordinary day is unchanged by the new checks", () => {
    expect(endOfDayInZone("2026-08-25", "America/Santiago").toISOString()).toBe("2026-08-26T03:59:59.999Z");
  });
});

describe("planClosesAtChange (edit path through updateSession)", () => {
  const group = { isGroup: true };

  it("answers invalid_closes_at for the J-01 typo and an impossible day", () => {
    expect(() => planClosesAtChange(group, "20228-08-25", NOW, "America/Santiago")).toThrow("invalid_closes_at");
    expect(() => planClosesAtChange(group, "2026-02-31", NOW, "America/Santiago")).toThrow("invalid_closes_at");
    expect(() => planClosesAtChange(group, "9999-12-31", NOW, null)).toThrow("invalid_closes_at");
  });

  it("an unreadable stored date can be replaced by a valid day (never a no-op, never a crash)", () => {
    const stored = { isGroup: true, closesAt: new Date(Number.NaN), closesAtZone: "America/Santiago" };
    const plan = planClosesAtChange(stored, "2026-12-01", NOW, "America/Santiago");
    expect(plan?.closesAt?.toISOString()).toBe("2026-12-02T02:59:59.999Z");
    expect(planClosesAtChange(stored, "", NOW)).toMatchObject({ closesAt: null, isAsync: false });
  });
});

describe("isoDate and dateOnlyEndOfDay (lib/validate.ts)", () => {
  it("isoDate refuses a five-digit year that new Date() would happily parse", () => {
    expect(Number.isNaN(new Date("20228-08-25").getTime())).toBe(false);
    expect(() => isoDate("20228-08-25", "date")).toThrow("invalid_input");
    expect(() => isoDate("+020228-08-25T00:00:00.000Z", "date")).toThrow("invalid_input");
    expect(isoDate("2026-08-25", "date").toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });
  it("dateOnlyEndOfDay refuses an impossible day", () => {
    expect(() => dateOnlyEndOfDay("2026-02-31", "d")).toThrow("invalid_input");
    expect(dateOnlyEndOfDay("2026-02-28", "d").toISOString()).toBe("2026-02-28T23:59:59.999Z");
  });
});

describe("a far-future or unreadable closesAt never crashes the expiry rules", () => {
  const far = new Date(Date.UTC(20228, 7, 25));
  const bad = new Date(Number.NaN);
  it("isSessionExpired: not expired, no throw", () => {
    expect(isSessionExpired({ status: "active", closesAt: far }, NOW)).toBe(false);
    expect(isSessionExpired({ status: "active", closesAt: bad }, NOW)).toBe(false);
    expect(isSessionExpired({ status: "closed", closesAt: bad }, NOW)).toBe(true);
  });
  it("sessionHref still answers", () => {
    const s = { id: "s1", status: "active", isGroup: true, isAsync: true, startedAt: null };
    expect(sessionHref({ ...s, closesAt: bad }, { locale: "es", isOwner: false }, NOW)).toBe("/es/app/sessions/s1/cup");
    expect(sessionHref({ ...s, closesAt: far }, { locale: "es", isOwner: true }, NOW)).toBe("/es/app/sessions/s1/cup");
  });
});
