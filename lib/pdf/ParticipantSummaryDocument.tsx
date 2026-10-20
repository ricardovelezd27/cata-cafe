// Server-only. Renders the free "Resumen del participante" PDF: ONE cupper's
// numbers against the ANONYMOUS group (see lib/reports/participantSummary.ts for
// the anonymity invariant). Pure presentation: the model is built and gated by
// the route (app/api/sessions/[id]/participant-summary/route.ts).
//
// NEVER import this (or @react-pdf/renderer) from a client component.

import type { ReactNode } from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { registerPdfFonts, SANS, SERIF } from "./fonts";
import { PDF_PALETTE } from "./palette";
import { PdfRadar, PdfPercentBars, PdfScoreBand, PdfDeltaChip } from "./charts";
import { sanitizePdfText } from "./text";
import { CVA_TEXT } from "./cvaFormData";
import { scoreBand } from "../scoring";
import type {
  ParticipantSummaryModel,
  ParticipantSummarySample,
} from "../reports/participantSummary";

registerPdfFonts();

type Locale = "es" | "en";

type Copy = {
  spec: string;
  date: string;
  cupper: string;
  format: string;
  cups: string;
  participants: string;
  reference: string;
  yourNumbers: string;
  myAvg: string;
  communityAvg: string;
  delta: string;
  alignment: string;
  alignmentSub: (m: number, o: number) => string;
  evaluated: (x: number, n: number) => string;
  sample: string;
  referenceNote: string;
  mine: string;
  community: string;
  sd: string;
  vsRef: string;
  notEvaluated: string;
  descriptors: string;
  you: string;
  notes: string;
  formats: Record<string, string>;
  stages: Record<string, string>;
  axes: string[];
  scoreFormula: string;
  page: (n: number, total: number) => string;
};

const TEXT: Record<Locale, Copy> = {
  es: {
    spec: "SCA CVA · Resumen del participante",
    date: "Fecha",
    cupper: "Catador",
    format: "Formato",
    cups: "Tazas por muestra",
    participants: "Participantes",
    reference: "Referencia",
    yourNumbers: "Tus números",
    myAvg: "Tu promedio",
    communityAvg: "Promedio del grupo",
    delta: "Diferencia",
    alignment: "Tu alineación",
    alignmentSub: (m, o) => `${m} de ${o} descriptores`,
    evaluated: (x, n) => `Evaluaste ${x} de ${n} muestras`,
    sample: "Muestra",
    referenceNote: "Referencia · ancla 79.00",
    mine: "Tú",
    community: "Grupo",
    sd: "desv.",
    vsRef: "vs. referencia",
    notEvaluated: "Sin evaluación tuya para esta muestra.",
    descriptors: "Descriptores más frecuentes",
    you: "tú",
    notes: "Tus notas",
    formats: {
      descriptive: "Descriptivo",
      affective: "Afectivo",
      combined: "Combinado",
    },
    stages: {
      fragancia: "Fragancia",
      aroma: "Aroma",
      sabor: "Sabor",
      sabor_residual: "Sabor residual",
      acidez: "Acidez",
      dulzor: "Dulzor",
      sensacion: "Sensación en boca",
    },
    axes: [
      "Fragancia",
      "Aroma",
      "Sabor",
      "Sabor residual",
      "Acidez",
      "Dulzor",
      "Boca",
      "Global",
    ],
    scoreFormula:
      "Puntaje individual = 0,65625 × Suma h + 52,75 − 2u − 4d (h: ocho atributos de 1 a 9; u: tazas no uniformes; d: tazas defectuosas).",
    page: (n, total) => `Página ${n} de ${total}`,
  },
  en: {
    spec: "SCA CVA · Participant summary",
    date: "Date",
    cupper: "Cupper",
    format: "Format",
    cups: "Cups per sample",
    participants: "Participants",
    reference: "Reference",
    yourNumbers: "Your numbers",
    myAvg: "Your average",
    communityAvg: "Group average",
    delta: "Difference",
    alignment: "Your alignment",
    alignmentSub: (m, o) => `${m} of ${o} descriptors`,
    evaluated: (x, n) => `You evaluated ${x} of ${n} samples`,
    sample: "Sample",
    referenceNote: "Reference · 79.00 anchor",
    mine: "You",
    community: "Group",
    sd: "SD",
    vsRef: "vs. reference",
    notEvaluated: "No evaluation from you for this sample.",
    descriptors: "Most frequent descriptors",
    you: "you",
    notes: "Your notes",
    formats: {
      descriptive: "Descriptive",
      affective: "Affective",
      combined: "Combined",
    },
    stages: {
      fragancia: "Fragrance",
      aroma: "Aroma",
      sabor: "Flavor",
      sabor_residual: "Aftertaste",
      acidez: "Acidity",
      dulzor: "Sweetness",
      sensacion: "Mouthfeel",
    },
    axes: [
      "Fragrance",
      "Aroma",
      "Flavor",
      "Aftertaste",
      "Acidity",
      "Sweetness",
      "Mouthfeel",
      "Overall",
    ],
    scoreFormula:
      "Individual score = 0.65625 × Sum h + 52.75 − 2u − 4d (h: eight attributes rated 1 to 9; u: non-uniform cups; d: defective cups).",
    page: (n, total) => `Page ${n} of ${total}`,
  },
};

