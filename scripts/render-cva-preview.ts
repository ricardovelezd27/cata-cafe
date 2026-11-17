// Layout check for the CVA form PDF. Renders one file per format from a
// filled-in fixture so page geometry, orientation, pagination, and overflow can
// be verified without a live session — the sheets are dense enough that a small
// metric change can silently push content onto an extra page.
//
//   npx tsx scripts/render-cva-preview.ts [outDir]
//
// Expected page counts for the fixture below: descriptive 3 (2 samples/page +
// appendix), affective 3 (3 samples/page as columns + appendix), combined 3
// (1 sample/page + appendix). More than that means something overflowed.
import { renderToFile } from "@react-pdf/renderer";
import { CvaFormDocument, type CvaDocumentProps } from "../lib/pdf/CvaFormDocument";
import path from "node:path";

const OUT = process.argv[2] ?? ".";

const descriptive = {
  fragancia_int: 11,
  aroma_int: 12.5,
  sabor_int: 10,
  sabor_residual_int: 8.5,
  acidez_int: 13,
  dulzor_int: 9,
  sensacion_int: 11.5,
  fragancia_desc: ["floral", "fruity:berry"],
  fragancia_desc_notes: { "fruity:berry": ["arándano", "frambuesa"] },
  aroma_desc: ["sweet:brown_sugar", "nutty_cocoa:cocoa"],
  sabor_desc: ["fruity:citrus", "sweet", "spices:sweet_spices"],
  sabor_desc_notes: { "fruity:citrus": ["mandarina"] },
  sabor_residual_desc: ["nutty_cocoa:nuts", "roasted:cereal"],
  gustos: ["sweet", "sour"],
  acidez_desc: ["acidity:bright", "acidity:citric"],
  dulzor_desc: ["sweetness:brown_sugar", "sweetness:honey"],
  sensacion_desc: ["mouthfeel:smooth", "mouthfeel:silky"],
  fragancia_notas: "Muy expresiva en seco. Σ ▼ ñ ü ç 🍋",
  nota_express: "Taza limpia, mucho cuerpo; la recomendaría para espresso.",
  acidez_notas: "Cítrica, jugosa, sostenida.",
};

const affective = {
  fragancia_af_final: 7,
  aroma_af_final: 8,
  sabor_af_final: 7,
  sabor_residual_af_final: 6,
  acidez_af_final: 8,
  dulzor_af_final: 7,
  sensacion_af_final: 7,
  impresion_global_final: 8,
  fragancia_af_notas: "Prototípica del origen.",
  impresion_global_notas: "Taza limpia y equilibrada.",
  nota_express: "Taza limpia, mucho cuerpo; la recomendaría para espresso.",
  tazas_no_uniformes: [false, true, false, false, false],
  tazas_defectuosas: [false, false, false, false, false],
  defecto_tipo: [],
};

// Defect keys interpolate the Spanish defect name verbatim (spaces and all —
// see PHYSICAL_FIELDS' `phys_cat1_${def.name}_count` pattern in cvaFormData.ts).
const physical = {
  phys_color: "Verde azulado",
  phys_humedad: "11.2",
  phys_screen_15_g: 210,
  phys_screen_16_g: 90,
  phys_screen_14_g: 30,
  "phys_cat1_Grano negro_count": 1,
  phys_cat2_Concha_count: 2,
};
const extrinsic = {
  ext_pais_val: "Colombia",
  ext_region_val: "Huila",
  ext_finca_val: "El Mirador",
  ext_variedad_val: "Caturra",
  ext_proceso_tipo: "Lavado",
  ext_certs: ["Orgánico"],
};

function sample(label: string, revealed = true, isReference = false) {
  return {
    label,
    revealed,
    coffeeName: revealed ? `Café Año ${label} Ñandú 🍋` : null,
    roastLevel: revealed ? "Medio" : null,
    isReference,
    // The fixtures are SENT evaluations, so their totals print (A-01, lib/ownTotal.ts).
    sent: true,
    descriptive,
    affective,
    combined: { ...descriptive, ...affective },
    physical,
    // Keep the pre-ownerView fixture shape (blind samples carry no origin data)
    // so page counts stay comparable: ownerView=true would otherwise print it.
    extrinsic: revealed ? extrinsic : {},
  };
}

const base = {
  sessionName: "Catación de control — Huila 2026",
  date: "22 de julio de 2026",
  cupperName: "Ricardo Vélez",
  purpose: "Pre-embarque",
  cupsPerSample: 5,
  locale: "es" as const,
  ownerView: true,
};

// The four states of the score cell side by side (affective sheet, es + en):
// a sent complete evaluation (a total), an incomplete one, a declared partial
// ("no evaluado" on aroma) and an unsent draft (A-01: "—" and the note).
function scoreStates(): CvaDocumentProps["samples"] {
  const incomplete: Record<string, unknown> = { ...affective };
  delete incomplete.acidez_af_final;
  delete incomplete.impresion_global_final;
  const declaredPartial: Record<string, unknown> = { ...affective, aroma_af_ne: true };
  delete declaredPartial.aroma_af_final;
  return [
    { ...sample("A"), label: "Completa enviada" },
    { ...sample("B"), label: "Incompleta", affective: incomplete },
    { ...sample("C"), label: "Parcial declarada", affective: declaredPartial },
    { ...sample("D"), label: "Sin enviar", sent: false },
  ];
}

async function main() {
  const cases: [string, number][] = [
    ["descriptive", 4],
    ["affective", 5],
    ["combined", 2],
  ];
  for (const [format, count] of cases) {
    const props: CvaDocumentProps = {
      ...base,
      format,
      samples: Array.from({ length: count }, (_, i) =>
        sample(String.fromCharCode(65 + i), i % 3 !== 2, i === 0)
      ),
    };
    const file = path.join(OUT, `cva-${format}.pdf`);
    await renderToFile(CvaFormDocument(props), file);
    console.log("wrote", file);
  }
  for (const locale of ["es", "en"] as const) {
    const file = path.join(OUT, `cva-score-states.${locale}.pdf`);
    await renderToFile(CvaFormDocument({ ...base, locale, format: "affective", samples: scoreStates() }), file);
    console.log("wrote", file);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
