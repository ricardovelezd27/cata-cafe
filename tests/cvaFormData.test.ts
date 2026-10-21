import { describe, expect, it } from "vitest";
import { buildCvaFormData, type CvaFormInput } from "@/lib/pdf/cvaFormData";
import { sanitizePdfText } from "@/lib/pdf/text";

// Pure module: cvaFormData imports lib/constants, lib/descriptors, lib/scoring
// and lib/pdf/text only — no prisma, no react-pdf, no server-only.

const physical = { phys_color: "Verde azulado", phys_humedad: "11.2" };
const extrinsic = { ext_pais_val: "Colombia", ext_region_val: "Huila" };
const affectiveFull = {
  fragancia_af_final: 7,
  aroma_af_final: 8,
  sabor_af_final: 7,
  sabor_residual_af_final: 6,
  acidez_af_final: 8,
  dulzor_af_final: 7,
  sensacion_af_final: 7,
  impresion_global_final: 8,
  tazas_no_uniformes: [false, false, false, false, false],
  tazas_defectuosas: [false, false, false, false, false],
};

function input(over: {
  ownerView: boolean;
  revealed?: boolean;
  affective?: Record<string, unknown>;
  descriptive?: Record<string, unknown>;
  format?: string;
}): CvaFormInput {
  return {
    ownerView: over.ownerView,
    format: over.format ?? "affective",
    sessionName: "Sesión",
    date: "1 oct 2026",
    cupperName: "Ana",
    purpose: "",
    cupsPerSample: 5,
    locale: "es",
    sample: {
      label: "A",
      revealed: over.revealed ?? false,
      coffeeName: "Café X",
      roastLevel: "Medio",
      descriptive: over.descriptive ?? {},
      affective: over.affective ?? {},
      combined: {},
      physical,
      extrinsic,
    },
  };
}

describe("buildCvaFormData — owner-only data", () => {
  it("never renders physical data for a non-owner, even when revealed", () => {
    for (const revealed of [false, true]) {
      const sheet = buildCvaFormData(input({ ownerView: false, revealed }));
      expect(sheet.physical).toEqual([]);
    }
  });

  it("renders physical data for the owner", () => {
    const sheet = buildCvaFormData(input({ ownerView: true }));
    expect(sheet.physical.map((f) => f.value)).toContain("Verde azulado");
  });

  it("hides extrinsic data of an unrevealed sample from a non-owner", () => {
    expect(buildCvaFormData(input({ ownerView: false, revealed: false })).extrinsic).toEqual([]);
  });

  it("shows extrinsic data to a non-owner once revealed, and to the owner always", () => {
    expect(
      buildCvaFormData(input({ ownerView: false, revealed: true })).extrinsic.length,
    ).toBeGreaterThan(0);
    expect(
      buildCvaFormData(input({ ownerView: true, revealed: false })).extrinsic.length,
    ).toBeGreaterThan(0);
  });

  it("keeps coffee name blind until revealed regardless of ownerView", () => {
    expect(buildCvaFormData(input({ ownerView: true, revealed: false })).header.coffeeName).toBeNull();
    expect(buildCvaFormData(input({ ownerView: true, revealed: true })).header.coffeeName).toBe("Café X");
  });
});

describe("buildCvaFormData — score state machine", () => {
  it("complete: all 8 attributes filled gives a score", () => {
    const sheet = buildCvaFormData(input({ ownerView: false, affective: affectiveFull }));
    expect(sheet.scoreState).toBe("complete");
    expect(sheet.score).not.toBe("—");
  });

  it("partial: some attributes filled shows the placeholder score", () => {
    const sheet = buildCvaFormData(
      input({ ownerView: false, affective: { fragancia_af_final: 7, aroma_af_final: 8 } }),
    );
    expect(sheet.scoreState).toBe("partial");
    expect(sheet.score).toBe("—");
  });

  it("empty: nothing filled", () => {
    const sheet = buildCvaFormData(input({ ownerView: false }));
    expect(sheet.scoreState).toBe("empty");
    expect(sheet.score).toBe("—");
  });
});

describe("sanitizePdfText", () => {
  it("strips emoji and keeps accents and Greek-free Latin text", () => {
    expect(sanitizePdfText("Taza limpia 🍋 ñ ü ç")).toBe("Taza limpia ñ ü ç");
    expect(sanitizePdfText("👨‍👩‍👧 hola ☕️")).toBe("hola");
  });

  it("sanitizes user notes inside the built sheet", () => {
    const sheet = buildCvaFormData(
      input({ ownerView: false, descriptive: { fragancia_notas: "dulce 🍋 ñ" } }),
    );
    expect(JSON.stringify(sheet)).not.toContain("🍋");
    expect(JSON.stringify(sheet)).toContain("dulce");
  });
});
