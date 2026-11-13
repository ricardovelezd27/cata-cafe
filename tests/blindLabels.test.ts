import { describe, expect, it } from "vitest";
import {
  finalSampleLabel,
  isAutoSampleLabel,
  planBlindOrder,
  planBlindSamples,
  sampleLetter,
  sampleLetterLabel,
} from "@/lib/blindLabels";

/** Small deterministic PRNG (mulberry32) -> random(n) in [0, n). */
function seeded(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * n);
  };
}

describe("sampleLetter", () => {
  it("is bijective base 26", () => {
    expect(sampleLetter(0)).toBe("A");
    expect(sampleLetter(25)).toBe("Z");
    expect(sampleLetter(26)).toBe("AA");
    expect(sampleLetter(27)).toBe("AB");
    expect(sampleLetterLabel(2, "es")).toBe("Muestra C");
    expect(sampleLetterLabel(2, "en")).toBe("Sample C");
  });
});

describe("isAutoSampleLabel", () => {
  it("accepts empty and generated forms", () => {
    for (const l of ["", "   ", "Muestra A", "Sample B", "Muestra AA", "Muestra 3", "Sample 12", " Muestra C "]) {
      expect(isAutoSampleLabel(l), l).toBe(true);
    }
    expect(isAutoSampleLabel(null)).toBe(true);
    expect(isAutoSampleLabel(undefined)).toBe(true);
  });
  it("rejects anything the owner typed", () => {
    for (const l of ["Geisha", "Muestra", "Muestra a", "Muestra ABC", "Muestra A extra", "A", "Lote 7", "Sample"]) {
      expect(isAutoSampleLabel(l), l).toBe(false);
    }
  });
});

describe("planBlindOrder", () => {
  it("a single sample (or none) is a no-op", () => {
    expect(planBlindOrder([], seeded(1), "create")).toEqual([]);
    expect(planBlindOrder([{ label: "" }], seeded(1), "create")).toEqual([{ position: 0, auto: true, letterIndex: 0 }]);
  });

  it("is a true permutation and never moves a typed label (property)", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rnd = seeded(seed);
      const n = 1 + (seed % 9);
      const labels = Array.from({ length: n }, (_, i) => (rnd(3) === 0 ? `Mi ${i}` : rnd(2) ? "" : "Muestra A"));
      const plan = planBlindOrder(labels.map((label) => ({ label })), rnd, "duplicate");
      expect(plan.map((p) => p.position).sort((a, b) => a - b)).toEqual(labels.map((_, i) => i));
      plan.forEach((p, i) => {
        expect(p.auto).toBe(isAutoSampleLabel(labels[i]));
        if (!p.auto) expect(p.position).toBe(i);
      });
    }
  });

  it("with n auto samples every one of the n! orders is reachable", () => {
    for (const n of [2, 3, 4]) {
      const seen = new Set<string>();
      for (let seed = 1; seed <= 4000; seed++) {
        const plan = planBlindOrder(Array.from({ length: n }, () => ({ label: "" })), seeded(seed), "create");
        seen.add(plan.map((p) => p.position).join(","));
      }
      const fact = [1, 1, 2, 6, 24][n];
      expect(seen.size).toBe(fact);
    }
  });

  it("permutes only among the positions the auto samples occupy", () => {
    const labels = [{ label: "" }, { label: "Fijo" }, { label: "" }, { label: "" }];
    for (let seed = 1; seed <= 200; seed++) {
      const plan = planBlindOrder(labels, seeded(seed), "create");
      expect(plan[1]).toEqual({ position: 1, auto: false });
      expect(new Set([plan[0].position, plan[2].position, plan[3].position])).toEqual(new Set([0, 2, 3]));
    }
  });

  it("survives a hostile random source", () => {
    const five = () => Array.from({ length: 5 }, () => ({ label: "" }));
    const big = planBlindOrder(five(), () => 999, "create");
    expect(big.map((p) => p.position).sort()).toEqual([0, 1, 2, 3, 4]);
    const nan = planBlindOrder(five(), () => NaN, "create");
    expect(nan.map((p) => p.position).sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("planBlindSamples", () => {
  it("labels auto samples by their new position and keeps the coffee with the sample", () => {
    const input = [
      { label: "", coffeeIdx: 0 },
      { label: "Mi lote", coffeeIdx: 1 },
      { label: "", coffeeIdx: 2 },
    ];
    for (let seed = 1; seed <= 50; seed++) {
      const out = planBlindSamples(input, seeded(seed), "es", "create");
      expect(out.map((o) => o.position)).toEqual([0, 1, 2]);
      expect(out[1]).toMatchObject({ label: "Mi lote", sourceIndex: 1 });
      for (const o of out) {
        // typed "Mi lote" clashes with no letter: each blank keeps its position's letter (A and C)
        if (o.sourceIndex !== 1) expect(o.label).toBe(sampleLetterLabel(o.position, "es"));
        expect(o.sample.coffeeIdx).toBe(o.sourceIndex);
      }
    }
  });

  it("property: automatic labels are unique and never equal a typed label, in both languages", () => {
    const typedPool = ["Muestra B", "sample c", "Geisha", "Muestra A ", "Sample AA", "Muestra 3"];
    for (let seed = 1; seed <= 400; seed++) {
      const rnd = seeded(seed);
      const n = 1 + (seed % 12);
      const input = Array.from({ length: n }, () => ({ label: rnd(2) ? "" : typedPool[rnd(typedPool.length)] }));
      for (const locale of ["es", "en"]) {
        const out = planBlindSamples(input, seeded(seed + 7), locale, "create");
        const typed = out.filter((o) => o.label === input[o.sourceIndex].label.trim() && input[o.sourceIndex].label !== "");
        const autos = out.filter((o) => input[o.sourceIndex].label === "");
        const norm = (x: string) => x.trim().toLowerCase().replace(/^sample /, "muestra ");
        const autoKeys = autos.map((o) => norm(o.label));
        expect(new Set(autoKeys).size).toBe(autoKeys.length);
        for (const t of typed) expect(autoKeys).not.toContain(norm(t.label));
      }
    }
  });

  it("finalSampleLabel keeps the typed text verbatim (trimmed)", () => {
    expect(finalSampleLabel(" Hola ", { position: 3, auto: false }, "es")).toBe("Hola");
    expect(finalSampleLabel("", { position: 3, auto: true }, "en")).toBe("Sample D");
  });
});
