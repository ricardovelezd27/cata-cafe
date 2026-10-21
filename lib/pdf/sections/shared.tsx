// Shared layout primitives, locale copy and styles for the ficha tecnica
// sections. Server-only (react-pdf). Hex literals live in ../palette only.

import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "@react-pdf/renderer";
import { SERIF } from "../fonts";
import { PDF_PALETTE } from "../palette";

export type Locale = "es" | "en";

export const PAGE_W = 595.28;
export const PAGE_PAD = 36;
export const CONTENT_W = PAGE_W - PAGE_PAD * 2;
export const CARD_PAD = 12;
export const INNER_W = CONTENT_W - CARD_PAD * 2 - 2;

export const C = {
  ink: PDF_PALETTE.ink,
  soft: PDF_PALETTE.soft,
  hair: PDF_PALETTE.hair,
  paper: PDF_PALETTE.paper,
};

export const st = StyleSheet.create({
  card: { border: `0.75pt solid ${C.hair}`, marginBottom: 10, padding: CARD_PAD },
  blockTitle: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: C.soft,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tag: { fontSize: 6.5, letterSpacing: 1, color: C.soft, textTransform: "uppercase" },
  big: { fontFamily: SERIF, fontWeight: 700, fontSize: 18 },
  body: { fontSize: 8.5, color: C.ink },
  muted: { fontSize: 8.5, color: C.soft, fontStyle: "italic" },
  small: { fontSize: 7, color: C.soft },
  kvGrid: { flexDirection: "row", flexWrap: "wrap" },
  kvCell: { width: "33.33%", paddingRight: 8, marginBottom: 5 },
  kvLabel: { fontSize: 6.5, letterSpacing: 0.8, color: C.soft, textTransform: "uppercase" },
  kvValue: { fontSize: 9, fontWeight: 700, marginTop: 1 },
  chip: {
    borderWidth: 0.75,
    borderColor: PDF_PALETTE.band.neutral,
    borderRadius: 4,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    alignSelf: "flex-start",
  },
  chipText: { fontSize: 8, fontWeight: 700, color: PDF_PALETTE.band.neutral },
  th: {
    fontSize: 6.5,
    letterSpacing: 0.6,
    color: C.soft,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottom: `0.5pt solid ${C.hair}`,
    paddingVertical: 3,
  },
  sep: { marginTop: 10, borderTop: `0.5pt solid ${C.hair}`, paddingTop: 8 },
});

export function fmt(n: number | null | undefined, digits = 2): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toFixed(digits) : "—";
}

export function BlockTitle({ children }: { children: ReactNode }) {
  return <Text style={st.blockTitle}>{children}</Text>;
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <View style={st.chip}>
      <Text style={st.chipText}>{children}</Text>
    </View>
  );
}

