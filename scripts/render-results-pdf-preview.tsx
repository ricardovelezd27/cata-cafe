// Visual check for lib/pdf/ResultsDocument.tsx with a made-up cupping (no database):
// a participant's file and the organizer's, in both languages.
//
//   npx tsx scripts/render-results-pdf-preview.tsx <outDir>
//
// Rasterize with PyMuPDF to look at it (the same way as the other report previews).
import fs from "node:fs";
import path from "node:path";
import { renderToFile } from "@react-pdf/renderer";
import es from "../messages/es.json";
import en from "../messages/en.json";
import { AFFECTIVE_ATTRIBUTES, FLAVOR_WHEEL } from "../lib/constants";
import { computeGroupAggregate, type GroupAggregate } from "../lib/scoring";
import { wheelFamilyLabels, wheelNodeLabels } from "../lib/flavorWheelLabels";
import { buildCardsStrings } from "../components/results/cardsStrings";
import { buildOverviewStrings } from "../components/results/overviewStrings";
import { buildResultsPartsStrings } from "../components/results/partsStrings";
import { CVA_TEXT } from "../lib/pdf/cvaFormData";
import { ResultsDocument, type ResultsPdfStrings } from "../lib/pdf/ResultsDocument";
import { buildResultsPdfModel } from "../lib/reports/resultsPdf";
import type { ReportEvalRow, SessionReportSource } from "../lib/reports/types";

const OUT = process.argv[2] ?? ".";
fs.mkdirSync(OUT, { recursive: true });

const LEAVES = FLAVOR_WHEEL.filter((n) => n.level === 3).map((n) => n.id);
const CUPPERS = ["uid-a", "uid-b", "uid-c", "uid-d", "uid-e", "uid-f"];
const SAMPLES: [string, string, number][] = [
  ["s-ref", "Muestra A", 5],
  ["s-1", "Muestra B", 8],
  ["s-2", "Muestra C", 7],
  ["s-3", "Muestra D", 6],
  ["s-4", "Muestra E", 7],
];

function evaluation(ci: number, si: number): ReportEvalRow {
  const [sampleId, , base] = SAMPLES[si];
  const pick = (k: number) => [0, 1, 2].map((j) => LEAVES[(ci * 3 + si * 5 + k * 7 + j * 11) % LEAVES.length]);
  const value = Math.max(1, Math.min(9, base + ((ci + si) % 3) - 1));
  const defective = sampleId === "s-3" && ci < 2;
  return {
    id: `ev-${ci}-${si}`,
    cupperId: CUPPERS[ci],
    displayName: `Catador ${ci}`,
    sessionSampleId: sampleId,
    descriptiveData: {},
    affectiveData: {},
    combinedData: {
      ...Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [`${a.id}_final`, value])),
      fragancia_desc: pick(0),
      aroma_desc: pick(1),
      sabor_desc: pick(2),
      tazas_defectuosas: [defective, false],
      tazas_no_uniformes: [defective, false],
      tazas_defecto_tipo: [defective ? "moldy" : null, null],
    },
    nonUniformCups: [defective, false],
    defectiveCups: [defective, false],
    cups: 2,
  };
}

