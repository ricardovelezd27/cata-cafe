import { describe, expect, it } from "vitest";
import { dateInZone, endOfDayInZone, isValidTimeZone, normalizeZone } from "@/lib/closeRules";
import { planClosesAtChange } from "@/lib/sessionState";

describe("endOfDayInZone", () => {
  it("null zone is UTC, the behaviour before the zone existed", () => {
    expect(endOfDayInZone("2026-10-01", null).toISOString()).toBe("2026-10-01T23:59:59.999Z");
    expect(endOfDayInZone("2026-10-01", "UTC").toISOString()).toBe("2026-10-01T23:59:59.999Z");
  });
  it("UTC-5 (Bogota): end of day is 04:59:59.999Z next day", () => {
    expect(endOfDayInZone("2026-11-10", "America/Bogota").toISOString()).toBe("2026-11-11T04:59:59.999Z");
  });
  it("UTC-3 (Buenos Aires)", () => {
    expect(endOfDayInZone("2026-11-10", "America/Argentina/Buenos_Aires").toISOString()).toBe(
      "2026-11-11T02:59:59.999Z",
    );
  });
  it("UTC+1 (Madrid, winter)", () => {
    expect(endOfDayInZone("2026-11-10", "Europe/Madrid").toISOString()).toBe("2026-11-10T22:59:59.999Z");
  });
  it("daylight saving: Madrid summer is UTC+2, and the change days are exact", () => {
    expect(endOfDayInZone("2026-07-01", "Europe/Madrid").toISOString()).toBe("2026-07-01T21:59:59.999Z");
    // Spring forward 2026-03-29: the day ends at +02:00.
    expect(endOfDayInZone("2026-03-29", "Europe/Madrid").toISOString()).toBe("2026-03-29T21:59:59.999Z");
    // Fall back 2026-10-25: the day ends at +01:00.
    expect(endOfDayInZone("2026-10-25", "Europe/Madrid").toISOString()).toBe("2026-10-25T22:59:59.999Z");
  });
  it("rejects malformed dates and unknown zones", () => {
    expect(() => endOfDayInZone("2026-9-1", "UTC")).toThrow("invalid_input");
    expect(() => endOfDayInZone("2026-13-45", "UTC")).toThrow("invalid_input");
    expect(() => endOfDayInZone(20261001, "UTC")).toThrow("invalid_input");
    expect(() => endOfDayInZone("2026-10-01", "Mars/Olympus")).toThrow("invalid_input");
  });
});

describe("dateInZone", () => {
  it("reads the instant back as the day the owner picked", () => {
    const d = endOfDayInZone("2026-11-10", "America/Bogota");
    expect(dateInZone(d, "America/Bogota")).toBe("2026-11-10");
    // In UTC the same instant is already the next day, which is the old bug.
    expect(dateInZone(d, null)).toBe("2026-11-11");
  });
});

describe("zone validation", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("America/Bogota")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("../../etc")).toBe(false);
    expect(normalizeZone("nope")).toBeNull();
    expect(normalizeZone("Europe/Madrid")).toBe("Europe/Madrid");
  });
});

describe("planClosesAtChange with a zone", () => {
  const group = { isGroup: true, closesAt: null as Date | null, closesAtZone: null as string | null };
  // 2026-11-10 20:00 in Bogota = 2026-11-11 01:00Z
  const NOW = Date.parse("2026-11-11T01:00:00Z");

  it("a Bogota owner picking today at 20:00 is accepted and closes after 23:59 local", () => {
    const plan = planClosesAtChange(group, "2026-11-10", NOW, "America/Bogota");
    expect(plan?.closesAt?.toISOString()).toBe("2026-11-11T04:59:59.999Z");
    expect(plan?.closesAtZone).toBe("America/Bogota");
    expect(plan?.isAsync).toBe(true);
  });

  it("the same pick without a zone (UTC) is already in the past", () => {
    expect(() => planClosesAtChange(group, "2026-11-10", Date.parse("2026-11-11T05:00:00Z"))).toThrow(
      "invalid_closes_at",
    );
  });

  it("(pure rule only) an unchanged Bogota day is a no-op even after it passed; updateSession refuses an expired session first (S10 C9)", () => {
    const stored = { isGroup: true, closesAt: new Date("2026-11-11T04:59:59.999Z"), closesAtZone: "America/Bogota" };
    expect(planClosesAtChange(stored, "2026-11-10", Date.parse("2026-11-12T00:00:00Z"), "America/Bogota")).toBeNull();
  });

  it("clearing resets the zone too", () => {
    const stored = { isGroup: true, closesAt: new Date(NOW + 1e6), closesAtZone: "America/Bogota" };
    expect(planClosesAtChange(stored, "", NOW)).toEqual({ closesAt: null, closesAtZone: null, isAsync: false });
  });

  it("an unknown zone falls back to UTC instead of failing the save", () => {
    const plan = planClosesAtChange(group, "2026-11-20", NOW, "Mars/Olympus");
    expect(plan?.closesAt?.toISOString()).toBe("2026-11-20T23:59:59.999Z");
    expect(plan?.closesAtZone).toBeNull();
  });
});
