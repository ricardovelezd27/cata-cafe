import { describe, it, expect } from "vitest";
import { FLAVOR_SYNONYM_SOURCE, lookupSynonym, lookupSynonymPrefix } from "@/lib/flavorSynonyms";
import { flavorNodeById, FLAVOR_WHEEL } from "@/lib/constants";
import { searchFlavors, norm } from "@/lib/flavorSearch";

describe("flavor synonym dictionary", () => {
  it("only points at nodes that exist on the wheel", () => {
    for (const { id } of FLAVOR_SYNONYM_SOURCE) expect(flavorNodeById(id), id).toBeDefined();
  });

  it("maps each folded term to exactly one id", () => {
    const seen = new Map<string, string>();
    for (const { id, terms } of FLAVOR_SYNONYM_SOURCE) {
      for (const t of terms) {
        const k = norm(t);
        expect(seen.has(k) ? `${k} dup (${seen.get(k)} / ${id})` : "ok").toBe("ok");
        seen.set(k, id);
      }
    }
  });

  it("does not shadow a node's own label", () => {
    const labels = new Set(FLAVOR_WHEEL.flatMap((n) => [norm(n.label_es), norm(n.label_en)]));
    for (const { terms } of FLAVOR_SYNONYM_SOURCE) {
      for (const t of terms) expect(labels.has(norm(t)), t).toBe(false);
    }
  });

  it("looks up accent-insensitively", () => {
    expect(lookupSynonym("Guanábana")).toBe(lookupSynonym("guanabana"));
    expect(lookupSynonym("lulo")).toBe("fruity:other_fruit");
    expect(lookupSynonymPrefix("pitah")).toContain("fruity:other_fruit");
    expect(lookupSynonymPrefix("ab")).toEqual([]);
  });
});

describe("searchFlavors + dictionary", () => {
  it("files lulo under the dictionary node, ahead of any fuzzy hit", () => {
    const [top] = searchFlavors("lulo");
    expect(top.id).toBe("fruity:other_fruit");
    expect(top.matchType).toBe("dictionary");
  });

  it("resolves a word inside a phrase", () => {
    expect(searchFlavors("jugo de maracuyá")[0].id).toBe("fruity:other_fruit");
  });

  it("keeps wheel labels working", () => {
    expect(searchFlavors("limón")[0].id).toContain("citrus");
  });
});
