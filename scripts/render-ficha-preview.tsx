// Visual check for lib/pdf/FichaTecnicaDocument.tsx + CoffeeFichaDocument.tsx
// with a rich fixture pushed through the REAL pure builders (buildFichaTecnica /
// buildTeacherNotes), so a layout bug and a model bug show up in the same PDF.
//
//   npx tsx scripts/render-ficha-preview.tsx <outDir> [es|en]
//
// Run from the repo root (fonts are read from ./public/fonts).
import path from "node:path";
import fs from "node:fs";
import { renderToFile } from "@react-pdf/renderer";
import { AFFECTIVE_ATTRIBUTES, FLAVOR_WHEEL, CAT1_DEFECTS, CAT2_DEFECTS } from "../lib/constants";
import { computeGroupAggregate, type GroupAggregate } from "../lib/scoring";
import { computeSampleBlockFrequencies } from "../lib/resultsAggregation";
import { computeCupperAlignment, computeMajoritySets } from "../lib/alignment";
import { buildFichaTecnica } from "../lib/reports/fichaTecnica";
import { buildTeacherNotes } from "../lib/reports/teacherNotes";
import type { ReportEvalRow, SessionReportSource } from "../lib/reports/types";
import { FichaTecnicaDocument } from "../lib/pdf/FichaTecnicaDocument";
import { CoffeeFichaDocument, type CoffeeFichaModel } from "../lib/pdf/CoffeeFichaDocument";

const OUT = process.argv[2] ?? ".";
const locale = process.argv[3] === "en" ? "en" : "es";
fs.mkdirSync(OUT, { recursive: true });

const BLOCK_LABELS: Record<string, Record<string, string>> = {
  es: { nariz: "Nariz", boca: "Boca", gusto: "Gusto predominante", acidez: "Acidez", dulzura: "Dulzura", sensacion: "Sensación en boca" },
  en: { nariz: "Nose", boca: "Mouth", gusto: "Predominant taste", acidez: "Acidity", dulzura: "Sweetness", sensacion: "Mouthfeel" },
};

// Deterministic pseudo-random so the PDF is reproducible.
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

const leaves = FLAVOR_WHEEL.filter((n) => n.level === 3).map((n) => n.id);
const pick = (n: number, offset: number) =>
  Array.from({ length: n }, (_, i) => leaves[(offset + i * 11) % leaves.length]);

const CUPPERS = [
  { id: "u1", name: "Ana María Velásquez" },
  { id: "u2", name: "Bruno Maldonado" },
  { id: "u3", name: "Carla Fontanarrosa" },
  { id: "u4", name: "Diego Restrepo Hoyos" },
  { id: "u5", name: "Elena Ortiz" },
];
const EXCLUDED = new Set(["u5"]);

// base quality per sample (1-9), per-cupper jitter.
const SAMPLES = [
  { id: "s0", label: "A", ref: true, base: 5, revealed: true },
  { id: "s1", label: "B", ref: false, base: 8, revealed: true },
  { id: "s2", label: "C", ref: false, base: 6, revealed: false },
  { id: "s3", label: "D", ref: false, base: 7, revealed: true },
];

function mkEval(cupper: (typeof CUPPERS)[number], si: number): ReportEvalRow {
  const sample = SAMPLES[si];
  const outlier = cupper.id === "u5" ? 2 : 0;
  const jitter = sample.ref ? 0 : Math.round((rnd() - 0.5) * 2);
  const v = Math.max(1, Math.min(9, sample.base + jitter - outlier));
  const common = pick(3, si * 5);
  const own = rnd() > 0.5 ? pick(2, si * 5 + 40 + CUPPERS.indexOf(cupper)) : [];
  const data: Record<string, unknown> = {
    ...Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, v])),
    fragancia_desc: common.slice(0, 2),
    aroma_desc: [...common, ...own].slice(0, 4),
    sabor_desc: common.slice(1),
    sabor_residual_desc: [common[0]],
    acidez_desc: ["acidity:bright"],
    dulzor_desc: rnd() > 0.3 ? ["sweetness:honey"] : ["sweetness:caramelized"],
    sensacion_desc: ["mouthfeel:rugged"],
    gustos: ["sweet"],
    fragancia_int: 5 + Math.round(rnd() * 3),
    aroma_int: 5 + Math.round(rnd() * 3),
    sabor_int: 5 + Math.round(rnd() * 3),
    sabor_residual_int: 4 + Math.round(rnd() * 3),
    acidez_int: 4 + Math.round(rnd() * 4),
    dulzor_int: 5 + Math.round(rnd() * 3),
    sensacion_int: 4 + Math.round(rnd() * 3),
  };
  return {
    id: `ev-${cupper.id}-${sample.id}`,
    cupperId: cupper.id,
    displayName: cupper.name,
    sessionSampleId: sample.id,
    descriptiveData: {},
    affectiveData: {},
    combinedData: data,
    nonUniformCups: [false, false, si === 2, false, false],
    defectiveCups: [false, false, false, false, si === 2 && cupper.id === "u5"],
  };
}

