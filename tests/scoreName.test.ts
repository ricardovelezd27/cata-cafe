import { describe, it, expect } from "vitest";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// S10 WP1c, owner's decision 8 (TODO(kim-validar:A2)): this app's number is named
// "Puntaje Café Sensible (base CVA)" / "Café Sensible score (CVA-based)". The CVA
// FORM and the methodology keep their own names; the number is never "Puntaje CVA".

function strings(v: unknown, path = ""): [string, string][] {
  if (typeof v === "string") return [[path, v]];
  if (v && typeof v === "object") {
    return Object.entries(v).flatMap(([k, x]) => strings(x, path ? `${path}.${k}` : k));
  }
  return [];
}

describe("the score's name", () => {
  it("no message calls this app's number 'Puntaje CVA' / 'CVA score'", () => {
    const re = /puntajes? CVA|CVA scores?|SCA scores?|puntaje SCA/i;
    for (const [path, v] of [...strings(es), ...strings(en)]) {
      // landing + insights benchmark compare methodologies, they do not name the number
      if (path.startsWith("landing") || path.startsWith("insights.benchmark")) continue;
      expect(re.test(v), `${path}: ${v}`).toBe(false);
    }
  });

  it("the full name is used on the results table, the drill-down, the matrix, history and the coffee page", () => {
    const at = (m: unknown, path: string): string =>
      path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], m) as string;
    for (const path of ["results.table.cvaScore", "results.detail.cvaScore", "coffee.lifetime.title"]) {
      expect(at(es, path)).toBe("Puntaje Café Sensible (base CVA)");
      expect(at(en, path)).toBe("Café Sensible score (CVA-based)");
    }
    expect(at(es, "results.matrix.matrixTitle")).toContain("Puntaje Café Sensible (base CVA)");
    expect(at(en, "results.matrix.matrixTitle")).toContain("Café Sensible score");
    expect(at(es, "history.yourScore")).toContain("Puntaje Café Sensible (base CVA)");
    expect(at(en, "history.yourScore")).toContain("Café Sensible score (CVA-based)");
  });
});
