import type { ComponentProps, ReactNode } from "react";
import { Page, View, Text } from "@react-pdf/renderer";
import { resolveDescriptor, resolveMainTaste } from "@/lib/descriptors";
import type { TeacherCupperNotes } from "@/lib/reports/teacherNotes";
import { PdfDeltaChip, PdfScoreBand } from "../charts";
import { sanitizePdfText } from "../text";
import { C, CONTENT_W, SECTION_TEXT, fmt, st, type Locale } from "./shared";

const RULED_LINES = 6;
const COLS = { sample: 150, score: 62, community: 62, delta: 70, align: 60 };

function labelFor(id: string, blockId: string, locale: Locale): string {
  const r = blockId === "gusto" ? resolveMainTaste(id, locale) : resolveDescriptor(id, locale);
  return sanitizePdfText(r?.label ?? id);
}

type DescItem = { key: string; sample: string; block: string; text: string };

function DescList({ title, items, none }: { title: string; items: DescItem[]; none: string }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={st.blockTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={st.muted}>{none}</Text>
      ) : (
        items.map((it) => (
          <Text key={it.key} style={[st.body, { lineHeight: 1.35, marginBottom: 2 }]}>
            <Text style={{ fontWeight: 700 }}>
              {it.sample} · {it.block}:{" "}
            </Text>
            {it.text}
          </Text>
        ))
      )}
    </View>
  );
}

/**
 * Body of ONE cupper's teacher-notes page (the Document wraps it in a <Page>
 * so the running footer is shared). Owner-only: carries cupper identity.
 */
function TeacherNotesPage({
  notes,
  locale,
}: {
  notes: TeacherCupperNotes;
  locale: Locale;
}): ReactNode {
  const t = SECTION_TEXT[locale];

  const lines = (kind: "missed" | "extra") =>
    notes.samples.flatMap((s) =>
      s[kind].map((entry) => ({
        key: `${s.sampleId}-${entry.blockId}`,
        sample: sanitizePdfText(s.label),
        block: t.blocks[entry.blockId] ?? entry.blockId,
        text: entry.ids.map((id) => labelFor(id, entry.blockId, locale)).join(", "),
      })),
    );
  const missed = lines("missed");
  const extra = lines("extra");

  return (
    <View>
      <Text style={st.tag}>
        {t.teacherNotes} · {t.teacherSub}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
        <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
          <Text style={[st.big, { fontSize: 22 }]}>{sanitizePdfText(notes.name)}</Text>
          {notes.excluded ? (
            <Text style={[st.small, { marginTop: 2 }]}>({t.excluded})</Text>
          ) : null}
        </View>
        {notes.alignment ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={st.kvLabel}>{t.alignment}</Text>
            <Text style={[st.big, { fontSize: 22 }]}>
              {Math.round(notes.alignment.overall * 100)}%
            </Text>
            <Text style={st.small}>
              {t.alignmentSub(notes.alignment.matches, notes.alignment.opportunities)}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ borderBottom: `0.75pt solid ${C.ink}`, marginTop: 8, marginBottom: 10 }} />

      <View style={st.row}>
        <Text style={[st.th, { width: COLS.sample }]}>{t.sample}</Text>
        <Text style={[st.th, { width: COLS.score }]}>{t.score}</Text>
        <Text style={[st.th, { width: COLS.community }]}>{t.community}</Text>
        <Text style={[st.th, { width: COLS.delta }]}>{t.delta}</Text>
        <Text style={[st.th, { width: COLS.align }]}>{t.alignmentRank.split(" ")[0]}</Text>
      </View>
      {notes.samples.map((s) => (
        <View key={s.sampleId} style={[st.row, { paddingVertical: 4 }]} wrap={false}>
          <Text style={[st.body, { width: COLS.sample, fontWeight: 700 }]}>
            {sanitizePdfText(s.label)}
            {s.isReference ? ` · ${t.reference}` : ""}
          </Text>
          <View style={{ width: COLS.score }}>
            {s.score === null ? (
              <Text style={st.small}>{t.notEvaluated}</Text>
            ) : (
              <PdfScoreBand score={s.score} band={s.band} />
            )}
          </View>
          <Text style={[st.body, { width: COLS.community }]}>{fmt(s.communityScore)}</Text>
          <View style={{ width: COLS.delta }}>
            <PdfDeltaChip delta={s.delta} />
          </View>
          <Text style={[st.body, { width: COLS.align }]}>
            {s.alignment && s.alignment.ratio !== null
              ? `${Math.round(s.alignment.ratio * 100)}%`
              : "—"}
          </Text>
        </View>
      ))}

      <Text style={[st.small, { marginTop: 6, lineHeight: 1.35 }]}>{t.bandLegend}</Text>

      <DescList title={t.missed} items={missed} none={t.none} />
      <DescList title={t.extra} items={extra} none={t.none} />

      <View style={{ marginTop: 16 }}>
        <Text style={st.blockTitle}>{t.handwritten}</Text>
        {Array.from({ length: RULED_LINES }, (_, i) => (
          <View
            key={i}
            style={{ height: 26, borderBottom: `0.5pt solid ${C.hair}`, width: CONTENT_W }}
          />
        ))}
      </View>
    </View>
  );
}

/** One <Page> per cupper. `pageStyle` and `footer` come from the Document so the running footer is shared. */
export function TeacherNotesPages({
  notes,
  locale,
  pageStyle,
  footer,
}: {
  notes: TeacherCupperNotes[];
  locale: Locale;
  pageStyle: ComponentProps<typeof Page>["style"];
  footer: ReactNode;
}) {
  return (
    <>
      {notes.map((n) => (
        <Page key={n.cupperId} size="A4" style={pageStyle}>
          <TeacherNotesPage notes={n} locale={locale} />
          {footer}
        </Page>
      ))}
    </>
  );
}
