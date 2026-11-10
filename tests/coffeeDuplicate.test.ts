import { describe, it, expect } from "vitest";
import { duplicableFields, DUPLICABLE_COFFEE_FIELDS } from "@/lib/coffeeDuplicate";

const full = {
  id: "c1",
  code: "ABC234",
  name: "Geisha",
  notes: "private owner note",
  createdBy: "u1",
  visibility: "public",
  resultsPublished: true,
  deletedAt: null,
  country: "Panamá",
  region: "Boquete",
  farm: "Finca X",
  producer: "Ana",
  species: "Arabica",
  variety: "Geisha",
  harvestYear: "2025",
  processType: "Lavado",
  altitude: "1800",
  roastLevel: "Light",
  certifications: ["Organic"],
};

describe("duplicableFields (F-cafes-3)", () => {
  it("never returns notes or identity columns", () => {
    const out = duplicableFields(full) as Record<string, unknown>;
    for (const k of ["notes", "name", "code", "createdBy", "visibility", "resultsPublished", "id", "deletedAt"]) {
      expect(k in out).toBe(false);
    }
  });

  it("returns exactly the allow-list", () => {
    expect(Object.keys(duplicableFields(full)).sort()).toEqual([...DUPLICABLE_COFFEE_FIELDS].sort());
  });

  it("copies origin data and the certifications array (a copy, not the same array)", () => {
    const out = duplicableFields(full);
    expect(out.farm).toBe("Finca X");
    expect(out.certifications).toEqual(["Organic"]);
    expect(out.certifications).not.toBe(full.certifications);
  });

  it("defaults missing fields to null and []", () => {
    const out = duplicableFields({});
    expect(out.country).toBeNull();
    expect(out.certifications).toEqual([]);
  });
});
