import { describe, expect, it } from "vitest";
import {
  coffeeSessionOriginEditedAt,
  originEditedAfterClose,
  sampleOriginEditedAt,
  stoppedWritingAt,
} from "@/lib/originEdit";
import { COFFEE_ORIGIN_FIELDS, originFieldsChanged } from "@/lib/coffeeOrigin";
import { buildStampLines } from "@/lib/pdf/stampText";

const closed = new Date("2026-11-01T10:00:00Z");
const before = new Date("2026-10-30T10:00:00Z");
const after = new Date("2026-11-05T10:00:00Z");
const later = new Date("2026-11-09T10:00:00Z");

describe("originEditedAfterClose (F-cafes-9)", () => {
  it("is null when nothing was edited after the close", () => {
    expect(originEditedAfterClose({ closedAt: closed })).toBeNull();
    expect(originEditedAfterClose({ closedAt: closed, coffeeOriginEditedAt: before })).toBeNull();
    expect(originEditedAfterClose({ closedAt: closed, coffeeOriginEditedAt: closed })).toBeNull();
    expect(originEditedAfterClose({ closedAt: closed, extrinsicEditedAt: before })).toBeNull();
    // a coffee that was never origin-edited (NULL) says nothing, whatever else moved
    expect(originEditedAfterClose({ closedAt: closed, coffeeOriginEditedAt: null })).toBeNull();
  });

  it("a coffee whose origin was edited after the close counts", () => {
    expect(originEditedAfterClose({ closedAt: closed, coffeeOriginEditedAt: after })).toEqual(after);
  });

  it("the sample's own post-close edit counts, and the latest of the two wins", () => {
    expect(originEditedAfterClose({ closedAt: closed, extrinsicEditedAt: after })).toEqual(after);
    expect(
      originEditedAfterClose({ closedAt: closed, extrinsicEditedAt: after, coffeeOriginEditedAt: later }),
    ).toEqual(later);
  });

  it("without a known cut-off only the stamped sample edit counts", () => {
    expect(originEditedAfterClose({ closedAt: null, coffeeOriginEditedAt: later })).toBeNull();
    expect(originEditedAfterClose({ closedAt: null, extrinsicEditedAt: after })).toEqual(after);
  });

  it("an expired-but-not-closed session cuts off at closesAt, so an edit in that window keeps its note", () => {
    const closesAt = new Date("2026-11-02T00:00:00Z");
    const now = new Date("2026-11-04T00:00:00Z");
    const edit = new Date("2026-11-03T00:00:00Z");
    expect(stoppedWritingAt({ closedAt: null, closesAt, now })).toEqual(closesAt);
    expect(
      originEditedAfterClose({ closedAt: null, closesAt, now, coffeeOriginEditedAt: edit }),
    ).toEqual(edit);
    // closesAt in the future = still writable: no cut-off
    expect(stoppedWritingAt({ closedAt: null, closesAt: later, now })).toBeNull();
    // the earlier of the two wins
    expect(stoppedWritingAt({ closedAt: after, closesAt, now: later })).toEqual(closesAt);
  });
});

describe("sampleOriginEditedAt (the results page rule)", () => {
  it("a blind sample says nothing; a revealed one follows the rule", () => {
    const base = { closedAt: closed, extrinsicEditedAt: after, coffeeOriginEditedAt: later };
    expect(sampleOriginEditedAt({ revealed: false, ...base })).toBeNull();
    expect(sampleOriginEditedAt({ revealed: true, ...base })).toEqual(later);
    expect(sampleOriginEditedAt({ revealed: true, closedAt: closed })).toBeNull();
  });
});

describe("coffeeSessionOriginEditedAt (coffee profile + ficha use the results page rule, S10 WP6 B3)", () => {
  // The deadline passed on 2026-11-01; the nightly job closed the session two days later.
  const closesAt = new Date("2026-11-01T10:00:00Z");
  const closedAt = new Date("2026-11-03T06:00:00Z");
  const editBetween = new Date("2026-11-02T10:00:00Z");

  it("an edit between the passed deadline and the close keeps its note (closedAt alone would drop it)", () => {
    expect(
      coffeeSessionOriginEditedAt({ sessionClosedAt: closedAt, sessionClosesAt: closesAt, coffeeOriginEditedAt: editBetween }),
    ).toEqual(editBetween);
    expect(originEditedAfterClose({ closedAt, coffeeOriginEditedAt: editBetween })).toBeNull();
  });
  it("gives exactly what the results page rule gives for the same moments", () => {
    for (const edit of [before, editBetween, after, null]) {
      const input = { closedAt, closesAt, coffeeOriginEditedAt: edit };
      expect(
        coffeeSessionOriginEditedAt({ sessionClosedAt: closedAt, sessionClosesAt: closesAt, coffeeOriginEditedAt: edit }),
      ).toEqual(sampleOriginEditedAt({ revealed: true, ...input }));
    }
  });
  it("a future deadline changes nothing and no deadline falls back to closedAt", () => {
    const future = new Date("2999-01-01T00:00:00Z");
    expect(
      coffeeSessionOriginEditedAt({ sessionClosedAt: closedAt, sessionClosesAt: future, coffeeOriginEditedAt: editBetween }),
    ).toBeNull();
    expect(coffeeSessionOriginEditedAt({ sessionClosedAt: closedAt, coffeeOriginEditedAt: after })).toEqual(after);
  });
});

