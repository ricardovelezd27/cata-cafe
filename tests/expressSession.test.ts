import { describe, expect, it } from "vitest";
import {
  EXPRESS_DEFAULT_SAMPLES,
  EXPRESS_MAX_SAMPLES,
  EXPRESS_NOTE_KEY,
  clampSampleCount,
  defaultExpressName,
  expressSampleLabel,
  validateExpressInput,
} from "@/lib/expressSession";
import { ValidationError } from "@/lib/validate";

describe("validateExpressInput", () => {
  it("normalizes a valid payload (trims the name, keeps format + count)", () => {
    expect(
      validateExpressInput({ name: "  Feria Madrid  ", format: "affective", sampleCount: 6 }),
    ).toEqual({ name: "Feria Madrid", format: "affective", sampleCount: 6 });
    expect(validateExpressInput({ name: "x", format: "descriptive", sampleCount: "3" })).toEqual({
      name: "x",
      format: "descriptive",
      sampleCount: 3,
    });
  });

  it("throws invalid_input (a ValidationError) on every bad field", () => {
    const bad = [
      { name: "", format: "affective", sampleCount: 6 },
      { name: "a".repeat(121), format: "affective", sampleCount: 6 },
      { name: "ok", format: "sca2004", sampleCount: 6 },
      { name: "ok", format: "affective", sampleCount: 0 },
      { name: "ok", format: "affective", sampleCount: EXPRESS_MAX_SAMPLES + 1 },
      { name: "ok", format: "affective", sampleCount: 2.5 },
      { name: "ok", format: "affective" },
    ];
    for (const input of bad) {
      expect(() => validateExpressInput(input)).toThrow(ValidationError);
      expect(() => validateExpressInput(input)).toThrow("invalid_input");
    }
  });

  it("accepts the bounds exactly", () => {
    expect(validateExpressInput({ name: "ok", format: "combined", sampleCount: 1 }).sampleCount).toBe(1);
    expect(
      validateExpressInput({ name: "ok", format: "combined", sampleCount: EXPRESS_MAX_SAMPLES })
        .sampleCount,
    ).toBe(EXPRESS_MAX_SAMPLES);
  });
});

describe("express labels and defaults", () => {
  it("letters the samples A… so a phone reads them at a glance", () => {
    expect(expressSampleLabel(0)).toBe("Muestra A");
    expect(expressSampleLabel(5)).toBe("Muestra F");
    expect(expressSampleLabel(19)).toBe("Muestra T");
    expect(expressSampleLabel(0, "en")).toBe("Sample A");
    // Past Z (never reached under the 20 cap) falls back to the number.
    expect(expressSampleLabel(26)).toBe("Muestra 27");
  });

  it("prefills a dated name per locale", () => {
    const d = new Date(Date.UTC(2026, 9, 21, 12));
    expect(defaultExpressName(d, "es")).toBe("Cata · 21 oct 2026");
    expect(defaultExpressName(d, "en")).toBe("Cupping · Oct 21, 2026");
  });

  it("clamps the stepper to [1, 20] and falls back to the default", () => {
    expect(clampSampleCount(0)).toBe(1);
    expect(clampSampleCount(-4)).toBe(1);
    expect(clampSampleCount(21)).toBe(EXPRESS_MAX_SAMPLES);
    expect(clampSampleCount(7)).toBe(7);
    expect(clampSampleCount(Number.NaN)).toBe(EXPRESS_DEFAULT_SAMPLES);
  });

  it("stores the quick note under a JSON key, never a column", () => {
    expect(EXPRESS_NOTE_KEY).toBe("nota_express");
  });
});
