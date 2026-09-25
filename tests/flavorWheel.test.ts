import { describe, expect, it } from "vitest";
import {
  FLAVOR_ID_MIGRATION,
  flavorChildren,
  flavorNodeById,
  migrateFlavorId,
} from "@/lib/constants";

// 2026-09 Verde/Vegetal collapse: one "Verde/Vegetal" subgroup with the leaves,
// plus three leafless subgroups — identical structure in Spanish and English.

describe("Verde/Vegetal branch", () => {
  const subs = flavorChildren("green_veg");

  it("has exactly four level-2 nodes, mirrored in es and en", () => {
    expect(subs.map((n) => n.label_es)).toEqual(["Verde/Vegetal", "Leguminoso", "Crudo", "Aceite de oliva"]);
    expect(subs.map((n) => n.label_en)).toEqual(["Green/Vegetative", "Beany", "Raw", "Olive Oil"]);
  });

  it("puts the seven leaves under the single Verde/Vegetal subgroup", () => {
    const leaves = flavorChildren("green_veg:fresh");
    expect(leaves.map((n) => n.label_es)).toEqual([
      "Fresco", "Vaina", "Vegetal", "Verde oscuro", "Herbáceo", "Inmaduro", "Heno",
    ]);
    expect(leaves.map((n) => n.label_en)).toEqual([
      "Fresh", "Peapod", "Vegetative", "Dark Green", "Herb-like", "Under-ripe", "Hay-like",
    ]);
  });

  it("keeps Leguminoso, Crudo and Aceite de oliva leafless", () => {
    for (const id of ["green_veg:beany", "green_veg:raw", "green_veg:olive_oil"]) {
      expect(flavorChildren(id)).toHaveLength(0);
    }
  });

  it("aliases the old Dried/Cooked ids to live nodes", () => {
    expect(migrateFlavorId("green_veg:dried:hay_like")).toBe("green_veg:fresh:hay_like");
    expect(migrateFlavorId("green_veg:dried:beany")).toBe("green_veg:beany");
    expect(migrateFlavorId("green_veg:cooked:olive_oil")).toBe("green_veg:olive_oil");
  });
});

describe("FLAVOR_ID_MIGRATION", () => {
  it("only points at nodes that exist (single-hop lookup)", () => {
    for (const target of Object.values(FLAVOR_ID_MIGRATION)) {
      expect(flavorNodeById(target), target).toBeDefined();
    }
  });
});
