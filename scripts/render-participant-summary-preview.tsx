// Visual check for lib/pdf/ParticipantSummaryDocument.tsx with a fixture model.
//
//   npx tsx scripts/render-participant-summary-preview.tsx <outDir> [es|en]
import path from "node:path";
import fs from "node:fs";
import { renderToFile } from "@react-pdf/renderer";
import { ParticipantSummaryDocument } from "../lib/pdf/ParticipantSummaryDocument";
import type {
  ParticipantSummaryModel,
  ParticipantSummarySample,
} from "../lib/reports/participantSummary";

const OUT = process.argv[2] ?? ".";
const locale = process.argv[3] === "en" ? "en" : "es";
fs.mkdirSync(OUT, { recursive: true });

const desc = (...rows: [string, number, boolean][]) =>
  rows.map(([label, pct, mine]) => ({ label, pct, mine }));

const samples: ParticipantSummarySample[] = [
  {
    label: "A",
    isReference: true,
    coffee: "Huila Pink Bourbon",
    myScore: 79,
    communityScore: 79,
    sd: 0,
    deltaVsRef: null,
    radar: {
      mine: [5, 5, 5, 5, 5, 5, 5, 5],
      community: [5, 5, 5, 5, 5, 5, 5, 5],
    },
    topDescriptors: desc(
      ["Chocolate", 71, true],
      ["Caramelo", 57, false],
      ["Nuez", 43, true],
    ),
    consensus: "El grupo coincide en notas de chocolate y caramelo.",
    myNotes: [{ stage: "aroma", text: "Dulce, tostado suave." }],
  },
  {
    label: "B",
    isReference: false,
    coffee: "Nariño Caturra lavado de altura",
    myScore: 86.4,
    communityScore: 84.1,
    sd: 2.3,
    deltaVsRef: 7.4,
    radar: {
      mine: [8, 7, 8, 7, 8, 7, 7, 8],
      community: [7, 7, 8, 6, 7, 7, 7, 7],
    },
    topDescriptors: desc(
      ["Frutos rojos", 86, true],
      ["Cítrico", 71, true],
      ["Floral", 57, false],
      ["Panela", 43, false],
      ["Té negro", 29, true],
    ),
    consensus: "Alta coincidencia en acidez cítrica y frutos rojos.",
    myNotes: [
      { stage: "acidez", text: "Brillante, tipo mandarina, muy limpia." },
      { stage: "sabor", text: "Final largo y dulce." },
    ],
  },
  {
    label: "C",
    isReference: false,
    coffee: null,
    myScore: 74.2,
    communityScore: 76.8,
    sd: 3.9,
    deltaVsRef: -4.8,
    radar: {
      mine: [6, 6, 5, 5, 6, 5, 6, 5],
      community: [6, 6, 6, 6, 6, 6, 6, 6],
    },
    topDescriptors: desc(
      ["Madera", 60, false],
      ["Papel", 40, true],
      ["Nuez", 40, false],
    ),
    consensus: "Opiniones divididas sobre el cuerpo.",
    myNotes: [],
  },
  {
    label: "D",
    isReference: false,
    coffee: "Cauca Castillo natural",
    myScore: 82.0,
    communityScore: null,
    sd: null,
    deltaVsRef: 3.0,
    radar: { mine: [7, 7, 7, 7, 7, 7, 7, 7], community: null },
    topDescriptors: desc(
      ["Fermentado", 50, true],
      ["Frutas tropicales", 50, true],
    ),
    consensus: null,
    myNotes: [
      {
        stage: "dulzor",
        text: "Muy dulce, casi licoroso. Me recordó al vino.",
      },
    ],
  },
  {
    label: "E",
    isReference: false,
    coffee: "Tolima Geisha",
    myScore: 88.7,
    communityScore: 87.9,
    sd: 1.2,
    deltaVsRef: 9.7,
    radar: {
      mine: [9, 8, 9, 8, 9, 8, 8, 9],
      community: [8, 8, 9, 8, 8, 8, 8, 8],
    },
    topDescriptors: desc(
      ["Jazmín", 100, true],
      ["Bergamota", 86, true],
      ["Durazno", 71, false],
      ["Miel", 57, true],
      ["Té blanco", 43, false],
    ),
    consensus: "Consenso fuerte: perfil floral y de frutas de hueso.",
    myNotes: [],
  },
  {
    label: "F",
    isReference: false,
    coffee:
      "Café de la finca con un nombre extraordinariamente largo para probar el recorte",
    myScore: null,
    communityScore: 80.3,
    sd: 2.0,
    deltaVsRef: null,
    radar: { mine: null, community: [7, 6, 7, 6, 7, 6, 6, 7] },
    topDescriptors: desc(["Caramelo", 67, false], ["Cacao", 50, false]),
    consensus: "El grupo percibió dulzor predominante.",
    myNotes: [],
  },
];

const model: ParticipantSummaryModel = {
  header: {
    sessionName: "Cata de calibración · Laboratorio Huila",
    date: new Date("2026-10-14T15:00:00Z"),
    cupperName: "Ana María Velásquez",
    format: "combined",
    cupsPerSample: 5,
    participants: 9,
    referenceLabel: "A",
  },
  kpis: {
    myAvg: 82.06,
    communityAvg: 81.78,
    delta: 0.28,
    myAlignment: { alignment: 0.64, matches: 14, opportunities: 22 },
    evaluated: 5,
    total: 6,
  },
  samples,
};

const file = path.join(OUT, "participant-summary.pdf");
renderToFile(
  <ParticipantSummaryDocument model={model} locale={locale} />,
  file,
).then(() => console.log("wrote", file));
