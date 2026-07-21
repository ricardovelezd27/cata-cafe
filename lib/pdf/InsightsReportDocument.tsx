// Server-only. Renders the platform-wide "insights" PDF report: KPI grid,
// optional AI narrative, monthly trend, top-origin/process/score-distribution/
// descriptor bar lists, and an optional CQI benchmark comparison. Consumed
// only by the GET route (app/api/insights/report/route.ts). Does NOT use
// next-intl — the admin-only insights area has no locale-routed page for this
// report, so all strings live in the bilingual REPORT_TEXT record below
// (pattern: EMAIL_TEXT in lib/closeEmail.ts). Styling mirrors
// GroupSummaryDocument/CvaFormDocument's paper-form austerity (built-in
// Helvetica handles Spanish accents — no font files).
//
// NEVER import this (or @react-pdf/renderer) from a client component.

import type { ReactNode } from "react";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import type { DashboardData } from "@/lib/analytics/queries";
import type { InsightRow } from "@/lib/analytics/types";
import type { NarrativeContent } from "@/lib/ai/narratives";
import type { BenchmarkComparison } from "@/lib/analytics/benchmarks";
import { PdfBarList, PdfTrendLine } from "./charts";

Font.registerHyphenationCallback((word) => [word]);

// ─── Palette — matches GroupSummaryDocument/CvaFormDocument ────────────────
const INK = "#111111";
const RULE = "#000000";
const SOFT = "#555555";
const HAIR = "#cfcfcf";
const CREAM = "#f4f0e8";
const GREEN = "#3D5A3E";

type Locale = "es" | "en";

// ─── Geometry ────────────────────────────────────────────────────────────────
const PAGE_PADDING_X = 34;
const PAGE_WIDTH_A4 = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH_A4 - PAGE_PADDING_X * 2;
const COL_GAP = 14;
const COL_WIDTH = (CONTENT_WIDTH - COL_GAP) / 2;
const TREND_HEIGHT = 92;

// ─── Bilingual copy (no next-intl in this server-only PDF module) ─────────
interface ReportText {
  title: string;
  wordmark: string;
  generatedLabel: string;
  summary: string;
  trendHeading: string;
  trendSeriesLabel: string;
  topOrigins: string;
  processes: string;
  scoreDistribution: string;
  topDescriptors: string;
  benchmarkTitle: string;
  benchmarkMine: (n: number, avg: string) => string;
  benchmarkCqi: (n: number, avg: string, p25: string, p75: string) => string;
  benchmarkCaveat: string;
  aiDisclaimer: string;
  kpi: {
    coffeesRegistered: string;
    coffeesCupped: string;
    sessions: string;
    evaluations: string;
    activeCuppers: string;
    totalUsers: string;
    avgIndividual: string;
    avgCommunity: string;
  };
  none: string;
  emptyChart: string;
}

const REPORT_TEXT: Record<Locale, ReportText> = {
  es: {
    title: "Informe de insights",
    wordmark: "Cata Café",
    generatedLabel: "Generado",
    summary: "Resumen",
    trendHeading: "Tendencia mensual",
    trendSeriesLabel: "Evaluaciones",
    topOrigins: "Principales orígenes",
    processes: "Procesos",
    scoreDistribution: "Distribución de puntajes",
    topDescriptors: "Descriptores más frecuentes",
    benchmarkTitle: "Benchmark CQI",
    benchmarkMine: (n, avg) => `Nuestro promedio: ${avg} (n=${n})`,
    benchmarkCqi: (n, avg, p25, p75) =>
      `Promedio CQI: ${avg} (n=${n}, P25–P75: ${p25}–${p75})`,
    benchmarkCaveat: "Comparación orientativa: metodologías distintas (CVA vs. SCA).",
    aiDisclaimer: "Narrativa generada con IA — puede contener errores.",
    kpi: {
      coffeesRegistered: "Cafés registrados",
      coffeesCupped: "Cafés catados",
      sessions: "Sesiones",
      evaluations: "Evaluaciones",
      activeCuppers: "Catadores activos (30d)",
      totalUsers: "Usuarios totales",
      avgIndividual: "Puntaje individual prom.",
      avgCommunity: "Puntaje comunitario prom.",
    },
    none: "—",
    emptyChart: "Sin datos todavía",
  },
  en: {
    title: "Insights report",
    wordmark: "Cata Café",
    generatedLabel: "Generated",
    summary: "Summary",
    trendHeading: "Monthly trend",
    trendSeriesLabel: "Evaluations",
    topOrigins: "Top origins",
    processes: "Processes",
    scoreDistribution: "Score distribution",
    topDescriptors: "Top descriptors",
    benchmarkTitle: "CQI benchmark",
    benchmarkMine: (n, avg) => `Our average: ${avg} (n=${n})`,
    benchmarkCqi: (n, avg, p25, p75) => `CQI average: ${avg} (n=${n}, P25–P75: ${p25}–${p75})`,
    benchmarkCaveat: "Directional comparison: different methodologies (CVA vs. SCA).",
    aiDisclaimer: "AI-generated narrative — may contain errors.",
    kpi: {
      coffeesRegistered: "Coffees registered",
      coffeesCupped: "Coffees cupped",
      sessions: "Sessions",
      evaluations: "Evaluations",
      activeCuppers: "Active cuppers (30d)",
      totalUsers: "Total users",
      avgIndividual: "Avg. individual score",
      avgCommunity: "Avg. community score",
    },
    none: "—",
    emptyChart: "No data yet",
  },
};