const evals = SAMPLES.flatMap((_, si) => CUPPERS.map((c) => mkEval(c, si)));

const physicalBlob = (extra: Record<string, unknown>): Record<string, unknown> => ({
  phys_color: "Verde azulado",
  phys_humedad: "10.8",
  phys_screen_14_g: 40,
  phys_screen_15_g: 112,
  phys_screen_16_g: 78,
  phys_screen_17_g: 26,
  phys_screen_18_g: 6,
  [`phys_cat1_${CAT1_DEFECTS[0].name}_count`]: 1,
  [`phys_cat1_${CAT1_DEFECTS[5].name}_count`]: 10,
  [`phys_cat2_${CAT2_DEFECTS[2].name}_count`]: 7,
  [`phys_cat2_${CAT2_DEFECTS[4].name}_count`]: 3,
  [`phys_cat2_${CAT2_DEFECTS[9].name}_count`]: 20,
  ...extra,
});

const coffeeBase = {
  deletedAt: null,
  region: null,
  farm: null,
  producer: null,
  variety: null,
  processType: null,
  altitude: null,
  roastLevel: null,
};

const samples: SessionReportSource["samples"] = [
  {
    id: "s0",
    label: "A",
    position: 1,
    revealed: true,
    isReference: true,
    coffee: { ...coffeeBase, name: "Referencia Huila Castillo", code: "H4R2KM", country: "Colombia", roastLevel: "Medio" },
    physical: {},
    extrinsic: {},
  },
  {
    id: "s1",
    label: "B",
    position: 2,
    revealed: true,
    isReference: false,
    coffee: {
      ...coffeeBase,
      name: "Nariño Caturra lavado de altura con nombre largo para probar el recorte",
      code: "K7M3FP",
      country: "Colombia",
      region: "Nariño",
      farm: "La Esperanza",
      producer: "Familia Quintero",
      variety: "Caturra",
      processType: "Lavado",
      altitude: "1950",
      roastLevel: "Claro",
    },
    physical: physicalBlob({}),
    extrinsic: {
      ext_pais_val: "Colombia",
      ext_region_val: "Nariño",
      ext_finca_val: "La Esperanza",
      ext_productor_val: "Familia Quintero",
      ext_variedad_val: "Caturra",
      ext_cosecha_val: "2025/2026",
      ext_proceso_tipo: "Lavado",
      ext_exportador_val: "Cooperativa del Sur",
      ext_precio_val: "USD 4,20 / lb",
      ext_lote_val: "12 sacos de 70 kg",
      ext_certs: ["Orgánico", "Rainforest Alliance"],
    },
  },
  {
    id: "s2",
    label: "C",
    position: 3,
    revealed: false,
    isReference: false,
    coffee: { ...coffeeBase, name: "Café sin revelar", code: "Z9Z9Z9", country: "Etiopía" },
    physical: physicalBlob({ phys_color: "Verde", phys_humedad: "11.6" }),
    extrinsic: { ext_pais_val: "Etiopía", ext_variedad_val: "Heirloom", ext_proceso_tipo: "Natural" },
  },
  {
    id: "s3",
    label: "D",
    position: 4,
    revealed: true,
    isReference: false,
    coffee: { ...coffeeBase, name: "Tolima Geisha", code: "T6G8WA", country: "Colombia", variety: "Geisha", processType: "Honey", roastLevel: "Claro" },
    physical: {},
    extrinsic: {},
  },
];

