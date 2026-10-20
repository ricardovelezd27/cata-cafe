// Server-only. Coffee-scoped "Ficha tecnica": identity + origin data from the
// Coffee columns, plus (only when the route allows it) the cross-session
// community results from computeCoffeeAggregate. Never carries per-cupper data.
//
// NEVER import this (or @react-pdf/renderer) from a client component.

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { scoreBand } from "../scoring";
import type { FichaAffective, FichaIdentity } from "../reports/fichaTecnica";
import { registerPdfFonts, SANS } from "./fonts";
import { CVA_TEXT } from "./cvaFormData";
import { PdfScoreBand } from "./charts";
import { sanitizePdfText } from "./text";
import { IdentityBlock } from "./sections/IdentityBlock";
import { ExtrinsicBlock } from "./sections/ExtrinsicBlock";
import { AffectiveBlock } from "./sections/AffectiveBlock";
import { BlockTitle, C, PAGE_PAD, st, type Locale } from "./sections/shared";

registerPdfFonts();

export type CoffeeFichaModel = {
  identity: FichaIdentity;
  /** ext_* shaped record built from the Coffee columns (species, harvest, certifications). */
  extrinsic: Record<string, unknown>;
  notes: string | null;
  /** Null when the viewer may not see the community results. */
  results: null | {
    sessionsCount: number;
    evaluationsCount: number;
    affective: FichaAffective;
    sessions: { name: string; date: Date; score: number | null }[];
  };
};

const TEXT = {
  es: {
    spec: "SCA CVA · Ficha técnica del café",
    coffee: "Café",
    notes: "Notas",
    results: "Resultados de la comunidad",
    sessionsLine: (s: number, e: number) =>
      `${s} ${s === 1 ? "sesión" : "sesiones"} · ${e} ${e === 1 ? "evaluación" : "evaluaciones"}`,
    sessionsTable: "Sesiones",
    sessionName: "Sesión",
    sessionDate: "Fecha",
    sessionScore: "Puntaje",
    noResults: "Aún no hay resultados de catación para este café.",
    page: (n: number, total: number) => `Página ${n} de ${total}`,
    locale: "es-CO",
  },
  en: {
    spec: "SCA CVA · Coffee technical sheet",
    coffee: "Coffee",
    notes: "Notes",
    results: "Community results",
    sessionsLine: (s: number, e: number) =>
      `${s} ${s === 1 ? "session" : "sessions"} · ${e} ${e === 1 ? "evaluation" : "evaluations"}`,
    sessionsTable: "Sessions",
    sessionName: "Session",
    sessionDate: "Date",
    sessionScore: "Score",
    noResults: "No cupping results for this coffee yet.",
    page: (n: number, total: number) => `Page ${n} of ${total}`,
    locale: "en-US",
  },
} as const;

const s = StyleSheet.create({
  page: {
    paddingTop: PAGE_PAD,
    paddingBottom: 70,
    paddingHorizontal: PAGE_PAD,
    fontFamily: SANS,
    fontSize: 9,
    color: C.ink,
  },
  spec: { fontSize: 7, letterSpacing: 1.2, color: C.soft, textTransform: "uppercase", marginBottom: 8 },
  top: { borderTop: `1.5pt solid ${C.ink}`, paddingTop: 10 },
  footer: {
    position: "absolute",
    bottom: 22,
    height: 40,
    flexDirection: "row",
    alignItems: "flex-start",
    left: PAGE_PAD,
    right: PAGE_PAD,
    borderTop: `0.5pt solid ${C.hair}`,
    paddingTop: 5,
  },
  footText: { fontSize: 6.5, color: C.soft, lineHeight: 1.35 },
});

export function CoffeeFichaDocument({ model, locale }: { model: CoffeeFichaModel; locale: Locale }) {
  const t = TEXT[locale];
  const name = sanitizePdfText(model.identity.label);
  const { results } = model;

  return (
    <Document title={`${t.spec} · ${name}`} author="Cata Café">
      <Page size="A4" style={s.page}>
        <Text style={s.spec}>{t.spec}</Text>
        <View style={s.top}>
          <View wrap={false}>
            <IdentityBlock identity={model.identity} locale={locale} tag={t.coffee} showBlindNote={false} />
          </View>
          {Object.keys(model.extrinsic).length > 0 ? (
            <View wrap={false}>
              <ExtrinsicBlock extrinsic={model.extrinsic} locale={locale} />
            </View>
          ) : null}
          {model.notes ? (
            <View style={st.sep} wrap={false}>
              <BlockTitle>{t.notes}</BlockTitle>
              <Text style={{ fontSize: 9, lineHeight: 1.4 }}>{sanitizePdfText(model.notes)}</Text>
            </View>
          ) : null}

          {results ? (
            <>
              <View style={st.sep}>
                <BlockTitle>{t.results}</BlockTitle>
                <Text style={st.small}>
                  {t.sessionsLine(results.sessionsCount, results.evaluationsCount)}
                </Text>
              </View>
              {results.sessionsCount === 0 ? (
                <Text style={st.muted}>{t.noResults}</Text>
              ) : (
                <>
                  <View wrap={false}>
                    <AffectiveBlock
                      affective={results.affective}
                      locale={locale}
                      showPenalties={false}
                      showIncluded={false}
                    />
                  </View>
                  {results.sessions.length > 0 ? (
                    <View style={st.sep}>
                      <BlockTitle>{t.sessionsTable}</BlockTitle>
                      <View style={st.row}>
                        <Text style={[st.th, { flexGrow: 1, flexBasis: 0 }]}>{t.sessionName}</Text>
                        <Text style={[st.th, { width: 110 }]}>{t.sessionDate}</Text>
                        <Text style={[st.th, { width: 60, textAlign: "right" }]}>{t.sessionScore}</Text>
                      </View>
                      {results.sessions.map((r, i) => (
                        <View key={i} style={[st.row, { paddingVertical: 4 }]} wrap={false}>
                          <Text style={[st.body, { flexGrow: 1, flexBasis: 0, paddingRight: 6 }]}>
                            {sanitizePdfText(r.name)}
                          </Text>
                          <Text style={[st.body, { width: 110 }]}>
                            {r.date.toLocaleDateString(t.locale, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </Text>
                          <View style={{ width: 60, alignItems: "flex-end" }}>
                            {r.score !== null ? (
                              <PdfScoreBand score={r.score} band={scoreBand(r.score)} />
                            ) : (
                              <Text style={st.small}>—</Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
            <Text style={s.footText}>{CVA_TEXT[locale].attribution}</Text>
          </View>
          <Text
            style={{ fontSize: 6.5, color: C.soft }}
            render={({ pageNumber, totalPages }) => t.page(pageNumber, totalPages)}
          />
        </View>
      </Page>
    </Document>
  );
}
