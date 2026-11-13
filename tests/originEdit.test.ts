import { describe, expect, it } from "vitest";
import { originEditedAfterClose } from "@/lib/originEdit";
import { buildStampLines } from "@/lib/pdf/stampText";

const closed = new Date("2026-11-01T10:00:00Z");
const before = new Date("2026-10-30T10:00:00Z");
const after = new Date("2026-11-05T10:00:00Z");
const later = new Date("2026-11-09T10:00:00Z");

describe("originEditedAfterClose (F-cafes-9)", () => {
  it("is null when nothing was edited after the close", () => {
    expect(originEditedAfterClose({ closedAt: closed })).toBeNull();
    expect(originEditedAfterClose({ closedAt: closed, coffeeUpdatedAt: before })).toBeNull();
    expect(originEditedAfterClose({ closedAt: closed, coffeeUpdatedAt: closed })).toBeNull();
    expect(originEditedAfterClose({ closedAt: closed, extrinsicEditedAt: before })).toBeNull();
  });

  it("a coffee edited after the close counts", () => {
    expect(originEditedAfterClose({ closedAt: closed, coffeeUpdatedAt: after })).toEqual(after);
  });

  it("the sample's own post-close edit counts, and the latest of the two wins", () => {
    expect(originEditedAfterClose({ closedAt: closed, extrinsicEditedAt: after })).toEqual(after);
    expect(
      originEditedAfterClose({ closedAt: closed, extrinsicEditedAt: after, coffeeUpdatedAt: later }),
    ).toEqual(later);
  });

  it("without a known close time only the stamped sample edit counts", () => {
    expect(originEditedAfterClose({ closedAt: null, coffeeUpdatedAt: later })).toBeNull();
    expect(originEditedAfterClose({ closedAt: null, extrinsicEditedAt: after })).toEqual(after);
  });
});

describe("sheetSampleRecords origin note gate", () => {
  const sample = (revealed: boolean) => ({
    revealed,
    physical: null,
    extrinsic: { data: { ext_pais_val: "Colombia" }, editedAt: after },
    coffee: { updatedAt: later },
  });

  it("a revealed sample carries the latest edit; a blind one for a participant carries none", async () => {
    const { sheetSampleRecords } = await import("@/lib/pdf/sheetSource");
    expect(sheetSampleRecords(sample(true), false, closed).originEditedAt).toBe(later.toISOString());
    expect(sheetSampleRecords(sample(false), false, closed).originEditedAt).toBeNull();
    // owner view of a blind sample: the sample's own record counts, the coffee's edit does not.
    expect(sheetSampleRecords(sample(false), true, closed).originEditedAt).toBe(after.toISOString());
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
