// Server-only. Renders the ANONYMOUS group-summary PDF emailed to every
// participant when a group session closes: a session header, then per sample the
// community score and the per-block statistical sentences from
// lib/resultsSummary. It contains ONLY aggregated data — no per-cupper names, no
// alignment ranking (owner-only in the app, never emailed).
//
// NEVER import this (or @react-pdf/renderer) from a client component. It is built
// server-side from lib/closeEmail.ts and the throwaway render script. Styling
// mirrors CvaFormDocument's paper-form austerity (built-in Helvetica handles
// Spanish accents — no font files).

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

Font.registerHyphenationCallback((word) => [word]);

const INK = "#111111";
const RULE = "#000000";
const SOFT = "#555555";
const HAIR = "#cfcfcf";
const CREAM = "#f4f0e8";

type Locale = "es" | "en";

const TEXT: Record<Locale, Record<string, string>> = {
  es: {
    spec: "SCA CVA · Resumen grupal",
    date: "Fecha",
    participants: "Participantes",
    samples: "Muestras",
    sample: "Muestra",
    coffee: "Café",
    communityScore: "Puntaje comunitario",
    evaluators: "Catadores",
    noScore: "Sin puntaje comunitario",
    noData: "Sin descriptores registrados para esta muestra.",
    intro:
      "Resumen estadístico anónimo de la sesión. Los datos son agregados: no incluyen nombres de catadores.",
    none: "—",
  },
  en: {
    spec: "SCA CVA · Group summary",
    date: "Date",
    participants: "Participants",
    samples: "Samples",
    sample: "Sample",
    coffee: "Coffee",
    communityScore: "Community score",
    evaluators: "Cuppers",
    noScore: "No community score",
    noData: "No descriptors recorded for this sample.",
    intro:
      "Anonymous statistical summary of the session. Figures are aggregated: no cupper names are included.",
    none: "—",
  },
};

const s = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 32,
    paddingHorizontal: 34,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: INK,
    lineHeight: 1.35,
  },
  headerBox: { borderBottom: `2pt solid ${RULE}`, paddingBottom: 7, marginBottom: 8 },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  spec: { fontSize: 7, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", color: INK },
  metaRow: { flexDirection: "row", marginTop: 6, gap: 14 },
  metaCell: {},
  metaLabel: { fontSize: 6.5, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 1 },
  intro: { fontSize: 7.5, color: SOFT, fontStyle: "italic", marginBottom: 10 },

  sampleBlock: { border: `0.75pt solid ${RULE}`, marginBottom: 9 },
  sampleHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: CREAM,
    borderBottom: `0.5pt solid ${RULE}`,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  sampleLabelWrap: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  sampleTag: { fontSize: 6.5, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  sampleLabel: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  coffeeName: { fontSize: 9, color: SOFT },
  scoreWrap: { alignItems: "flex-end" },
  scoreLabel: { fontSize: 5.5, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  scoreValue: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  scoreMeta: { fontSize: 6, color: SOFT },
  noScore: { fontSize: 8, color: SOFT, fontStyle: "italic" },

  body: { paddingVertical: 6, paddingHorizontal: 8 },
  sentenceRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3.5, gap: 5 },
  blockDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: INK, marginTop: 3 },
  sentence: { fontSize: 8.5, flexGrow: 1, flexBasis: 0 },
  empty: { fontSize: 8, color: SOFT, fontStyle: "italic" },

  footer: {
    position: "absolute",
    bottom: 16,
    left: 34,
    right: 34,
    fontSize: 6.5,
    color: HAIR,
    textAlign: "center",
  },
});

/** One sample's anonymous summary: score + ordered block sentences. */
export type GroupSummarySample = {
  label: string;
  /** Revealed coffee name, or null when still blind. */
  coffeeName: string | null;
  /** Community score (0–100) or null when none could be computed. */
  communityScore: number | null;
  /** How many cuppers contributed to the descriptor blocks. */
  evaluators: number;
  /** Ordered block sentences; null text → block had no data (skipped). */
  sentences: { blockId: string; text: string | null }[];
};

export type GroupSummaryProps = {
  sessionName: string;
  date: string;
  participantCount: number;
  locale: Locale;
  samples: GroupSummarySample[];
};

function SampleCard({
  sample,
  t,
}: {
  sample: GroupSummarySample;
  t: Record<string, string>;
}) {
  const withText = sample.sentences.filter((s) => s.text);
  return (
    <View style={s.sampleBlock} wrap={false}>
      <View style={s.sampleHead}>
        <View style={s.sampleLabelWrap}>
          <Text style={s.sampleTag}>{t.sample}</Text>
          <Text style={s.sampleLabel}>{sample.label}</Text>
          {sample.coffeeName ? (
            <Text style={s.coffeeName}>· {sample.coffeeName}</Text>
          ) : null}
        </View>
        <View style={s.scoreWrap}>
          {sample.communityScore !== null ? (
            <>
              <Text style={s.scoreLabel}>{t.communityScore}</Text>
              <Text style={s.scoreValue}>{sample.communityScore.toFixed(2)}</Text>
              <Text style={s.scoreMeta}>
                {sample.evaluators} {t.evaluators.toLowerCase()}
              </Text>
            </>
          ) : (
            <Text style={s.noScore}>{t.noScore}</Text>
          )}
        </View>
      </View>
      <View style={s.body}>
        {withText.length > 0 ? (
          withText.map((sent) => (
            <View key={sent.blockId} style={s.sentenceRow}>
              <View style={s.blockDot} />
              <Text style={s.sentence}>{sent.text}</Text>
            </View>
          ))
        ) : (
          <Text style={s.empty}>{t.noData}</Text>
        )}
      </View>
    </View>
  );
}

export function GroupSummaryDocument(props: GroupSummaryProps) {
  const t = TEXT[props.locale];
  return (
    <Document title={`${t.spec} · ${props.sessionName}`} author="Cata Café">
      <Page size="A4" style={s.page}>
        <View style={s.headerBox}>
          <View style={s.headerTopRow}>
            <View>
              <Text style={s.spec}>{t.spec}</Text>
              <Text style={s.title}>{props.sessionName}</Text>
            </View>
          </View>
          <View style={s.metaRow}>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>{t.date}</Text>
              <Text style={s.metaValue}>{props.date || t.none}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>{t.participants}</Text>
              <Text style={s.metaValue}>{String(props.participantCount)}</Text>
            </View>
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>{t.samples}</Text>
              <Text style={s.metaValue}>{String(props.samples.length)}</Text>
            </View>
          </View>
        </View>

        <Text style={s.intro}>{t.intro}</Text>

        {props.samples.map((sample, i) => (
          <SampleCard key={i} sample={sample} t={t} />
        ))}

        <Text style={s.footer} fixed>
          Cata Café · {t.spec}
        </Text>
      </Page>
    </Document>
  );
}
