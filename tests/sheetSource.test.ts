import { describe, it, expect } from "vitest";
import { sheetSampleIdentity, sheetSamplePrep, sheetSampleRecords } from "@/lib/pdf/sheetSource";

const coffee = { name: "Geisha", roastLevel: "Light", deletedAt: null };

describe("sheetSampleIdentity", () => {
  it("hides name and roast while unrevealed", () => {
    expect(sheetSampleIdentity({ revealed: false, coffee }, "X")).toEqual({
      coffeeName: null,
      roastLevel: null,
    });
  });
  it("shows them once revealed", () => {
    expect(sheetSampleIdentity({ revealed: true, coffee }, "X")).toEqual({
      coffeeName: "Geisha",
      roastLevel: "Light",
    });
  });
  it("revealed without a coffee gives nulls", () => {
    expect(sheetSampleIdentity({ revealed: true, coffee: null }, "X")).toEqual({
      coffeeName: null,
      roastLevel: null,
    });
  });
  it("revealed anonymized coffee shows the deleted label and keeps roast", () => {
    const r = sheetSampleIdentity(
      { revealed: true, coffee: { name: "", deletedAt: new Date(), roastLevel: "Dark" } },
      "Café eliminado",
    );
    expect(r).toEqual({ coffeeName: "Café eliminado", roastLevel: "Dark" });
  });
  it("unrevealed anonymized coffee shows nothing, not even the label", () => {
    const r = sheetSampleIdentity(
      { revealed: false, coffee: { name: "", deletedAt: new Date(), roastLevel: "Dark" } },
      "Café eliminado",
    );
    expect(r).toEqual({ coffeeName: null, roastLevel: null });
  });
  it("blank name falls back to the label", () => {
    expect(
      sheetSampleIdentity({ revealed: true, coffee: { name: "" } }, "Fallback").coffeeName,
    ).toBe("Fallback");
  });
  it("undefined roast becomes null", () => {
    expect(sheetSampleIdentity({ revealed: true, coffee: { name: "A" } }, "X").roastLevel).toBeNull();
  });
});

describe("sheetSampleRecords", () => {
  const phys = { data: { phys_color: "green" } };
  const ext = { data: { farm: "La Loma" } };
  it("participant gets no physical and no extrinsic before reveal", () => {
    expect(sheetSampleRecords({ revealed: false, physical: phys, extrinsic: ext }, false)).toEqual({
      physical: {},
      extrinsic: {},
    });
  });
  it("participant gets extrinsic once revealed, never physical", () => {
    expect(sheetSampleRecords({ revealed: true, physical: phys, extrinsic: ext }, false)).toEqual({
      physical: {},
      extrinsic: ext.data,
    });
  });
  it("owner gets both, extrinsic even pre-reveal", () => {
    expect(sheetSampleRecords({ revealed: false, physical: phys, extrinsic: ext }, true)).toEqual({
      physical: phys.data,
      extrinsic: ext.data,
    });
  });
  it("null rows give empty records", () => {
    expect(sheetSampleRecords({ revealed: true, physical: null, extrinsic: undefined }, true)).toEqual({
      physical: {},
      extrinsic: {},
    });
  });
});

// A9: the prep data identifies a coffee, so it follows the extrinsic rule.
describe("sheetSamplePrep", () => {
  const cols = {
    roastDate: new Date(Date.UTC(2026, 10, 1)),
    preparationNote: "92 C",
    offProtocol: true,
    offProtocolNote: "grifo",
  };
  const expected = {
    roastDate: "2026-11-01",
    preparationNote: "92 C",
    offProtocol: true,
    offProtocolNote: "grifo",
  };
  it("a participant's sheet of a blind sample carries nothing", () => {
    expect(sheetSamplePrep({ ...cols, revealed: false }, false)).toEqual({ prep: null });
  });
  it("a participant gets it once the sample is revealed", () => {
    expect(sheetSamplePrep({ ...cols, revealed: true }, false)).toEqual({ prep: expected });
  });
  it("the owner gets it even before the reveal", () => {
    expect(sheetSamplePrep({ ...cols, revealed: false }, true)).toEqual({ prep: expected });
  });
  it("an empty sample is null", () => {
    expect(
      sheetSamplePrep(
        { roastDate: null, preparationNote: null, offProtocol: false, offProtocolNote: null, revealed: true },
        true,
      ),
    ).toEqual({ prep: null });
  });
});
