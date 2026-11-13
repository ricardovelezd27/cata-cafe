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
    const e = es as any;
    const n = en as any;
    for (const get of [
      (m: any) => m.results.table.cvaScore,
      (m: any) => m.results.detail.cvaScore,
      (m: any) => m.coffee.lifetime.title,
    ]) {
      expect(get(e)).toBe("Puntaje Café Sensible (base CVA)");
      expect(get(n)).toBe("Café Sensible score (CVA-based)");
    }
    expect(e.results.matrix.matrixTitle).toContain("Puntaje Café Sensible (base CVA)");
    expect(n.results.matrix.matrixTitle).toContain("Café Sensible score");
    expect(e.history.yourScore).toContain("Puntaje Café Sensible (base CVA)");
    expect(n.history.yourScore).toContain("Café Sensible score (CVA-based)");
  });
});
