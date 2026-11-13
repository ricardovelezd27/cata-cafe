import { describe, it, expect } from "vitest";
import { buildLifetimeLines, LIFETIME_COPY } from "@/lib/coffeeLifetimeLines";
import type { CoffeeLifetimeScore } from "@/lib/coffeeLifetimeScore";
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
    tally: {
      byType: { ...zeroTypes, moldy: 1 },
      unspecified: 0,
      defective: 1,
      nonUniform: 1,
      defectivePct: 2.5,
      foundBy: 1,
      ...tally,
    },
    ...rest,
  };
}

describe("buildLifetimeLines (es)", () => {
  const L = LIFETIME_COPY.es;

  it("the brief's example: 1 defective cup of 40", () => {
    const lines = buildLifetimeLines(result(), L);
    expect(lines.headline).toBe("83.25");
    expect(lines.accumulated).toBe("Acumulado de 40 tazas en 3 catas · 20 evaluaciones");
    expect(lines.arithmetic).toBe("Base 84.00 − 0.75 (1 taza defectuosa y 1 no uniforme × 5/40) = 83.25");
    expect(lines.tally).toBe("1 taza defectuosa de 40 tazas catadas (2.5 %), encontrada por 1 persona");
    expect(lines.byType).toBe("Mohoso 1");
    expect(lines.nonUniform).toBe("1 taza no uniforme");
    expect(lines.indicative).toBeNull();
    expect(lines.noBase).toBeNull();
    expect(lines.note).toBe(
      "Cada cata conserva su propio puntaje. Este número es del café y cambia cuando se cierra una cata nueva.",
    );
  });

  it("plurals and several types", () => {
    const lines = buildLifetimeLines(
      result({
        cups: 10,
        factor: 0.5,
        deduction: 3,
        score: 76,
        base: 79,
        tally: { byType: { potato: 1, moldy: 2, phenolic: 0 }, unspecified: 1, defective: 4, nonUniform: 4, defectivePct: 40, foundBy: 3 },
      }),
      L,
    );
    expect(lines.tally).toBe("4 tazas defectuosas de 10 tazas catadas (40 %), encontradas por 3 personas");
    expect(lines.byType).toBe("Papa 1 · Mohoso 2 · Sin especificar 1");
    expect(lines.arithmetic).toContain("× 5/10");
  });

  it("no deduction: no arithmetic line and the clean-cups line", () => {
    const lines = buildLifetimeLines(
      result({ deduction: 0, factor: 1, score: 84, tally: { byType: zeroTypes, defective: 0, nonUniform: 0, defectivePct: 0, foundBy: 0 } }),
      L,
    );
    expect(lines.arithmetic).toBeNull();
    expect(lines.tally).toBe("Sin tazas defectuosas en 40 tazas catadas");
    expect(lines.byType).toBeNull();
    expect(lines.nonUniform).toBeNull();
  });

  it("indicative shows the badge and the first-signal line", () => {
    const lines = buildLifetimeLines(result({ indicative: true, cups: 2 }), L);
    expect(lines.indicative).toEqual({ badge: "Indicativo", note: "Menos de 5 tazas catadas: es una primera señal." });
  });

  it("no base: no headline, no arithmetic, the explanation, the tally stays", () => {
    const lines = buildLifetimeLines(
      result({ score: null, base: null, voices: 0, cups: 1, sessions: 1, indicative: true, deduction: 4, factor: 1 }),
      L,
    );
    expect(lines.headline).toBeNull();
    expect(lines.arithmetic).toBeNull();
    expect(lines.accumulated).toBe("Acumulado de 1 taza en 1 cata");
    expect(lines.noBase).toBe(
      "Todavía no hay una cata completa de este café. Las impresiones rápidas (1 taza) cuentan sus tazas y defectos, no su puntaje.",
    );
    expect(lines.tally).toContain("1 taza defectuosa de 1 taza catada");
  });

  it("a fractional deduction that does not add to a quarter shows the exact base and the rounded score after an arrow", () => {
    const lines = buildLifetimeLines(
      result({ base: 80.2, deduction: 0.6, factor: 0.1, score: 79.5, cups: 50 }),
      L,
    );
    expect(lines.arithmetic).toBe("Base 80.20 − 0.60 (1 taza defectuosa y 1 no uniforme × 5/50) = 79.60 → 79.50");
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
