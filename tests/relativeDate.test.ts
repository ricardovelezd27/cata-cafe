import { describe, expect, it } from "vitest";
import { formatRelativeDate, type RelativeDateLabels } from "@/lib/relativeDate";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

const ES: RelativeDateLabels = {
  today: "hoy",
  oneDay: "hace 1 día",
  days: "hace {n} días",
  oneMonth: "hace 1 mes",
  months: "hace {n} meses",
  oneYear: "hace 1 año",
  years: "hace {n} años",
};
const NOW = new Date("2026-11-14T12:00:00Z").getTime();
const ago = (days: number) => new Date(NOW - days * 86_400_000);

describe("formatRelativeDate", () => {
  it("keeps the wording the card had in Spanish", () => {
    expect(formatRelativeDate(ago(0), ES, NOW)).toBe("hoy");
    expect(formatRelativeDate(ago(1), ES, NOW)).toBe("hace 1 día");
    expect(formatRelativeDate(ago(5), ES, NOW)).toBe("hace 5 días");
    expect(formatRelativeDate(ago(29), ES, NOW)).toBe("hace 29 días");
    expect(formatRelativeDate(ago(30), ES, NOW)).toBe("hace 1 mes");
    expect(formatRelativeDate(ago(75), ES, NOW)).toBe("hace 2 meses");
    expect(formatRelativeDate(ago(365), ES, NOW)).toBe("hace 1 año");
    expect(formatRelativeDate(ago(800), ES, NOW)).toBe("hace 2 años");
  });
  it("a date in the future reads as today", () => {
    expect(formatRelativeDate(ago(-3), ES, NOW)).toBe("hoy");
  });
  it("both message files carry every label, with the placeholder where it belongs", () => {
    for (const m of [es, en]) {
      const g = m.groups as unknown as Record<string, string>;
      for (const k of ["lastSession", "relToday", "relOneDay", "relDays", "relOneMonth", "relMonths", "relOneYear", "relYears"]) {
        expect(typeof g[k]).toBe("string");
      }
      for (const k of ["relDays", "relMonths", "relYears"]) expect(g[k]).toContain("{n}");
    }
  });
});
