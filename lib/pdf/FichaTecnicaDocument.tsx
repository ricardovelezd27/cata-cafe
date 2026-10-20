// Server-only. Renders the OWNER-tier "Ficha tecnica" PDF: one section per
// sample (identity, origin, green bean, affective, descriptive, participation),
// then the owner appendix and the teacher-notes pages (one per cupper) — both
// ONLY when model.tier === "owner". Pure presentation: the models are built and
// the viewer is authorised by app/api/sessions/[id]/ficha-tecnica/route.ts.
//
// Lesson from ParticipantSummaryDocument: never set lineHeight on a Page style
// (react-pdf then drops render() text such as the page counter).
//
// NEVER import this (or @react-pdf/renderer) from a client component.

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { scoreBand } from "../scoring";
import type { FichaTecnicaModel } from "../reports/fichaTecnica";
import type { TeacherCupperNotes } from "../reports/teacherNotes";
import { registerPdfFonts, SANS, SERIF } from "./fonts";
import { CVA_TEXT } from "./cvaFormData";
import { PdfScoreBand } from "./charts";
import { sanitizePdfText } from "./text";
import { IdentityBlock } from "./sections/IdentityBlock";
import { ExtrinsicBlock } from "./sections/ExtrinsicBlock";
import { GreenBlock } from "./sections/GreenBlock";
import { AffectiveBlock } from "./sections/AffectiveBlock";
import { DescriptiveBlock } from "./sections/DescriptiveBlock";
import { ParticipationBlock } from "./sections/ParticipationBlock";
import { OwnerAppendix } from "./sections/OwnerAppendix";
import { TeacherNotesPages } from "./sections/TeacherNotesPages";
import { C, PAGE_PAD, SECTION_TEXT, fmt, st, type Locale } from "./sections/shared";

registerPdfFonts();

type Copy = {
  spec: string;
  date: string;
  format: string;
  cups: string;
  participants: string;
  objective: string;
  overview: string;
  colSample: string;
  colCoffee: string;
  colScore: string;
  colIncluded: string;
  ownerOnly: string;
  formats: Record<string, string>;
  scoreFormula: string;
  page: (n: number, total: number) => string;
};

const TEXT: Record<Locale, Copy> = {
  es: {
    spec: "SCA CVA · Ficha técnica",
    date: "Fecha",
    format: "Formato",
    cups: "Tazas por muestra",
    participants: "Participantes",
    objective: "Objetivo",
    overview: "Resumen de la sesión",
    colSample: "Muestra",
    colCoffee: "Café",
    colScore: "Puntaje comunitario",
    colIncluded: "Incluidos",
    ownerOnly: "Documento del propietario · contiene datos individuales de catadores",
    formats: { descriptive: "Descriptivo", affective: "Afectivo", combined: "Combinado" },
    scoreFormula:
      "Puntaje individual = 0,65625 × Suma h + 52,75 − 2u − 4d (h: ocho atributos de 1 a 9; u: tazas no uniformes; d: tazas defectuosas).",
    page: (n, total) => `Página ${n} de ${total}`,
  },
  en: {
    spec: "SCA CVA · Technical sheet",
    date: "Date",
    format: "Format",
    cups: "Cups per sample",
    participants: "Participants",
    objective: "Objective",
    overview: "Session overview",
    colSample: "Sample",
    colCoffee: "Coffee",
    colScore: "Community score",
    colIncluded: "Included",
    ownerOnly: "Owner document · contains individual cupper data",
    formats: { descriptive: "Descriptive", affective: "Affective", combined: "Combined" },
    scoreFormula:
      "Individual score = 0.65625 × Sum h + 52.75 − 2u − 4d (h: eight attributes rated 1 to 9; u: non-uniform cups; d: defective cups).",
    page: (n, total) => `Page ${n} of ${total}`,
  },
};

