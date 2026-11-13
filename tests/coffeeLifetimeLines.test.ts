import { describe, it, expect } from "vitest";
import { buildLifetimeLines, LIFETIME_COPY } from "@/lib/coffeeLifetimeLines";
import { computeCoffeeLifetimeScore, type CoffeeLifetimeScore, type LifetimeSample } from "@/lib/coffeeLifetimeScore";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

// TODO(kim-validar:A2): wording is the owner's brief for WP1c, not Kim's.

const zeroTypes = { potato: 0, moldy: 0, phenolic: 0 };

function result(over: Omit<Partial<CoffeeLifetimeScore>, "tally"> & { tally?: Partial<CoffeeLifetimeScore["tally"]> } = {}): CoffeeLifetimeScore {
  const { tally, ...rest } = over;
  return {
    score: 83.25,
    base: 84,
    deduction: 0.75,
    factor: 5 / 40,
    voices: 20,
    cups: 40,
    sessions: 3,
    indicative: false,
    anchorReferenceSessions: 0,
    noBaseReason: null,
    tally: {
      byType: { ...zeroTypes, moldy: 1 },
      unspecified: 0,
      defective: 1,
      nonUniform: 1,
      nonUniformOnly: 0,
      defectivePct: 2.5,
      foundBy: 1,
      ...tally,
    },
    ...rest,
  };
}

describe("buildLifetimeLines (es)", () => {
  const L = LIFETIME_COPY.es;

  it("the brief's example: 1 defective cup of 40 reads as ONE cup", () => {
    const lines = buildLifetimeLines(result(), L);
    expect(lines.headline).toBe("83.25");
    expect(lines.roundingNote).toBe("El puntaje se redondea al cuarto de punto más cercano.");
    expect(lines.accumulated).toBe("Acumulado de 40 tazas en 3 catas · 20 evaluaciones");
    expect(lines.arithmetic).toBe("Base 84.00 · Descuento 0.75 (1 taza defectuosa) · Puntaje 83.25");
    expect(lines.tally).toBe("1 taza defectuosa de 40 tazas catadas (2.5 %), encontrada por 1 persona");
    expect(lines.byType).toBe("Mohoso 1");
    expect(lines.nonUniform).toBeNull();
    expect(lines.indicative).toBeNull();
    expect(lines.noBase).toBeNull();
    expect(lines.anchorNote).toBeNull();
    expect(lines.note).toBe(
      "Cada cata conserva su propio puntaje. Este número es del café y cambia cuando se cierra una cata nueva.",
    );
  });

  it("plurals, several types and non-uniform-only cups (without defect)", () => {
    const lines = buildLifetimeLines(
      result({
        cups: 10, factor: 0.5, deduction: 5, score: 74, base: 79,
        tally: { byType: { potato: 1, moldy: 2, phenolic: 0 }, unspecified: 1, defective: 4, nonUniform: 6, nonUniformOnly: 2, defectivePct: 40, foundBy: 3 },
      }),
      L,
    );
    expect(lines.tally).toBe("4 tazas defectuosas de 10 tazas catadas (40 %), encontradas por 3 personas");
    expect(lines.byType).toBe("Papa 1 · Mohoso 2 · Sin especificar 1");
    expect(lines.nonUniform).toBe("2 tazas no uniformes (sin defecto)");
    expect(lines.arithmetic).toBe("Base 79.00 · Descuento 5.00 (4 tazas defectuosas, 2 tazas no uniformes sin defecto) · Puntaje 74.00");
  });

  it("no deduction: 'Base · Puntaje', the clean-cups line and nothing on non-uniform", () => {
    const lines = buildLifetimeLines(
      result({ deduction: 0, factor: 1, score: 84, tally: { byType: zeroTypes, defective: 0, nonUniform: 0, nonUniformOnly: 0, defectivePct: 0, foundBy: 0 } }),
      L,
    );
    expect(lines.arithmetic).toBe("Base 84.00 · Puntaje 84.00");
    expect(lines.tally).toBe("Sin tazas defectuosas en 40 tazas catadas");
    expect(lines.byType).toBeNull();
    expect(lines.nonUniform).toBeNull();
  });

  it("indicative shows the badge and the first-signal line", () => {
    const lines = buildLifetimeLines(result({ indicative: true, cups: 2 }), L);
    expect(lines.indicative).toEqual({ badge: "Indicativo", note: "Menos de 5 tazas catadas: es una primera señal." });
  });

  it("three honest no-base variants, chosen by the data", () => {
    const base = { score: null, base: null, voices: 0 };
    const quick = buildLifetimeLines(result({ ...base, noBaseReason: "quick", cups: 1, sessions: 1 }), L);
    const anchor = buildLifetimeLines(result({ ...base, noBaseReason: "anchor", cups: 0, sessions: 0, deduction: 0 }), L);
    const incomplete = buildLifetimeLines(result({ ...base, noBaseReason: "incomplete", cups: 0, sessions: 0, deduction: 0 }), L);
    expect(quick.noBase).toBe(
      "Todavía no hay una cata completa de este café. Las impresiones rápidas (1 taza) cuentan sus tazas y defectos, no su puntaje.",
    );
    expect(anchor.noBase).toBe(
      "Este café solo se ha catado como referencia fija: esas catas no cuentan para este puntaje.",
    );
    expect(incomplete.noBase).toBe("Todavía no hay una cata completa de este café.");
    for (const l of [quick, anchor, incomplete]) {
      expect(l.headline).toBeNull();
      expect(l.arithmetic).toBeNull();
      expect(l.roundingNote).toBeNull();
    }
  });

  it("'0 tazas en 0 catas' is not printed", () => {
    const lines = buildLifetimeLines(result({ score: null, base: null, noBaseReason: "incomplete", cups: 0, sessions: 0, voices: 0, deduction: 0 }), L);
    expect(lines.accumulated).toBeNull();
    expect(lines.tally).toBeNull();
  });

  it("the anchor-reference line, singular and plural", () => {
    expect(buildLifetimeLines(result({ anchorReferenceSessions: 1 }), L).anchorNote).toBe(
      "1 cata en la que este café fue la referencia fija no cuenta para este puntaje.",
    );
    expect(buildLifetimeLines(result({ anchorReferenceSessions: 3 }), L).anchorNote).toBe(
      "3 catas en las que este café fue la referencia fija no cuentan para este puntaje.",
    );
  });

  it("with only quick impressions the accumulated line has no evaluations part", () => {
    const lines = buildLifetimeLines(result({ score: null, base: null, noBaseReason: "quick", voices: 0, cups: 1, sessions: 1 }), L);
    expect(lines.accumulated).toBe("Acumulado de 1 taza en 1 cata");
  });
});

