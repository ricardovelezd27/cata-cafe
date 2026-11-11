import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOUNDING_SEATS } from "@/lib/landing/founding";

describe("founding seats copy", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(FOUNDING_SEATS)).toBe(true);
    expect(FOUNDING_SEATS).toBeGreaterThan(0);
  });

  it("the landing copy takes the number from the constant, never a literal", () => {
    for (const lang of ["es", "en"]) {
      const founding = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8")).landing.founding;
      expect(founding.offer, lang).toContain("{count}");
      expect(JSON.stringify(founding), lang).not.toMatch(/\b100\b/);
      expect(founding.heroCount).toBeUndefined();
    }
  });

  it("the success copy no longer claims a reserved seat", () => {
    const es = JSON.parse(readFileSync("messages/es.json", "utf8")).landing.waitlist.success;
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")).landing.waitlist.success;
    expect(es).not.toMatch(/Plaza reservada/i);
    expect(en).not.toMatch(/Seat reserved/i);
  });
});