function source(createdBy: string): SessionReportSource {
  const evals = CUPPERS.flatMap((_, ci) => SAMPLES.map((_, si) => evaluation(ci, si)));
  const coffee = (name: string, country: string) => ({
    name,
    deletedAt: null,
    code: null,
    country,
    region: null,
    farm: null,
    producer: null,
    variety: null,
    processType: null,
    altitude: null,
    roastLevel: null,
  });
  const samples = SAMPLES.map(([id, label], i) => ({
    id,
    label,
    position: i + 1,
    revealed: i === 1 || i === 2,
    isReference: i === 0,
    referenceRank: i === 0 ? 1 : null,
    coffee: i === 1 ? coffee("Huila Pink Bourbon", "Colombia") : i === 2 ? coffee("Sidamo Guji", "Etiopía") : null,
    physical: {},
    extrinsic: {},
  }));
  const groupAggBySample: Record<string, GroupAggregate> = {};
  for (const [id] of SAMPLES) {
    groupAggBySample[id] = computeGroupAggregate(
      evals
        .filter((e) => e.sessionSampleId === id)
        .map((e) => ({ data: e.combinedData, nonUniformCups: e.nonUniformCups, defectiveCups: e.defectiveCups, cups: 2 })),
      2,
    );
  }
  return {
    session: {
      id: "sess",
      name: "Cata de lanzamiento: lotes de Huila y Sidamo",
      date: new Date("2026-11-14T12:00:00Z"),
      objective: null,
      format: "combined",
      cupsPerSample: 2,
      isGroup: true,
      status: "closed",
      createdBy,
      referenceSampleId: "s-ref",
      referenceMode: "anchor",
      closedAt: new Date("2026-11-15T12:00:00Z"),
    },
    ownerName: "Organizadora",
    samples,
    participants: CUPPERS.map((id, i) => ({ userId: id, displayName: `Catador ${i}`, status: "joined", excluded: false })),
    evals,
    excludedUserIds: [],
    submittedCupperCount: CUPPERS.length,
    groupAggBySample,
    descriptorFrequency: null,
    alignmentRows: [{ id: "uid-a", name: "Catador 0", excluded: false, alignment: 0.64, matches: 14, opportunities: 22, bySample: {} }],
    majoritySets: {},
    stamp: { inclusion: { included: 6, total: 6 }, resultsUpdatedAt: null, originEditedAt: null },
  };
}

function strings(locale: "es" | "en"): ResultsPdfStrings {
  const messages = (locale === "es" ? es : en) as unknown as Record<string, unknown>;
  const get = (root: string, key: string): string => {
    let node: unknown = (messages[root] as Record<string, unknown>) ?? messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    return String(node);
  };
  const tResults = Object.assign((key: string) => get("results", key), { raw: (key: string) => get("results", key) });
  const types = (messages.cupping as { cups: { types: Record<string, string> } }).cups.types;
  const attrs = messages.attributes as Record<string, string>;
  const date = new Date("2026-11-14T12:00:00Z").toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return {
    facts: `${get("results", "overview.pageKind")} · ${date}`,
    overview: buildOverviewStrings(tResults, {
      rankHelp: get("results", "dashboard.rankHelp"),
      communityPending: get("results", "communityPending"),
      defectTypes: { moldy: types.moldy, phenolic: types.phenolic, potato: types.potato },
    }),
    cards: buildCardsStrings(tResults, {
      inProgress: get("results", "table.inProgress"),
      notEvaluated: get("results", "table.notEvaluated"),
      inProgressLegend: get("results", "table.inProgressLegend"),
      partialLabel: get("results", "partial.label"),
      reveal: "",
      revealed: "",
      referenceBadge: get("results", "referenceBadge"),
      attributes: Object.fromEntries(AFFECTIVE_ATTRIBUTES.map((a) => [a.id, attrs[a.id]])),
    }),
    parts: buildResultsPartsStrings(tResults),
    familyLabels: wheelFamilyLabels(locale),
    nodeLabels: wheelNodeLabels(locale),
    attribution: CVA_TEXT[locale].attribution,
  };
}

async function main() {
  for (const locale of ["es", "en"] as const) {
    for (const lens of ["participant", "organizer"] as const) {
      const organizer = lens === "organizer";
      const model = buildResultsPdfModel(source(organizer ? "uid-a" : "uid-owner"), {
        viewerId: "uid-a",
        viewAsId: "uid-a",
        isAdminViewer: false,
        canViewGroup: true,
        coffeeDeleted: "Café eliminado",
      });
      const file = path.join(OUT, `results-${lens}.${locale}.pdf`);
      await renderToFile(<ResultsDocument model={model} strings={strings(locale)} locale={locale} />, file);
      console.log("wrote", file);
    }
  }
}
main();