const s = StyleSheet.create({
  page: {
    paddingTop: PAGE_PAD,
    paddingBottom: 70,
    paddingHorizontal: PAGE_PAD,
    fontFamily: SANS,
    fontSize: 9,
    color: C.ink,
  },
  spec: { fontSize: 7, letterSpacing: 1.2, color: C.soft, textTransform: "uppercase" },
  title: { fontFamily: SERIF, fontWeight: 700, fontSize: 24, marginTop: 3 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 18 },
  metaLabel: { fontSize: 6.5, letterSpacing: 1, color: C.soft, textTransform: "uppercase" },
  metaValue: { fontSize: 9.5, fontWeight: 700, marginTop: 1 },
  rule: { borderBottom: `0.75pt solid ${C.ink}`, marginTop: 12, marginBottom: 14 },
  sampleWrap: { marginBottom: 6 },
  sampleTop: { borderTop: `1.5pt solid ${C.ink}`, paddingTop: 10 },
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

function Footer({ locale, owner }: { locale: Locale; owner: boolean }) {
  const t = TEXT[locale];
  return (
    <View style={s.footer} fixed>
      <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
        <Text style={s.footText}>{t.scoreFormula}</Text>
        <Text style={s.footText}>
          {CVA_TEXT[locale].attribution}
          {owner ? ` · ${t.ownerOnly}` : ""}
        </Text>
      </View>
      <Text
        style={{ fontSize: 6.5, color: C.soft }}
        render={({ pageNumber, totalPages }) => t.page(pageNumber, totalPages)}
      />
    </View>
  );
}

export function FichaTecnicaDocument({
  model,
  teacherNotes,
  locale,
}: {
  model: FichaTecnicaModel;
  teacherNotes: TeacherCupperNotes[];
  locale: Locale;
}) {
  const t = TEXT[locale];
  const sc = SECTION_TEXT[locale];
  const owner = model.tier === "owner";
  const { header } = model;
  const sessionName = sanitizePdfText(header.sessionName);
  const showScores = model.samples.some((x) => x.affective?.communityScore != null);

  return (
    <Document title={`${t.spec} · ${sessionName}`} author="Café Sensible">
      <Page size="A4" style={s.page}>
        <Text style={s.spec}>{t.spec}</Text>
        <Text style={s.title}>{sessionName}</Text>
        <View style={s.metaRow}>
          <Meta label={t.date} value={formatDate(header.date, locale)} />
          <Meta label={t.format} value={t.formats[header.format] ?? header.format} />
          <Meta label={t.cups} value={String(header.cupsPerSample)} />
          {header.participants > 1 ? (
            <Meta label={t.participants} value={String(header.participants)} />
          ) : null}
        </View>
        {header.objective ? (
          <View style={{ marginTop: 8 }}>
            <Text style={s.metaLabel}>{t.objective}</Text>
            <Text style={{ fontSize: 9, marginTop: 1, lineHeight: 1.35 }}>
              {sanitizePdfText(header.objective)}
            </Text>
          </View>
        ) : null}
        <View style={s.rule} />

        <Text style={st.blockTitle}>{t.overview}</Text>
        <View style={st.row}>
          <Text style={[st.th, { width: 120 }]}>{t.colSample}</Text>
          <Text style={[st.th, { flexGrow: 1, flexBasis: 0 }]}>{t.colCoffee}</Text>
          {showScores ? (
            <Text style={[st.th, { width: 90 }]}>{t.colScore}</Text>
          ) : null}
          <Text style={[st.th, { width: 60, textAlign: "right" }]}>{t.colIncluded}</Text>
        </View>
        {model.samples.map((x, i) => (
          <View key={i} style={[st.row, { paddingVertical: 4 }]} wrap={false}>
            <Text style={[st.body, { width: 120, fontWeight: 700 }]}>
              {sanitizePdfText(x.identity.label)}
              {x.identity.isReference ? ` · ${sc.reference}` : ""}
            </Text>
            <Text style={[st.body, { flexGrow: 1, flexBasis: 0, paddingRight: 6 }]}>
              {x.identity.coffeeName ? sanitizePdfText(x.identity.coffeeName) : "—"}
            </Text>
            {showScores ? (
              <View style={{ width: 90 }}>
                {x.affective?.communityScore != null ? (
                  <PdfScoreBand
                    score={x.affective.communityScore}
                    band={scoreBand(x.affective.communityScore)}
                  />
                ) : (
                  <Text style={st.small}>—</Text>
                )}
              </View>
            ) : null}
            <Text style={[st.body, { width: 60, textAlign: "right" }]}>
              {fmt(x.participation.included, 0)}/{fmt(x.participation.total, 0)}
            </Text>
          </View>
        ))}
        <Footer locale={locale} owner={owner} />
      </Page>

      {model.samples.map((x, i) => (
        <Page key={i} size="A4" style={s.page}>
          <View style={s.sampleTop}>
            <View wrap={false}>
              <IdentityBlock
                identity={x.identity}
                locale={locale}
                showFacts={!(x.extrinsic && Object.keys(x.extrinsic).length > 0)}
              />
            </View>
            <View wrap={false}>
              <ParticipationBlock participation={x.participation} locale={locale} />
            </View>
            {x.extrinsic && Object.keys(x.extrinsic).length > 0 ? (
              <View wrap={false}>
                <ExtrinsicBlock extrinsic={x.extrinsic} locale={locale} />
              </View>
            ) : null}
            {owner && x.green ? (
              <View wrap={false}>
                <GreenBlock green={x.green} locale={locale} />
              </View>
            ) : null}
            {x.affective ? (
              <View wrap={false}>
                <AffectiveBlock affective={x.affective} locale={locale} />
              </View>
            ) : null}
            {x.descriptive ? (
              <View wrap={false}>
                <DescriptiveBlock descriptive={x.descriptive} locale={locale} />
              </View>
            ) : null}
          </View>
          <Footer locale={locale} owner={owner} />
        </Page>
      ))}

      {owner && model.ownerAppendix ? (
        <Page size="A4" style={s.page}>
          <OwnerAppendix appendix={model.ownerAppendix} locale={locale} />
          <Footer locale={locale} owner />
        </Page>
      ) : null}

      {owner && teacherNotes.length > 0 ? (
        <TeacherNotesPages
          notes={teacherNotes}
          locale={locale}
          pageStyle={s.page}
          footer={<Footer locale={locale} owner />}
        />
      ) : null}
    </Document>
  );
}