const groupAggBySample: Record<string, GroupAggregate> = {};
for (const s of samples) {
  groupAggBySample[s.id] = computeGroupAggregate(
    evals
      .filter((e) => e.sessionSampleId === s.id && !EXCLUDED.has(e.cupperId))
      .map((e) => ({ data: e.combinedData, nonUniformCups: e.nonUniformCups, defectiveCups: e.defectiveCups })),
    5,
  );
}
const sampleIds = samples.map((s) => ({ id: s.id, label: s.label }));
const descriptorFrequency = computeSampleBlockFrequencies({
  format: "combined",
  samples: sampleIds,
  evals: evals.map((e) => ({
    cupperId: e.cupperId,
    sessionSampleId: e.sessionSampleId,
    descriptiveData: e.descriptiveData,
    combinedData: e.combinedData,
  })),
  excludedUserIds: EXCLUDED,
  blockLabel: (id) => BLOCK_LABELS[locale][id] ?? id,
  locale,
})!;
const alignInput = {
  format: "combined" as const,
  samples: sampleIds.map((s) => ({ id: s.id })),
  evals: evals.map((e) => ({
    cupperId: e.cupperId,
    sessionSampleId: e.sessionSampleId,
    descriptiveData: e.descriptiveData,
    combinedData: e.combinedData,
    cupper: { displayName: e.displayName },
  })),
  excludedUserIds: EXCLUDED,
};

const source: SessionReportSource = {
  session: {
    id: "sess-1",
    name: "Cata de calibración · Laboratorio Huila",
    date: new Date("2026-10-14T15:00:00Z"),
    objective: "Calibrar el paladar del equipo contra la referencia y revisar lotes de Nariño y Tolima antes de la compra.",
    format: "combined",
    cupsPerSample: 5,
    isGroup: true,
    status: "closed",
    createdBy: "u1",
    referenceSampleId: "s0",
    closedAt: new Date("2026-10-15T15:00:00Z"),
  },
  ownerName: CUPPERS[0].name,
  samples,
  participants: CUPPERS.map((c, i) => ({
    userId: c.id,
    displayName: c.name,
    status: i === 0 ? "owner" : "joined",
    excluded: EXCLUDED.has(c.id),
  })),
  evals,
  excludedUserIds: [...EXCLUDED],
  submittedCupperCount: CUPPERS.length,
  groupAggBySample,
  descriptorFrequency,
  alignmentRows: computeCupperAlignment(alignInput),
  majoritySets: computeMajoritySets(alignInput),
};

const model = buildFichaTecnica(source, {
  tier: "owner",
  locale,
  labels: { coffeeDeleted: "Café eliminado", soloTopDescriptors: "Descriptores principales" },
});
const teacherNotes = buildTeacherNotes(source);

const fichaFile = path.join(OUT, locale === "en" ? "ficha-en.pdf" : "ficha.pdf");

// Coffee-scoped ficha fixture.
const coffeeModel: CoffeeFichaModel = {
  identity: {
    label: "Nariño Caturra lavado de altura",
    isReference: false,
    revealed: true,
    coffeeName: null,
    code: "K7M3FP",
    roastLevel: "Claro",
    coffee: {
      country: "Colombia",
      region: "Nariño",
      farm: "La Esperanza",
      producer: "Familia Quintero",
      variety: "Caturra",
      processType: "Lavado",
      altitude: "1950",
    },
  },
  extrinsic: { ext_especie_val: "Arábica", ext_cosecha_val: "2025/2026", ext_certs: ["Orgánico", "Rainforest Alliance"] },
  notes: "Lote de exportación. Guardar contramuestra de 300 g hasta diciembre.",
  results: {
    sessionsCount: 3,
    evaluationsCount: 14,
    affective: {
      communityScore: 84.1,
      sd: null,
      included: 14,
      submitted: 14,
      attrAverages: AFFECTIVE_ATTRIBUTES.map((a, i) => ({ id: a.id, label: a.label, value: 6.5 + (i % 4) * 0.6 })),
      uniformityPenalty: 0,
      defectPenalty: 0,
    },
    sessions: [
      { name: "Cata de calibración · Laboratorio Huila", date: new Date("2026-10-14"), score: 84.1 },
      { name: "Revisión de lotes septiembre", date: new Date("2026-09-20"), score: 82.35 },
      { name: "Cata de bienvenida", date: new Date("2026-08-02"), score: null },
    ],
  },
};

(async () => {
  await renderToFile(<FichaTecnicaDocument model={model} teacherNotes={teacherNotes} locale={locale} />, fichaFile);
  console.log("wrote", fichaFile);
  const coffeeFile = path.join(OUT, locale === "en" ? "ficha-cafe-en.pdf" : "ficha-cafe.pdf");
  await renderToFile(<CoffeeFichaDocument model={coffeeModel} locale={locale} />, coffeeFile);
  console.log("wrote", coffeeFile);
})();