const s = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 34,
    paddingHorizontal: PAGE_PADDING_X,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: INK,
    lineHeight: 1.35,
  },

  headerBox: { borderBottom: `2pt solid ${RULE}`, paddingBottom: 7, marginBottom: 10 },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  spec: { fontSize: 7, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold", color: INK },
  wordmark: { fontSize: 10, fontFamily: "Helvetica-Bold", color: GREEN },
  metaRow: { flexDirection: "row", marginTop: 5, gap: 14 },
  metaLabel: { fontSize: 6.5, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  metaValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 1 },

  sectionHead: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 5,
  },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTop: `0.5pt solid ${HAIR}`,
    marginBottom: 10,
  },
  kpiCell: {
    width: "25%",
    paddingVertical: 7,
    paddingRight: 8,
    borderBottom: `0.5pt solid ${HAIR}`,
  },
  kpiLabel: { fontSize: 6, letterSpacing: 0.4, color: SOFT, textTransform: "uppercase" },
  kpiValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: INK, marginTop: 2 },

  section: { marginBottom: 10 },

  narrativeBox: {
    border: `0.75pt solid ${RULE}`,
    backgroundColor: CREAM,
    padding: 8,
    marginBottom: 10,
  },
  narrativeHeadline: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  narrativeBody: { fontSize: 8.5, color: INK, marginBottom: 3 },
  highlightRow: { flexDirection: "row", alignItems: "flex-start", gap: 5, marginBottom: 2.5 },
  highlightDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: GREEN, marginTop: 3.5 },
  highlightText: { fontSize: 8, flexGrow: 1, flexBasis: 0 },
  aiDisclaimer: { fontSize: 6, color: SOFT, fontStyle: "italic", marginTop: 4 },

  twoColRow: { flexDirection: "row", gap: COL_GAP, marginBottom: 10 },
  col: { width: COL_WIDTH },
  emptyNote: { fontSize: 7.5, color: SOFT, fontStyle: "italic" },

  benchmarkBox: { border: `0.5pt solid ${HAIR}`, padding: 8, marginBottom: 8 },
  benchmarkLine: { fontSize: 8.5, marginBottom: 2 },
  benchmarkCaveat: { fontSize: 7, color: SOFT, fontStyle: "italic", marginTop: 2 },

  footer: { position: "absolute", bottom: 16, left: PAGE_PADDING_X, right: PAGE_PADDING_X },
  footerCitation: { fontSize: 6, color: SOFT, textAlign: "center" },
  footerPage: { fontSize: 6.5, color: HAIR, textAlign: "center", marginTop: 3 },
});

export type InsightsReportProps = {
  locale: Locale;
  generatedAt: string;
  data: DashboardData;
  narrative: NarrativeContent | null;
  benchmark: BenchmarkComparison | null;
  citations: string[];
};

function fmtScore(value: number | null, none: string): string {
  return value == null ? none : value.toFixed(2);
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kpiCell}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.section} wrap={false}>
      <Text style={s.sectionHead}>{title}</Text>
      {children}
    </View>
  );
}

function ColumnChart({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: InsightRow[];
  emptyLabel: string;
}) {
  return (
    <View style={s.col} wrap={false}>
      <Text style={s.sectionHead}>{title}</Text>
      {rows.length > 0 ? (
        <PdfBarList rows={rows} width={COL_WIDTH} maxRows={8} />
      ) : (
        <Text style={s.emptyNote}>{emptyLabel}</Text>
      )}
    </View>
  );
}

