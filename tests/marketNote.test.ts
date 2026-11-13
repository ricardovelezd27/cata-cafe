import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARKET_KEY, MARKET_NOTE_KEY, MARKET_NOTE_MAX, readMarketNote, sanitizeMarketNote } from "@/lib/marketNote";
import { computeEvaluationDerived } from "@/lib/evaluation";
import { isReferencePinned, pinReferenceAffective } from "@/lib/referenceRules";
import { calcIndividualScore } from "@/lib/scoring";
import { stepMissing } from "@/lib/completeness";
import { AFFECTIVE_ATTRIBUTES, CUPPING_STEPS } from "@/lib/constants";
import { MARKET_COPY_FALLBACK } from "@/components/cupping/MarketNote";
import es from "../messages/es.json";
import en from "../messages/en.json";

// S10 WP3a (A10): the optional "market" note lives in the module JSON and is
// never read by scoring or completeness.
const ratings = Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, 7]));

describe("sanitizeMarketNote", () => {
  it("keeps 'propio' and drops a note that rides with it", () => {
    const out = sanitizeMarketNote({ [MARKET_KEY]: "propio", [MARKET_NOTE_KEY]: "x" }, "affective");
    expect(out[MARKET_KEY]).toBe("propio");
    expect(MARKET_NOTE_KEY in out).toBe(false);
  });

  it("keeps 'conocido' with its trimmed note", () => {
    const out = sanitizeMarketNote({ [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "  Madrid  " }, "combined");
    expect(out[MARKET_KEY]).toBe("conocido");
    expect(out[MARKET_NOTE_KEY]).toBe("Madrid");
  });

  it("drops unknown values (both keys) and over-long or non-string notes", () => {
    expect(MARKET_KEY in sanitizeMarketNote({ [MARKET_KEY]: "otro", [MARKET_NOTE_KEY]: "x" }, "affective")).toBe(false);
    expect(MARKET_NOTE_KEY in sanitizeMarketNote({ [MARKET_KEY]: "otro", [MARKET_NOTE_KEY]: "x" }, "affective")).toBe(false);
    const tooLong = sanitizeMarketNote({ [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "a".repeat(MARKET_NOTE_MAX + 1) }, "affective");
    expect(tooLong[MARKET_KEY]).toBe("conocido");
    expect(MARKET_NOTE_KEY in tooLong).toBe(false);
    expect(MARKET_NOTE_KEY in sanitizeMarketNote({ [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: 5 }, "affective")).toBe(false);
    expect(sanitizeMarketNote({ [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "a".repeat(MARKET_NOTE_MAX) }, "affective")[MARKET_NOTE_KEY]).toHaveLength(MARKET_NOTE_MAX);
  });

  it("a descriptive module carries neither key", () => {
    const out = sanitizeMarketNote({ [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "x", other: 1 }, "descriptive");
    expect(out).toEqual({ other: 1 });
  });

  it("leaves every other key alone", () => {
    const out = sanitizeMarketNote({ a: 1, [MARKET_KEY]: "propio" }, "affective");
    expect(out.a).toBe(1);
  });
});

describe("through computeEvaluationDerived", () => {
  it("stores the validated keys in the module blob", () => {
    const f = computeEvaluationDerived("affective", { ...ratings, [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "Tokio" }, 2);
    expect((f.affectiveData as Record<string, unknown>)[MARKET_NOTE_KEY]).toBe("Tokio");
  });

  it("never changes the score or the stored sums", () => {
    const base = computeEvaluationDerived("affective", { ...ratings }, 2);
    const withNote = computeEvaluationDerived("affective", { ...ratings, [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "Tokio" }, 2);
    expect(withNote.individualScore).toBe(base.individualScore);
    expect(withNote.rawScore).toBe(base.rawScore);
    expect(withNote.affectiveSum).toBe(base.affectiveSum);
    expect(calcIndividualScore({ ...ratings, [MARKET_KEY]: "conocido" }, 2)).toBe(calcIndividualScore(ratings, 2));
  });

  it("never changes completeness", () => {
    for (const step of CUPPING_STEPS) {
      const mods = (a: Record<string, unknown>) => ({ affective: a, descriptive: {}, combined: {} });
      expect(stepMissing(mods({ ...ratings, [MARKET_KEY]: "conocido" }), step, "affective")).toEqual(
        stepMissing(mods(ratings), step, "affective"),
      );
    }
  });

  it("a descriptive evaluation drops them", () => {
    const f = computeEvaluationDerived("descriptive", { [MARKET_KEY]: "conocido" }, 2);
    expect(MARKET_KEY in (f.descriptiveData as Record<string, unknown>)).toBe(false);
  });
});

describe("the reference pin clears the market keys", () => {
  it("pinReferenceAffective removes them and isReferencePinned notices them", () => {
    const data = { ...ratings, [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: "x" };
    const pinned = pinReferenceAffective(data, 2);
    expect(MARKET_KEY in pinned).toBe(false);
    expect(MARKET_NOTE_KEY in pinned).toBe(false);
    expect(isReferencePinned(pinned)).toBe(true);
    expect(isReferencePinned({ ...pinned, [MARKET_KEY]: "propio" })).toBe(false);
  });
});

describe("readMarketNote", () => {
  it("is null for the default and for nothing", () => {
    expect(readMarketNote(null)).toBeNull();
    expect(readMarketNote({ [MARKET_KEY]: "propio" })).toBeNull();
    expect(readMarketNote({})).toBeNull();
  });
  it("returns the note for 'conocido'", () => {
    expect(readMarketNote({ [MARKET_KEY]: "conocido", [MARKET_NOTE_KEY]: " Chile " })).toEqual({ pov: "conocido", note: "Chile" });
    expect(readMarketNote({ [MARKET_KEY]: "conocido" })).toEqual({ pov: "conocido", note: null });
  });
});

describe("market copy", () => {
  it("the fallback equals the message files", () => {
    expect(MARKET_COPY_FALLBACK.es).toEqual(es.cupping.market);
    expect(MARKET_COPY_FALLBACK.en).toEqual(en.cupping.market);
  });
});

describe("no quality bands remain", () => {
  it("lib/scoring no longer exports the band helpers", () => {
    const src = readFileSync(join(process.cwd(), "lib", "scoring.ts"), "utf8");
    expect(src).not.toMatch(/scoreBand|scoreToCategory|SCORE_CATEGORY_LABELS/);
  });
  it("the score legend sentence is the same in the PDF map and the message files", async () => {
    const { CVA_TEXT } = await import("@/lib/pdf/cvaFormData");
    expect(CVA_TEXT.es.scoreLegend).toBe(es.common.scoreLegend);
    expect(CVA_TEXT.en.scoreLegend).toBe(en.common.scoreLegend);
  });
});