const { ink: INK, soft: SOFT, hair: HAIR, paper: PAPER } = PDF_PALETTE;
const PAGE_PAD = 36;
const CONTENT_W = 595.28 - PAGE_PAD * 2;
const CARD_PAD = 12;
const RADAR_SIZE = 200;
const RADAR_CROP = 38;
const BARS_W = CONTENT_W - CARD_PAD * 2 - 2 - RADAR_SIZE - 10;

const s = StyleSheet.create({
  page: {
    paddingTop: PAGE_PAD,
    paddingBottom: 70,
    paddingHorizontal: PAGE_PAD,
    fontFamily: SANS,
    fontSize: 9,
    color: INK,
  },
  spec: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: SOFT,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: SERIF,
    fontWeight: 700,
    fontSize: 24,
    marginTop: 3,
    lineHeight: 1.1,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 18 },
  metaLabel: {
    fontSize: 6.5,
    letterSpacing: 1,
    color: SOFT,
    textTransform: "uppercase",
  },
  metaValue: { fontSize: 9.5, fontWeight: 700, marginTop: 1 },
  rule: {
    borderBottom: `0.75pt solid ${INK}`,
    marginTop: 12,
    marginBottom: 14,
  },

  sectionLabel: {
    fontSize: 7,
    letterSpacing: 1.2,
    color: SOFT,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  kpi: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: PAPER,
  },
  kpiLabel: {
    fontSize: 6.5,
    letterSpacing: 0.8,
    color: SOFT,
    textTransform: "uppercase",
  },
  kpiValue: {
    fontFamily: SERIF,
    fontWeight: 700,
    fontSize: 26,
    marginTop: 2,
    lineHeight: 1.05,
  },
  kpiSub: { fontSize: 7, color: SOFT, marginTop: 2 },
  evaluated: { fontSize: 8, color: SOFT, marginBottom: 14 },

  card: { border: `0.75pt solid ${HAIR}`, marginBottom: 10, padding: CARD_PAD },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  tag: {
    fontSize: 6.5,
    letterSpacing: 1,
    color: SOFT,
    textTransform: "uppercase",
  },
  cardLabel: {
    fontFamily: SERIF,
    fontWeight: 700,
    fontSize: 18,
    lineHeight: 1.1,
  },
  coffee: { fontSize: 9, color: SOFT, marginTop: 1 },
  refNote: {
    marginTop: 3,
    fontSize: 7,
    letterSpacing: 0.6,
    color: PDF_PALETTE.reference,
    textTransform: "uppercase",
  },
  scores: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  scoreCol: { alignItems: "flex-start" },
  scoreCap: {
    fontSize: 6.5,
    letterSpacing: 0.8,
    color: SOFT,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  communityNum: {
    fontFamily: SERIF,
    fontWeight: 700,
    fontSize: 18,
    lineHeight: 1.1,
  },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  chipCap: { fontSize: 6.5, color: SOFT },
  sdChip: {
    borderWidth: 0.75,
    borderColor: PDF_PALETTE.band.neutral,
    borderRadius: 4,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
  },
  sdText: { fontSize: 8, fontWeight: 700, color: PDF_PALETTE.band.neutral },
  legend: { flexDirection: "row", gap: 12, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendSwatch: { width: 7, height: 7 },
  muted: { fontSize: 8.5, color: SOFT, fontStyle: "italic" },

  bodyRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
    alignItems: "flex-start",
  },
  rightCol: { flexGrow: 1, flexBasis: 0 },
  consensus: {
    lineHeight: 1.35,
    fontSize: 8.5,
    fontStyle: "italic",
    color: INK,
    marginTop: 6,
  },
  notesWrap: { marginTop: 8 },
  noteLine: {
    lineHeight: 1.35,
    fontSize: 7.5,
    color: SOFT,
    marginTop: 1.5,
  },
  noteStage: { fontWeight: 700, color: INK },

  footer: {
    position: "absolute",
    bottom: 22,
    height: 40,
    flexDirection: "row",
    alignItems: "flex-start",
    left: PAGE_PAD,
    right: PAGE_PAD,
    borderTop: `0.5pt solid ${HAIR}`,
    paddingTop: 5,
  },
  footText: { fontSize: 6.5, color: SOFT, lineHeight: 1.35 },
  footPage: { fontSize: 6.5, color: SOFT },
});

