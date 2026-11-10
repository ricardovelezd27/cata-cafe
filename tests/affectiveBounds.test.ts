import { describe, expect, it } from "vitest";
import {
  affectiveRatingKeys,
  computeEvaluationDerived,
  sanitizeAffectiveRatings,
} from "@/lib/evaluation";

// B-01 (S8-22): affective ratings are bounded server-side, for both write paths
// (they share computeEvaluationDerived).
describe("sanitizeAffectiveRatings / computeEvaluationDerived bounds (B-01)", () => {
  const all = (v: unknown) =>
    Object.fromEntries(
      affectiveRatingKeys()
        .filter((k) => k.endsWith("_final"))
        .map((k) => [k, v]),
    );

  it("clamps out-of-range numbers into 1..9", () => {
    const out = sanitizeAffectiveRatings({
      sabor_af_final: 9999,
      aroma_af_final: 0,
      acidez_af_final: -3,
      dulzor_af: 12,
    });
    expect(out).toMatchObject({ sabor_af_final: 9, aroma_af_final: 1, acidez_af_final: 1, dulzor_af: 9 });
  });

  it("rounds fractions to the nearest integer (4.6 -> 5, 4.4 -> 4)", () => {
    const out = sanitizeAffectiveRatings({ sabor_af_final: 4.6, aroma_af_final: 4.4 });
    expect(out).toMatchObject({ sabor_af_final: 5, aroma_af_final: 4 });
  });

  it("removes non-numbers instead of storing them", () => {
    const out = sanitizeAffectiveRatings({
      sabor_af_final: "abc",
      aroma_af_final: null,
      acidez_af_final: NaN,
      dulzor_af_final: {},
      sensacion_af_final: "7",
      impresion_global_final: Infinity,
    });
    for (const k of [
      "sabor_af_final",
      "aroma_af_final",
      "acidez_af_final",
      "dulzor_af_final",
      "sensacion_af_final",
      "impresion_global_final",
    ]) {
      expect(k in out).toBe(false);
    }
  });

  it("leaves valid data and unrelated keys untouched", () => {
    const d = { ...all(7), nota: "x", tazas_no_uniformes: [false] };
    expect(sanitizeAffectiveRatings(d)).toEqual(d);
  });

  it("a hostile 9999 rating derives exactly the same result as a 9 (S8-27)", () => {
    // Mid-range base so the final score is not already clamped at 100: without
    // the sanitizer the raw score blows up (6637.56 in the old code) and the
    // stored module keeps 9999.
    const hostile = computeEvaluationDerived(
      "affective",
      { ...all(5), sabor_af_final: 9999, aroma_af_final: 1e9 },
      5,
    );
    const capped = computeEvaluationDerived(
      "affective",
      { ...all(5), sabor_af_final: 9, aroma_af_final: 9 },
      5,
    );
    expect(hostile).toEqual(capped);
    expect(hostile.individualScore).toBeLessThan(100);
  });

  it("a string rating no longer reaches the stored module", () => {
    const r = computeEvaluationDerived("affective", { ...all(5), aroma_af_final: "abc" }, 5);
    expect((r.affectiveData as Record<string, unknown>).aroma_af_final).toBeUndefined();
  });
});