export function InsightsReportDocument(props: InsightsReportProps) {
  const t = REPORT_TEXT[props.locale];
  const { data, narrative, benchmark, citations } = props;

  // AI narrative body: split into paragraphs defensively — the provider
  // returns a single string, occasionally with blank-line separators.
  const bodyParagraphs = narrative
    ? narrative.body.split(/\n+/).map((p) => p.trim()).filter(Boolean)
    : [];

  const trendPoints = data.monthlyTrend.map((m) => ({ label: m.label, value: m.evaluations }));

  const showBenchmark = !!benchmark && benchmark.benchmark.n > 0;

  return (
    <Document title={`${t.title} · ${t.wordmark}`} author={t.wordmark}>
      <Page size="A4" style={s.page} wrap>
        <View style={s.headerBox}>
          <View style={s.headerTopRow}>
            <View>
              <Text style={s.spec}>{t.wordmark}</Text>
              <Text style={s.title}>{t.title}</Text>
            </View>
            <Text style={s.wordmark}>{t.wordmark}</Text>
          </View>
          <View style={s.metaRow}>
            <View>
              <Text style={s.metaLabel}>{t.generatedLabel}</Text>
              <Text style={s.metaValue}>{props.generatedAt || t.none}</Text>
            </View>
          </View>
        </View>

        <View style={s.kpiGrid}>
          <KpiCell label={t.kpi.coffeesRegistered} value={String(data.coffeesRegistered)} />
          <KpiCell label={t.kpi.coffeesCupped} value={String(data.coffeesCupped)} />
          <KpiCell label={t.kpi.sessions} value={String(data.sessionsTotal)} />
          <KpiCell label={t.kpi.evaluations} value={String(data.evaluationsSubmitted)} />
          <KpiCell label={t.kpi.activeCuppers} value={String(data.activeCuppers30d)} />
          <KpiCell label={t.kpi.totalUsers} value={String(data.totalUsers)} />
          <KpiCell label={t.kpi.avgIndividual} value={fmtScore(data.avgIndividualScore, t.none)} />
          <KpiCell label={t.kpi.avgCommunity} value={fmtScore(data.avgCommunityScore, t.none)} />
        </View>

        {narrative ? (
          <View style={s.narrativeBox} wrap={false}>
            <Text style={s.narrativeHeadline}>{narrative.headline}</Text>
            {bodyParagraphs.map((p, i) => (
              <Text key={i} style={s.narrativeBody}>
                {p}
              </Text>
            ))}
            {narrative.highlights.map((h, i) => (
              <View key={i} style={s.highlightRow}>
                <View style={s.highlightDot} />
                <Text style={s.highlightText}>{h}</Text>
              </View>
            ))}
            <Text style={s.aiDisclaimer}>{t.aiDisclaimer}</Text>
          </View>
        ) : null}

        <Section title={t.trendHeading}>
          <PdfTrendLine
            points={trendPoints}
            width={CONTENT_WIDTH}
            height={TREND_HEIGHT}
            label={t.trendSeriesLabel}
          />
        </Section>

        <View style={s.twoColRow}>
          <ColumnChart title={t.topOrigins} rows={data.topOrigins} emptyLabel={t.emptyChart} />
          <ColumnChart title={t.processes} rows={data.topProcesses} emptyLabel={t.emptyChart} />
        </View>

        <View style={s.twoColRow}>
          <ColumnChart
            title={t.scoreDistribution}
            rows={data.scoreDistribution}
            emptyLabel={t.emptyChart}
          />
          <ColumnChart
            title={t.topDescriptors}
            rows={data.topDescriptors}
            emptyLabel={t.emptyChart}
          />
        </View>

        {showBenchmark && benchmark ? (
          <View style={s.benchmarkBox} wrap={false}>
            <Text style={s.sectionHead}>{t.benchmarkTitle}</Text>
            <Text style={s.benchmarkLine}>
              {t.benchmarkMine(benchmark.mine.n, fmtScore(benchmark.mine.avg, t.none))}
            </Text>
            <Text style={s.benchmarkLine}>
              {t.benchmarkCqi(
                benchmark.benchmark.n,
                fmtScore(benchmark.benchmark.avg, t.none),
                fmtScore(benchmark.benchmark.p25, t.none),
                fmtScore(benchmark.benchmark.p75, t.none),
              )}
            </Text>
            <Text style={s.benchmarkCaveat}>{t.benchmarkCaveat}</Text>
          </View>
        ) : null}

        <View style={s.footer} fixed>
          {citations.map((c, i) => (
            <Text key={i} style={s.footerCitation}>
              {c}
            </Text>
          ))}
          <Text
            style={s.footerPage}
            render={({ pageNumber, totalPages }) => `${t.wordmark} · ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