function fmt(n: number | null): string {
  return n === null ? "—" : n.toFixed(2);
}

function formatDate(d: Date, locale: Locale): string {
  return d.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function Kpi({
  label,
  children,
  sub,
}: {
  label: string;
  children: ReactNode;
  sub?: string;
}) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      {children}
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

function SampleCard({
  sample,
  t,
  hasCommunity,
}: {
  sample: ParticipantSummarySample;
  t: Copy;
  hasCommunity: boolean;
}) {
  const radar = sample.radar;
  const series = radar
    ? [
        ...(radar.mine
          ? [{ values: radar.mine, color: PDF_PALETTE.mine, label: t.mine }]
          : []),
        ...(radar.community
          ? [
              {
                values: radar.community,
                color: PDF_PALETTE.community,
                label: t.community,
              },
            ]
          : []),
      ]
    : [];
  const rows = sample.topDescriptors.map((d) => ({
    label: sanitizePdfText(d.mine ? `${d.label} (${t.you})` : d.label),
    count: d.pct,
    total: 100,
    color: d.mine ? PDF_PALETTE.mine : PDF_PALETTE.grid,
  }));

  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardHead}>
        <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 8 }}>
          <Text style={s.tag}>{t.sample}</Text>
          <Text style={s.cardLabel}>{sanitizePdfText(sample.label)}</Text>
          {sample.coffee ? (
            <Text style={s.coffee}>{sanitizePdfText(sample.coffee)}</Text>
          ) : null}
          {sample.isReference ? (
            <Text style={s.refNote}>{t.referenceNote}</Text>
          ) : null}
        </View>
        {sample.myScore === null && sample.communityScore === null ? (
          <Text style={s.muted}>{t.notEvaluated}</Text>
        ) : (
          <View style={s.scores}>
            <View style={s.scoreCol}>
              <Text style={s.scoreCap}>{t.mine}</Text>
              {sample.myScore !== null ? (
                <PdfScoreBand
                  score={sample.myScore}
                  band={scoreBand(sample.myScore)}
                  size="lg"
                />
              ) : (
                <Text style={s.communityNum}>—</Text>
              )}
              {sample.deltaVsRef !== null && !sample.isReference ? (
                <View style={s.chipRow}>
                  <PdfDeltaChip delta={sample.deltaVsRef} />
                  <Text style={s.chipCap}>{t.vsRef}</Text>
                </View>
              ) : null}
            </View>
            {hasCommunity ? (
              <View style={s.scoreCol}>
                <Text style={s.scoreCap}>{t.community}</Text>
                <Text style={s.communityNum}>{fmt(sample.communityScore)}</Text>
                {sample.sd !== null ? (
                  <View style={s.chipRow}>
                    <View style={s.sdChip}>
                      <Text style={s.sdText}>± {sample.sd.toFixed(1)}</Text>
                    </View>
                    <Text style={s.chipCap}>{t.sd}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>

      {series.length > 0 ||
      rows.length > 0 ||
      sample.consensus ||
      sample.myNotes.length > 0 ? (
        <View style={s.bodyRow}>
          {series.length > 0 ? (
            // PdfRadar reserves a 56pt label margin all round; crop the empty
            // top/bottom so the card hugs the polygon (side margins hold labels).
            <View
              style={{
                width: RADAR_SIZE,
                height: RADAR_SIZE - RADAR_CROP * 2,
                overflow: "hidden",
              }}
            >
              <View style={{ marginTop: -RADAR_CROP }}>
                <PdfRadar
                  axes={t.axes}
                  series={series.map((x) => ({ ...x, label: undefined }))}
                  size={RADAR_SIZE}
                />
              </View>
            </View>
          ) : null}
          <View style={s.rightCol}>
            {rows.length > 0 ? (
              <View>
                <Text style={s.sectionLabel}>{t.descriptors}</Text>
                <PdfPercentBars
                  rows={rows}
                  width={
                    series.length > 0 ? BARS_W : CONTENT_W - CARD_PAD * 2 - 2
                  }
                  maxRows={5}
                  valueFormat="percent"
                />
              </View>
            ) : null}
            {series.length > 0 ? (
              <View style={s.legend}>
                {series.map((x) => (
                  <View key={x.label} style={s.legendItem}>
                    <View
                      style={[s.legendSwatch, { backgroundColor: x.color }]}
                    />
                    <Text style={s.chipCap}>{x.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {sample.consensus ? (
              <Text style={s.consensus}>
                {sanitizePdfText(sample.consensus)}
              </Text>
            ) : null}
            {sample.myNotes.length > 0 ? (
              <View style={s.notesWrap}>
                <Text style={s.sectionLabel}>{t.notes}</Text>
                {sample.myNotes.map((n, i) => (
                  <Text key={i} style={s.noteLine}>
                    <Text style={s.noteStage}>
                      {t.stages[n.stage] ?? n.stage}:{" "}
                    </Text>
                    {sanitizePdfText(n.text)}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function ParticipantSummaryDocument({
  model,
  locale,
}: {
  model: ParticipantSummaryModel;
  locale: Locale;
}) {
  const t = TEXT[locale];
  const { header, kpis } = model;
  const hasCommunity =
    kpis.communityAvg !== null ||
    model.samples.some((x) => x.communityScore !== null);
  const sessionName = sanitizePdfText(header.sessionName);

  return (
    <Document title={`${t.spec} · ${sessionName}`} author="Cata Café">
      <Page size="A4" style={s.page}>
        <Text style={s.spec}>{t.spec}</Text>
        <Text style={s.title}>{sessionName}</Text>
        <View style={s.metaRow}>
          <Meta label={t.date} value={formatDate(header.date, locale)} />
          {header.cupperName ? (
            <Meta label={t.cupper} value={sanitizePdfText(header.cupperName)} />
          ) : null}
          <Meta
            label={t.format}
            value={t.formats[header.format] ?? header.format}
          />
          <Meta label={t.cups} value={String(header.cupsPerSample)} />
          {header.participants > 1 ? (
            <Meta label={t.participants} value={String(header.participants)} />
          ) : null}
          {header.referenceLabel ? (
            <Meta
              label={t.reference}
              value={sanitizePdfText(header.referenceLabel)}
            />
          ) : null}
        </View>
        <View style={s.rule} />

        <Text style={s.sectionLabel}>{t.yourNumbers}</Text>
        <View style={s.kpiRow}>
          <Kpi label={t.myAvg}>
            <Text style={s.kpiValue}>{fmt(kpis.myAvg)}</Text>
          </Kpi>
          {hasCommunity ? (
            <Kpi label={t.communityAvg}>
              <Text style={s.kpiValue}>{fmt(kpis.communityAvg)}</Text>
            </Kpi>
          ) : null}
          {kpis.delta !== null ? (
            <Kpi label={t.delta}>
              <View style={{ marginTop: 8 }}>
                <PdfDeltaChip delta={kpis.delta} />
              </View>
            </Kpi>
          ) : null}
          {kpis.myAlignment ? (
            <Kpi
              label={t.alignment}
              sub={t.alignmentSub(
                kpis.myAlignment.matches,
                kpis.myAlignment.opportunities,
              )}
            >
              <Text style={s.kpiValue}>
                {Math.round(kpis.myAlignment.alignment * 100)}%
              </Text>
            </Kpi>
          ) : null}
        </View>
        <Text style={s.evaluated}>
          {t.evaluated(kpis.evaluated, kpis.total)}
        </Text>

        {model.samples.map((sample, i) => (
          <SampleCard
            key={i}
            sample={sample}
            t={t}
            hasCommunity={hasCommunity}
          />
        ))}

        <View style={s.footer} fixed>
          <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
            <Text style={s.footText}>{t.scoreFormula}</Text>
            <Text style={s.footText}>{CVA_TEXT[locale].attribution}</Text>
          </View>
          <Text
            style={s.footPage}
            render={({ pageNumber, totalPages }) =>
              t.page(pageNumber, totalPages)
            }
          />
        </View>
      </Page>
    </Document>
  );
}
