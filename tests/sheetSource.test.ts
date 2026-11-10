import { describe, it, expect } from "vitest";
import { sheetSampleIdentity, sheetSampleRecords } from "@/lib/pdf/sheetSource";

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
