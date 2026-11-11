import { describe, expect, it } from "vitest";
import { dateInZone, endOfDayInZone } from "@/lib/closeRules";

// S8-22 B-06 / D-07: the end of a local day, in every zone, on every day.
const ZONES = [
  "America/Santiago",
  "America/Bogota",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/New_York",
  "America/St_Johns",
  "America/Havana",
  "Europe/Madrid",
  "Africa/Cairo",
  "Asia/Kathmandu",
  "Australia/Lord_Howe",
  "Pacific/Kiritimati",
  "Pacific/Pago_Pago",
  "UTC",
];

function* days(from: string, to: string) {
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    yield new Date(t).toISOString().slice(0, 10);
  }
}

describe("endOfDayInZone sweep", () => {
  it("local date of the result is the requested date and +1 ms is the next local date", () => {
    const bad: string[] = [];
    for (const zone of ZONES) {
      for (const day of days("2026-01-01", "2027-12-31")) {
        const t = endOfDayInZone(day, zone).getTime();
        const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
        if (dateInZone(t, zone) !== day || dateInZone(t + 1, zone) !== nextDay) bad.push(`${zone} ${day}`);
      }
    }
    expect(bad).toEqual([]);
  }, 60_000);

  it("America/Santiago falls back at midnight: the day is 25 hours long", () => {
    // The old result was 02:59:59.999Z, one hour early (the first 23:59:59.999).
    expect(endOfDayInZone("2026-04-04", "America/Santiago").toISOString()).toBe("2026-04-05T03:59:59.999Z");
    expect(endOfDayInZone("2027-04-03", "America/Santiago").toISOString()).toBe("2027-04-04T03:59:59.999Z");
  });
});