export function KeyValues({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View style={st.kvGrid}>
      {rows.map((r, i) => (
        <View key={i} style={st.kvCell}>
          <Text style={st.kvLabel}>{r.label}</Text>
          <Text style={st.kvValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Copy used by the section blocks (document-level copy lives in the Documents). */
export type SectionCopy = {
  sample: string;
  reference: string;
  code: string;
  roast: string;
  blindCoffee: string;
  green: string;
  greenNone: string;
  defectsCat1: string;
  defectsCat2: string;
  defectName: string;
  defectCount: string;
  defectRatio: string;
  defectFull: string;
  defectTotal: string;
  screens: string;
  screensSub: string;
  affective: string;
  communityScore: string;
  sd: string;
  includedOf: (inc: number, sub: number) => string;
  noAffective: string;
  attrMeans: string;
  penalties: string;
  uniformity: string;
  defects: string;
  descriptive: string;
  intensity: string;
  noDescriptors: string;
  participation: string;
  submitted: string;
  included: string;
  invited: string;
  appendix: string;
  appendixSub: string;
  cupper: string;
  mean: string;
  sdShort: string;
  alignmentRank: string;
  alignmentSub: (m: number, o: number) => string;
  excluded: string;
  bandLegend: string;
  teacherNotes: string;
  teacherSub: string;
  alignment: string;
  community: string;
  score: string;
  delta: string;
  missed: string;
  extra: string;
  none: string;
  handwritten: string;
  notEvaluated: string;
  stages: Record<string, string>;
  axes: string[];
  attrNames: string[];
  blocks: Record<string, string>;
  extrinsicTitle: string;
  originFacts: Record<string, string>;
  /** Spanish label (as produced by cvaFormData) → this locale. */
  fieldLabels: Record<string, string>;
};

export const SECTION_TEXT: Record<Locale, SectionCopy> = {
  es: {
    sample: "Muestra",
    reference: "Referencia",
    code: "Código",
    roast: "Tueste",
    blindCoffee: "Café sin revelar",
    green: "Evaluación física (café verde)",
    greenNone: "Sin defectos registrados.",
    defectsCat1: "Defectos categoría 1",
    defectsCat2: "Defectos categoría 2",
    defectName: "Defecto",
    defectCount: "Granos",
    defectRatio: "Razón",
    defectFull: "Completos",
    defectTotal: "Total",
    screens: "Distribución por malla",
    screensSub: "Peso en gramos",
    affective: "Evaluación afectiva (CVA)",
    communityScore: "Puntaje comunitario",
    sd: "desv. estándar",
    includedOf: (i, s) => `Incluidos ${i} de ${s} catadores`,
    noAffective: "Aún no hay evaluaciones suficientes para un puntaje comunitario.",
    attrMeans: "Promedio por atributo",
    penalties: "Penalizaciones",
    uniformity: "Uniformidad",
    defects: "Defectos",
    descriptive: "Evaluación descriptiva",
    intensity: "Intensidad media (1 a 9)",
    noDescriptors: "Sin descriptores registrados.",
    participation: "Participación",
    submitted: "Evaluaciones enviadas",
    included: "Incluidas en el puntaje",
    invited: "Participantes",
    appendix: "Apéndice del propietario",
    appendixSub: "Puntaje individual por catador y muestra",
    cupper: "Catador",
    mean: "Media",
    sdShort: "DE",
    alignmentRank: "Alineación con el consenso de descriptores",
    alignmentSub: (m, o) => `${m} de ${o}`,
    excluded: "excluido",
    bandLegend:
      "Verde: dentro de 1 DE de la media del grupo. Ámbar: 1 DE o más. Rojo: 2 DE o más (posible valor atípico). Los catadores excluidos no se colorean.",
    teacherNotes: "Notas del profesor",
    teacherSub: "Retroalimentación individual",
    alignment: "Alineación con el grupo",
    community: "Grupo",
    score: "Puntaje",
    delta: "Dif.",
    missed: "Descriptores de consenso que no marcó",
    extra: "Descriptores propios fuera del consenso",
    none: "Ninguno",
    handwritten: "Notas a mano",
    notEvaluated: "Sin evaluación",
    stages: {
      fragancia: "Fragancia",
      aroma: "Aroma",
      sabor: "Sabor",
      sabor_residual: "Sabor residual",
      acidez: "Acidez",
      dulzor: "Dulzor",
      sensacion: "Boca",
    },
    axes: ["Fragancia", "Aroma", "Sabor", "Sabor resid.", "Acidez", "Dulzor", "Boca", "Global"],
    attrNames: [
      "Fragancia",
      "Aroma",
      "Sabor",
      "Sabor residual",
      "Acidez",
      "Dulzor",
      "Sensación en boca",
      "Impresión global",
    ],
    blocks: {
      nariz: "Nariz",
      boca: "Boca",
      gusto: "Gusto predominante",
      acidez: "Acidez",
      dulzura: "Dulzura",
      sensacion: "Sensación en boca",
    },
    extrinsicTitle: "Datos de origen",
    originFacts: {
      country: "País",
      region: "Región",
      farm: "Finca",
      producer: "Productor",
      variety: "Variedad",
      processType: "Proceso",
      altitude: "Altitud (m)",
    },
    fieldLabels: {},
  },
  en: {
    sample: "Sample",
    reference: "Reference",
    code: "Code",
    roast: "Roast",
    blindCoffee: "Coffee not revealed",
    green: "Physical assessment (green coffee)",
    greenNone: "No defects recorded.",
    defectsCat1: "Category 1 defects",
    defectsCat2: "Category 2 defects",
    defectName: "Defect",
    defectCount: "Beans",
    defectRatio: "Ratio",
    defectFull: "Full",
    defectTotal: "Total",
    screens: "Screen size distribution",
    screensSub: "Weight in grams",
    affective: "Affective assessment (CVA)",
    communityScore: "Community score",
    sd: "std. deviation",
    includedOf: (i, s) => `${i} of ${s} cuppers included`,
    noAffective: "Not enough evaluations yet for a community score.",
    attrMeans: "Mean per attribute",
    penalties: "Penalties",
    uniformity: "Uniformity",
    defects: "Defects",
    descriptive: "Descriptive assessment",
    intensity: "Mean intensity (1 to 9)",
    noDescriptors: "No descriptors recorded.",
    participation: "Participation",
    submitted: "Evaluations submitted",
    included: "Included in score",
    invited: "Participants",
    appendix: "Owner appendix",
    appendixSub: "Individual score per cupper and sample",
    cupper: "Cupper",
    mean: "Mean",
    sdShort: "SD",
    alignmentRank: "Alignment with the descriptor consensus",
    alignmentSub: (m, o) => `${m} of ${o}`,
    excluded: "excluded",
    bandLegend:
      "Green: within 1 SD of the group mean. Amber: 1 SD or more. Red: 2 SD or more (possible outlier). Excluded cuppers are not coloured.",
    teacherNotes: "Teacher notes",
    teacherSub: "Individual feedback",
    alignment: "Alignment with the group",
    community: "Group",
    score: "Score",
    delta: "Diff.",
    missed: "Consensus descriptors they did not mark",
    extra: "Own descriptors outside the consensus",
    none: "None",
    handwritten: "Handwritten notes",
    notEvaluated: "Not evaluated",
    stages: {
      fragancia: "Fragrance",
      aroma: "Aroma",
      sabor: "Flavor",
      sabor_residual: "Aftertaste",
      acidez: "Acidity",
      dulzor: "Sweetness",
      sensacion: "Mouthfeel",
    },
    axes: ["Fragrance", "Aroma", "Flavor", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel", "Overall"],
    attrNames: [
      "Fragrance",
      "Aroma",
      "Flavor",
      "Aftertaste",
      "Acidity",
      "Sweetness",
      "Mouthfeel",
      "Overall impression",
    ],
    blocks: {
      nariz: "Nose",
      boca: "Mouth",
      gusto: "Predominant taste",
      acidez: "Acidity",
      dulzura: "Sweetness",
      sensacion: "Mouthfeel",
    },
    extrinsicTitle: "Origin data",
    originFacts: {
      country: "Country",
      region: "Region",
      farm: "Farm",
      producer: "Producer",
      variety: "Variety",
      processType: "Process",
      altitude: "Altitude (m)",
    },
    fieldLabels: {
      País: "Country",
      Región: "Region",
      "Finca/Cooperativa": "Farm / cooperative",
      "Productor(es)": "Producer(s)",
      Especie: "Species",
      "Variedad(es)": "Variety",
      Cosecha: "Harvest",
      "Beneficiador(es)": "Processor(s)",
      Proceso: "Process",
      Clasificación: "Grade",
      Importador: "Importer",
      Exportador: "Exporter",
      "Precio al productor": "Producer price",
      "Tamaño del lote": "Lot size",
      Certificaciones: "Certifications",
      "Color del grano": "Bean colour",
      "Humedad (%)": "Moisture (%)",
      "Malla dominante": "Dominant screen",
      "Defectos Cat. 1": "Cat. 1 defects",
      "Defectos Cat. 2": "Cat. 2 defects",
    },
  },
};

export function tr(t: SectionCopy, label: string): string {
  return t.fieldLabels[label] ?? label;
}