describe("the arithmetic line never prints an equation (M2)", () => {
  const ratings = (n: number) => Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, n]));

  it("3000 seeded random cases: no '=', '−' or '→', three numbers equal the function's own base, deduction, score", () => {
    let seed = 99;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (const locale of ["es", "en"] as const) {
      for (let run = 0; run < 1500; run++) {
        const samples: LifetimeSample[] = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, si) => ({
          sessionId: `s${si}`,
          referenceRank: null,
          session: { format: "affective", cupsPerSample: 2, referenceMode: "anchor" },
          evaluations: Array.from({ length: 1 + Math.floor(rnd() * 9) }, (_, i) => {
            const nu = [rnd() < 0.3, rnd() < 0.3];
            const def = [rnd() < 0.15, rnd() < 0.15];
            return {
              cupperKey: i,
              affectiveData: { ...ratings(1 + Math.floor(rnd() * 9)), tazas_defectuosas: def, tazas_no_uniformes: nu },
              combinedData: {},
              nonUniformCups: nu,
              defectiveCups: def,
              cups: 2,
            };
          }),
        }));
        const r = computeCoffeeLifetimeScore(samples);
        const lines = buildLifetimeLines(r, LIFETIME_COPY[locale]);
        if (r.score === null) continue;
        const line = lines.arithmetic as string;
        expect(line).not.toMatch(/[=−→]/);
        const nums = line.match(/\d+\.\d\d/g) as string[];
        expect(nums[0]).toBe((r.base as number).toFixed(2));
        if (r.deduction > 0) {
          expect(nums[1]).toBe(r.deduction.toFixed(2));
          expect(nums[2]).toBe(r.score.toFixed(2));
        } else {
          expect(nums[1]).toBe(r.score.toFixed(2));
        }
      }
    }
  });
});

describe("copy", () => {
  it("messages coffee.lifetime equals the PDF maps in both languages", () => {
    expect((es as { coffee: { lifetime: unknown } }).coffee.lifetime).toEqual(LIFETIME_COPY.es);
    expect((en as { coffee: { lifetime: unknown } }).coffee.lifetime).toEqual(LIFETIME_COPY.en);
  });

  it("never names the score CVA", () => {
    const text = JSON.stringify(LIFETIME_COPY);
    expect(text).not.toMatch(/Puntaje CVA|CVA score|SCA score/);
  });
});