describe("originFieldsChanged (M1: only a real origin edit stamps)", () => {
  const before0 = { country: "Colombia", variety: "Caturra", certifications: ["Organic", "Fairtrade"] };

  it("the field list is exactly the origin fields, not name, notes, visibility or flags", () => {
    expect([...COFFEE_ORIGIN_FIELDS]).toEqual([
      "country", "region", "farm", "producer", "species", "variety",
      "harvestYear", "processType", "altitude", "roastLevel", "certifications",
    ]);
  });

  it("an edit of notes, name, visibility or publish flags is not an origin change", () => {
    const after0 = { ...before0, notes: "x", name: "y", visibility: "public", resultsPublished: true };
    expect(originFieldsChanged(before0, after0)).toBe(false);
  });

  it("a changed origin field is", () => {
    expect(originFieldsChanged(before0, { country: "Perú" })).toBe(true);
    expect(originFieldsChanged(before0, { ...before0, altitude: "1800" })).toBe(true);
    expect(originFieldsChanged(before0, { certifications: ["Organic"] })).toBe(true);
  });

  it("normalises: trim, null = '' = undefined, certifications as a set", () => {
    expect(originFieldsChanged(before0, { country: "  Colombia " })).toBe(false);
    expect(originFieldsChanged({ region: null }, { region: "" })).toBe(false);
    expect(originFieldsChanged({}, { region: null })).toBe(false);
    expect(originFieldsChanged(before0, { certifications: ["Fairtrade", "Organic", "Organic"] })).toBe(false);
    // clearing a stored value is a change
    expect(originFieldsChanged(before0, { country: null })).toBe(true);
    // a key absent from `after` is untouched
    expect(originFieldsChanged(before0, {})).toBe(false);
  });
});

describe("sheetSampleRecords origin note gate", () => {
  const sample = (revealed: boolean) => ({
    revealed,
    physical: null,
    extrinsic: { data: { ext_pais_val: "Colombia" }, editedAt: after },
    coffee: { originEditedAt: later },
  });

  it("a revealed sample carries the latest edit; a blind one for a participant carries none", async () => {
    const { sheetSampleRecords } = await import("@/lib/pdf/sheetSource");
    const s = { closedAt: closed };
    expect(sheetSampleRecords(sample(true), false, s).originEditedAt).toBe(later.toISOString());
    expect(sheetSampleRecords(sample(false), false, s).originEditedAt).toBeNull();
    // owner view of a blind sample: the sample's own record counts, the coffee's edit does not.
    expect(sheetSampleRecords(sample(false), true, s).originEditedAt).toBe(after.toISOString());
  });

  it("the CVA sheet prints the note as one origin field, in both languages", async () => {
    const { buildCvaFormData } = await import("@/lib/pdf/cvaFormData");
    const base = {
      ownerView: true,
      format: "affective",
      sessionName: "S",
      date: "1 nov",
      cupperName: "C",
      purpose: "",
      cupsPerSample: 5,
      sample: {
        label: "A",
        revealed: true,
        coffeeName: null,
        roastLevel: null,
        descriptive: {},
        affective: {},
        combined: {},
        physical: {},
        extrinsic: { ext_pais_val: "Colombia" },
        originEditedAt: later.toISOString() as string | null,
      },
    };
    const es = buildCvaFormData({ ...base, locale: "es" });
    expect(es.extrinsic.map((f) => f.label)).toContain("Datos de origen editados el");
    const en = buildCvaFormData({ ...base, locale: "en" });
    expect(en.extrinsic.map((f) => f.label)).toContain("Origin data edited on");
    const none = buildCvaFormData({
      ...base,
      locale: "es",
      sample: { ...base.sample, originEditedAt: null },
    });
    expect(none.extrinsic.map((f) => f.label)).not.toContain("Datos de origen editados el");
  });
});

describe("report stamp wording", () => {
  it("says 'Datos de origen editados' / 'Origin data edited' with the date", () => {
    const base = { generatedAt: new Date("2026-11-10T12:00:00Z"), originEditedAt: after };
    expect(buildStampLines({ ...base, locale: "es" }).join(" ")).toContain(
      "Datos de origen editados el",
    );
    expect(buildStampLines({ ...base, locale: "en" }).join(" ")).toContain("Origin data edited on");
  });
});
