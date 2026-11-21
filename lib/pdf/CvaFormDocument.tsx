// Server-only. Renders one cupper's evaluation of a session as a PDF drawn to the
// layout of the official SCA paper forms (Descriptive, Affective and Combined
// Form, Version 2, June 2024), A4 PORTRAIT in all three:
//
//   Descriptive — TWO samples per page, stacked. A dark "Sample no. / Roast level"
//                 band, then Fragrance + Aroma rulers over their descriptor box,
//                 Flavor + Aftertaste rulers over theirs (with the Main tastes),
//                 Acidity, Sweetness and Mouthfeel; a Notes column at the right.
//   Affective   — TWO samples per page, side by side, under the Impression of
//                 quality legend: nine circled numbers and a FINAL pill per
//                 attribute, a Notes area per row, the cup boxes and the defect.
//   Combined    — ONE sample per page: Part 1 (descriptive) at the left, Part 2
//                 (affective) at the right, Part 3 (extrinsic) under the left.
//
// The official form lists nine descriptor categories with their sub-options
// inline. Our nine L1 wheel groups map onto those rows one-for-one and the L2
// subgroups are the sub-options; L3 leaves and qualifying notes ride in the
// Notes cell, exactly as buildFlavorGroups assembles them.
//
// THE CUPPER'S MARKS differ from the printed form in colour AND in shape, so they
// stand out on a screen and in a black-and-white print: the form is drawn in thin
// ink lines and hollow shapes; a mark is a SOLID shape in PDF_PALETTE.mark (a
// filled square with a check, a filled rounded square over the chosen circle, a
// filled pill, a solid bar with a triangle across a ruler, a solid chip for a
// chosen descriptor, a heavy rule beside a written value). Never colour alone.
//
// This is a DERIVED document, not an SCA publication: the footer says so on
// every page and no SCA copyright line is reproduced. See CVA_TEXT.attribution.
//
// NEVER import this (or @react-pdf/renderer) from a client component. It is
// consumed only by the GET route (app/api/sessions/[id]/cva-pdf/route.ts) and
// lib/closeEmail.ts. Fonts: lib/pdf/fonts.ts registers the bundled TTFs in public/fonts.

import type { ScoreRule } from "@/lib/scoreRule";
import { Document, Page, View, Text, StyleSheet, Svg, Polygon, Polyline, Rect } from "@react-pdf/renderer";
import { buildStampLine } from "./stampText";
import type { SamplePrep } from "@/lib/samplePrep";
import { registerPdfFonts, SANS, SERIF } from "./fonts";
import { PDF_PALETTE, pdfPaleTint } from "./palette";
import {
  buildCvaFormData,
  type CvaFormInput,
  CVA_TEXT,
  type CvaSampleSheet,
  type FlavorGroupRow,
  type CataGroupRow,
  type DescriptiveSheet,
  type StageId,
  type Locale,
} from "./cvaFormData";

registerPdfFonts();

// ─── Ink ────────────────────────────────────────────────────────────────────
// The printed form is ink and grey; MARK is the one colour, and it belongs to the
// cupper alone.
const INK = PDF_PALETTE.ink;
const SOFT = PDF_PALETTE.soft;
const LINE = PDF_PALETTE.reference;
const HAIR = PDF_PALETTE.grid;
const WHITE = PDF_PALETTE.white;
const MARK = PDF_PALETTE.mark;

/** The gradient of a ruler: fifteen steps from pale to dark grey, opaque (a transparent fill prints differently from one printer to the next). */
const RULER_STEPS = Array.from({ length: 15 }, (_, i) => pdfPaleTint(INK, 0.06 + (i / 14) * 0.42));

const s = StyleSheet.create({
  page: {
    paddingTop: 22,
    paddingBottom: 38,
    paddingHorizontal: 26,
    fontFamily: SANS,
    fontSize: 6.5,
    color: INK,
  },

  // ── Page head ──
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: 8 },
  wordmark: { fontSize: 7.5, color: SOFT },
  formName: { fontSize: 20, fontFamily: SERIF, fontWeight: 700, color: INK, lineHeight: 1.05, marginTop: 2 },
  brand: { fontSize: 6, letterSpacing: 1.4, color: SOFT, textTransform: "uppercase" },
  fieldRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 4 },
  fieldLabel: { fontSize: 7.5, fontFamily: SERIF, fontWeight: 700, marginRight: 3 },
  fieldLeader: { flexGrow: 1, flexBasis: 0, borderBottom: `0.5pt dotted ${SOFT}`, minHeight: 10, justifyContent: "flex-end" },

  // ── Footer ──
  footer: {
    position: "absolute",
    left: 26,
    right: 26,
    bottom: 16,
    borderTop: `0.5pt solid ${HAIR}`,
    paddingTop: 3,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  footerText: { fontSize: 5, color: SOFT, flexGrow: 1, flexBasis: 0, lineHeight: 1.3 },
  footerPage: { fontSize: 5.5, color: SOFT },

  // ── Frames and bands ──
  frame: { border: `0.6pt solid ${INK}` },
  band: { flexDirection: "row", alignItems: "center", backgroundColor: INK, height: 14, paddingLeft: 4 },
  bandLabel: { fontSize: 6.5, color: WHITE, letterSpacing: 0.6, textTransform: "uppercase", marginRight: 4 },
  bandBox: { flexGrow: 1, flexBasis: 0, height: 11, backgroundColor: WHITE, marginRight: 4, justifyContent: "center", paddingHorizontal: 3 },
  partBand: { backgroundColor: INK, height: 14, justifyContent: "center", paddingHorizontal: 4 },
  partBandText: { fontSize: 6.5, color: WHITE, letterSpacing: 0.6, textTransform: "uppercase" },
  section: { borderTop: `0.5pt solid ${INK}` },
  cellRow: { flexDirection: "row" },
  notesCol: { borderLeft: `0.5pt solid ${INK}`, padding: 3 },
  notesLabel: { fontSize: 6, fontFamily: SERIF, fontWeight: 700, marginBottom: 2 },

  // ── Rulers ──
  secName: { fontSize: 8, fontFamily: SERIF, fontWeight: 700, lineHeight: 1.05 },
  caption: { fontSize: 5, color: SOFT },
  bandWord: { position: "absolute", fontSize: 4.8, color: SOFT, letterSpacing: 0.8, textTransform: "uppercase" },
  tickNum: { position: "absolute", fontSize: 4.5, color: SOFT },

  // ── Descriptor lists ──
  cataRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 0.8 },
  group: { fontSize: 6.3, fontFamily: SERIF, fontWeight: 700, marginRight: 3 },
  sub: { flexDirection: "row", alignItems: "center", marginRight: 3 },
  subText: { fontSize: 6, color: INK },
  on: { color: MARK },
  tasteTitle: { fontSize: 6.3, fontFamily: SERIF, fontWeight: 700, marginBottom: 1.5 },

  // ── Marks ──
  written: { fontSize: 7.5, color: MARK },
  chip: { backgroundColor: MARK, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 0.8, marginRight: 2, marginBottom: 2 },
  chipText: { fontSize: 5.8, color: WHITE },

  // ── Affective ──
  legend: { border: `0.5pt solid ${INK}`, paddingVertical: 3, paddingHorizontal: 4, marginBottom: 4 },
  legendTitle: { fontSize: 5.5, fontFamily: SERIF, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 },
  legendItem: { fontSize: 4.8, color: INK, textTransform: "uppercase", lineHeight: 1.15 },
  bubbleRow: { flexDirection: "row", alignItems: "center", height: 17 },
  bubbleCell: { width: 13.2, height: 15, alignItems: "center", justifyContent: "center" },
  bubble: { width: 11.6, height: 11.6, borderRadius: 5.8, border: `0.5pt solid ${SOFT}`, alignItems: "center", justifyContent: "center" },
  bubbleNum: { fontSize: 6, color: SOFT },
  bubbleOn: { width: 14, height: 14, borderRadius: 2.5, backgroundColor: MARK, alignItems: "center", justifyContent: "center" },
  bubbleOnNum: { fontSize: 7.5, color: WHITE },
  pill: { marginLeft: 3, minWidth: 27, height: 11.6, borderRadius: 5.8, border: `0.5pt solid ${LINE}`, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  pillOn: { backgroundColor: MARK, border: `0.5pt solid ${MARK}`, height: 14, borderRadius: 7 },
  pillText: { fontSize: 4.8, color: LINE, letterSpacing: 0.6 },
  pillOnText: { fontSize: 8, color: WHITE },
  cupLabel: { fontSize: 5.2, fontFamily: SERIF, fontWeight: 700, textTransform: "uppercase", marginRight: 3 },
  cupBox: { width: 7, height: 7, border: `0.5pt solid ${INK}`, marginRight: 2.5 },

  // ── Part 3 fields ──
  metaWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaLabel: { fontSize: 5, letterSpacing: 0.9, color: SOFT, textTransform: "uppercase" },
});

// ─── Marks ──────────────────────────────────────────────────────────────────

/**
 * A tick box. Printed: a hollow thin square. Marked: a SOLID square in the mark
 * colour with a white check, one point larger than the box it covers.
 */
function Tick({ on, size = 6 }: { on: boolean; size?: number }) {
  const mark = size + 1.2;
  if (!on) {
    return <View style={{ width: size, height: size, border: `0.5pt solid ${INK}`, marginHorizontal: 0.6, marginRight: 2.4 }} />;
  }
  return (
    <Svg width={mark} height={mark} viewBox="0 0 7 7" style={{ marginRight: 2 }}>
      <Rect x={0} y={0} width={7} height={7} rx={1} fill={MARK} />
      <Polyline points="1.3,3.6 2.9,5.3 5.8,1.6" stroke={WHITE} strokeWidth={1.2} fill="none" />
    </Svg>
  );
}

/** A solid cup square: hollow when the cup carries no mark. */
function CupBox({ on }: { on: boolean }) {
  if (!on) return <View style={s.cupBox} />;
  return (
    <Svg width={8} height={8} viewBox="0 0 8 8" style={{ marginRight: 2 }}>
      <Rect x={0} y={0} width={8} height={8} rx={1} fill={MARK} />
      <Polyline points="1.6,1.6 6.4,6.4" stroke={WHITE} strokeWidth={1.3} fill="none" />
      <Polyline points="6.4,1.6 1.6,6.4" stroke={WHITE} strokeWidth={1.3} fill="none" />
    </Svg>
  );
}

/** A written value: the mark colour with a heavy rule beside it. */
function Written({ children, size }: { children: React.ReactNode; size?: number }) {
  return (
    <View style={{ borderLeft: `1.6pt solid ${MARK}`, paddingLeft: 3 }}>
      <Text style={size ? [s.written, { fontSize: size }] : s.written}>{children}</Text>
    </View>
  );
}

/** A chosen term that has no printed box (an L3 leaf, a qualifying word, an acidity word): a solid chip. */
function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {items.map((it, i) => (
        <View key={i} style={s.chip}>
          <Text style={s.chipText}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Page furniture ─────────────────────────────────────────────────────────

/** "Name ........" — the official form's dot-leader field; the value is a written value. */
function Field({ label, value, flex }: { label: string; value: string; flex?: number }) {
  return (
    <View style={flex === undefined ? s.fieldRow : [s.fieldRow, { flexGrow: flex, flexBasis: 0 }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.fieldLeader}>{value ? <Written>{value}</Written> : null}</View>
    </View>
  );
}

/** Title block at the left, the fields at the right (descriptive and affective). */
function PageHead({ sheet, t, formName }: { sheet: CvaSampleSheet; t: Record<string, string>; formName: string }) {
  const h = sheet.header;
  return (
    <View style={s.head}>
      <View style={{ width: 150 }}>
        <Text style={s.wordmark}>SCA {t.methodology}</Text>
        <Text style={s.formName}>{formName}</Text>
      </View>
      <View style={{ flexGrow: 1, flexBasis: 0, marginRight: 10 }}>
        <Field label={t.name} value={h.cupperName} />
        <Field label={t.date} value={h.date} />
        <Field label={t.purpose} value={h.purpose} />
      </View>
      <Text style={s.brand}>Café Sensible</Text>
    </View>
  );
}

function SheetFooter({ t }: { t: Record<string, string> }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>
        {t.attribution}
        {t.stampLine ? `\n${t.stampLine}` : ""}
      </Text>
      <Text style={s.footerPage} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

/** "SAMPLE NO. [ ]  ROAST LEVEL [ ]" — the dark band that opens a sample. */
function SampleBand({
  sheet,
  t,
  roast = true,
  boxFlex = 1,
}: {
  sheet: CvaSampleSheet;
  t: Record<string, string>;
  roast?: boolean;
  boxFlex?: number;
}) {
  const h = sheet.header;
  const ref = h.isReference ? ` · ${t.reference}${h.referenceRank ? ` ${h.referenceRank}` : ""}` : "";
  return (
    <View style={s.band}>
      <Text style={s.bandLabel}>{t.sampleNo}</Text>
      <View style={[s.bandBox, { flexGrow: boxFlex }]}>
        <Written>
          {h.sampleLabel}
          {ref}
          {h.coffeeName ? ` · ${h.coffeeName}` : ""}
        </Written>
      </View>
      {roast ? (
        <>
          <Text style={s.bandLabel}>{t.roastLevel}</Text>
          <View style={[s.bandBox, { flexGrow: 0, flexBasis: 70 }]}>
            {h.roastLevel ? <Written>{h.roastLevel}</Written> : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

// ─── Intensity ruler ────────────────────────────────────────────────────────

/**
 * 0–15 intensity ruler: LOW / MEDIUM / HIGH over a pale-to-dark bar with ticks at
 * every point and numbers at 0, 5, 10 and 15. The cupper's value is a SOLID bar
 * with a white edge across the ruler and a solid triangle under it.
 */
function Ruler({ name, value, t, nameWidth = 58 }: { name: string; value: number | null; t: Record<string, string>; nameWidth?: number }) {
  const pct = value === null ? null : (Math.max(0, Math.min(15, value)) / 15) * 100;
  return (
    <View style={{ flexDirection: "row", height: 22, paddingHorizontal: 4, paddingTop: 0.5 }} wrap={false}>
      <View style={{ width: nameWidth, paddingTop: 3 }}>
        <Text style={s.secName}>{name}</Text>
        <Text style={s.caption}>{t.intensity}</Text>
      </View>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>
        <View style={{ height: 5.5 }}>
          <Text style={[s.bandWord, { left: "6%" }]}>{t.low}</Text>
          <Text style={[s.bandWord, { left: "42%" }]}>{t.medium}</Text>
          <Text style={[s.bandWord, { left: "84%" }]}>{t.high}</Text>
        </View>
        <View style={{ height: 7, flexDirection: "row" }}>
          {RULER_STEPS.map((c, i) => (
            <View key={i} style={{ flexGrow: 1, flexBasis: 0, backgroundColor: c }} />
          ))}
          {pct !== null ? (
            <View style={{ position: "absolute", left: `${pct}%`, top: -3, width: 0 }}>
              <View style={{ position: "absolute", left: -2.2, top: -0.6, width: 4.4, height: 14.2, backgroundColor: MARK, border: `1.2pt solid ${WHITE}` }} />
            </View>
          ) : null}
        </View>
        <View style={{ height: 10 }}>
          {Array.from({ length: 16 }, (_, i) => (
            <View
              key={i}
              style={{ position: "absolute", left: `${(i / 15) * 100}%`, top: 0, width: 0.5, height: i % 5 === 0 ? 3.5 : 2, backgroundColor: INK }}
            />
          ))}
          {[0, 5, 10, 15].map((m) => (
            <Text key={m} style={[s.tickNum, { left: `${(m / 15) * 100 - (m === 0 ? 0 : 1.5)}%`, top: 4.5 }]}>
              {m}
            </Text>
          ))}
          {pct !== null ? (
            <Svg width={8} height={5} viewBox="0 0 8 5" style={{ position: "absolute", left: `${pct}%`, marginLeft: -4, top: 4 }}>
              <Polygon points="4,0 8,5 0,5" fill={MARK} stroke={WHITE} strokeWidth={0.6} />
            </Svg>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ─── Descriptor lists, in the official inline style ─────────────────────────
//
//   [ ] Fruity  [ ] Berry  [x] Dried fruit  [ ] Citrus fruit

type Row = {
  id: string;
  label: string;
  checked: boolean;
  subs: { id: string; label: string; checked: boolean }[];
};

const flavorToRow = (g: FlavorGroupRow): Row => ({ id: g.id, label: g.label, checked: g.checked, subs: g.subgroups });
const cataToRow = (g: CataGroupRow): Row => ({ id: g.id, label: g.label, checked: g.checked, subs: g.subItems });

function CataRow({ row }: { row: Row }) {
  return (
    <View style={s.cataRow}>
      <Tick on={row.checked} />
      <Text style={row.checked ? [s.group, s.on] : s.group}>{row.label}</Text>
      {row.subs.map((sub) => (
        <View key={sub.id} style={s.sub}>
          <Tick on={sub.checked} size={5} />
          <Text style={sub.checked ? [s.subText, s.on] : s.subText}>{sub.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** Rows in N columns, in the order given. */
function CataList({ rows, columns, style }: { rows: Row[]; columns: number; style?: { flexGrow?: number; flexBasis?: number; width?: number } }) {
  const per = Math.ceil(rows.length / columns);
  const cols = Array.from({ length: columns }, (_, i) => rows.slice(i * per, (i + 1) * per));
  return (
    <View style={[{ flexDirection: "row", gap: 6, paddingHorizontal: 4, paddingVertical: 3 }, style ?? {}]}>
      {cols.map((col, ci) => (
        <View key={ci} style={{ flexGrow: 1, flexBasis: 0 }}>
          {col.map((row) => (
            <CataRow key={row.id} row={row} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Main tastes (2): the little box inside Box B on the official form. */
function MainTastes({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  return (
    <View style={{ width: 74, paddingVertical: 4, paddingRight: 4 }}>
      <Text style={s.tasteTitle}>{t.mainTastesTitle}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {sheet.basicTastes.map((bt) => (
          <View key={bt.id} style={{ flexDirection: "row", alignItems: "center", width: "50%", marginBottom: 1.2 }}>
            <Tick on={bt.checked} size={5.5} />
            <Text style={bt.checked ? [s.subText, s.on] : s.subText}>{bt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** What the cupper picked in a CATA stage that the official form leaves to its Notes (acidity, sweetness): chosen words, as chips. */
function chosenWords(rows: CataGroupRow[]): string[] {
  const out: string[] = [];
  for (const g of rows) {
    const subs = g.subItems.filter((x) => x.checked).map((x) => x.label);
    if (subs.length > 0) out.push(...subs);
    else if (g.checked) out.push(g.label);
    out.push(...g.notesLine);
  }
  return out;
}

/** What a Notes box holds: a longer note is cut here, so it never runs onto another page nor pushes the combined form's columns out of line. */
const NOTE_MAX = 400;
const clip = (text: string) => (text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX).trimEnd()}…` : text);

/** The cupper's free-text note of a stage (`<stage>_notas`), already sanitized by the builder. */
type StageNote = { prefix?: string; text: string };

const STAGE_LABEL: Record<StageId, string> = {
  fragancia: "fragrance",
  aroma: "aroma",
  sabor: "flavor",
  sabor_residual: "aftertasteShort",
  acidez: "acidity",
  dulzor: "sweetness",
  sensacion: "mouthfeelShort",
};

/** The written notes of the stages that share one Notes box; a stage's name leads its note only when two share the box. */
function stageNotes(d: DescriptiveSheet, stages: StageId[], t: Record<string, string>): StageNote[] {
  return stages
    .map((id) => ({ prefix: stages.length > 1 ? t[STAGE_LABEL[id]] : undefined, text: d.freeNotes[id] }))
    .filter((n) => n.text);
}

function WrittenNotes({ notes }: { notes?: StageNote[] }) {
  if (!notes || notes.length === 0) return null;
  return (
    <View>
      {notes.map((n, i) => (
        <View key={i} style={{ marginBottom: 2 }}>
          <Written size={6.3}>{n.prefix ? `${n.prefix}: ${clip(n.text)}` : clip(n.text)}</Written>
        </View>
      ))}
    </View>
  );
}

/** The "Notes" cell: its caption, then the chosen words as chips. */
function NotesCell({ label, items, notes, width }: { label: string; items: string[]; notes?: StageNote[]; width?: number | string }) {
  return (
    <View style={[s.notesCol, width !== undefined ? { width } : { flexGrow: 1, flexBasis: 0 }]}>
      <Text style={s.notesLabel}>{label}</Text>
      <Chips items={items} />
      <WrittenNotes notes={notes} />
    </View>
  );
}

// ─── Descriptive: one sample, half a portrait page ──────────────────────────

const DESC_LEFT = 410;

function DescriptiveBlock({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  const d: DescriptiveSheet = sheet.descriptive;
  const int = (id: StageId) => d.intensity[id];
  const notesW = 543 - DESC_LEFT - 1.2;
  return (
    <View style={s.frame}>
      <SampleBand sheet={sheet} t={t} />

      {/* Fragrance + Aroma share Box A (orthonasal) and one Notes cell. */}
      <View style={[s.cellRow, s.section]}>
        <View style={{ width: DESC_LEFT }}>
          <Ruler name={t.fragrance} value={int("fragancia")} t={t} />
          <Ruler name={t.aroma} value={int("aroma")} t={t} />
          <CataList rows={d.boxA.map(flavorToRow)} columns={2} />
        </View>
        <NotesCell label={t.notes} items={d.boxANotes} notes={stageNotes(d, ["fragancia", "aroma"], t)} width={notesW} />
      </View>

      {/* Flavor + Aftertaste share Box B (retronasal), with the Main tastes inside it. */}
      <View style={[s.cellRow, s.section]}>
        <View style={{ width: DESC_LEFT }}>
          <Ruler name={t.flavor} value={int("sabor")} t={t} />
          <Ruler name={t.aftertasteShort ?? t.aftertaste} value={int("sabor_residual")} t={t} />
          <View style={{ flexDirection: "row" }}>
            <CataList rows={d.boxB.map(flavorToRow)} columns={2} style={{ flexGrow: 1, flexBasis: 0 }} />
            <MainTastes sheet={sheet} t={t} />
          </View>
        </View>
        <NotesCell label={t.notes} items={d.boxBNotes} notes={stageNotes(d, ["sabor", "sabor_residual"], t)} width={notesW} />
      </View>

      <View style={[s.cellRow, s.section]}>
        <View style={{ width: DESC_LEFT, minHeight: 30 }}>
          <Ruler name={t.acidity} value={int("acidez")} t={t} />
        </View>
        <NotesCell label={t.notes} items={chosenWords(d.acidity)} notes={stageNotes(d, ["acidez"], t)} width={notesW} />
      </View>

      <View style={[s.cellRow, s.section]}>
        <View style={{ width: DESC_LEFT, minHeight: 30 }}>
          <Ruler name={t.sweetness} value={int("dulzor")} t={t} />
        </View>
        <NotesCell label={t.notes} items={chosenWords(d.sweetness)} notes={stageNotes(d, ["dulzor"], t)} width={notesW} />
      </View>

      <View style={[s.cellRow, s.section]}>
        <View style={{ width: DESC_LEFT }}>
          <Ruler name={t.mouthfeelShort ?? t.mouthfeel} value={int("sensacion")} t={t} />
          <CataList rows={d.mouthfeel.map(cataToRow)} columns={3} />
        </View>
        <NotesCell label={t.notes} items={[]} notes={stageNotes(d, ["sensacion"], t)} width={notesW} />
      </View>
    </View>
  );
}

// ─── Affective ──────────────────────────────────────────────────────────────

const QUALITY_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"];

/** Narrow label columns take the short form where one exists. */
const shortLabel = (t: Record<string, string>, key: string) => t[`${key}Short`] ?? t[key] ?? key;

/** IMPRESSION OF QUALITY: the nine circled numbers with their words, in one row (affective) or three across (beside the combined form's fields). */
function QualityLegend({ t, layout }: { t: Record<string, string>; layout: "row" | "grid" }) {
  const grid = layout === "grid";
  return (
    <View style={grid ? [s.legend, { marginBottom: 0 }] : s.legend} wrap={false}>
      <Text style={s.legendTitle}>{t.impressionOfQuality}</Text>
      <View style={{ flexDirection: "row", flexWrap: grid ? "wrap" : "nowrap" }}>
        {QUALITY_KEYS.map((k, i) => (
          <View
            key={k}
            style={
              grid
                ? { width: "33.3%", flexDirection: "row", alignItems: "flex-start", paddingRight: 2, marginBottom: 2 }
                : { flexGrow: 1, flexBasis: 0, flexDirection: "row", alignItems: "flex-start", paddingRight: 2 }
            }
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, border: `0.4pt solid ${INK}`, alignItems: "center", justifyContent: "center", marginRight: 1.5 }}>
              <Text style={{ fontSize: 5, lineHeight: 1 }}>{i + 1}</Text>
            </View>
            <Text style={[s.legendItem, { flexGrow: 1, flexBasis: 0 }]}>{t[k]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Nine circled numbers and a FINAL pill. The chosen value: a solid rounded square over its circle, and a solid pill carrying the number. */
function Bubbles({ value, notEvaluated, notEvaluatedLabel }: { value: number | null; notEvaluated: boolean; notEvaluatedLabel: string }) {
  return (
    <View style={s.bubbleRow}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
        <View key={n} style={s.bubbleCell}>
          {n === value ? (
            <View style={s.bubbleOn}>
              <Text style={s.bubbleOnNum}>{n}</Text>
            </View>
          ) : (
            <View style={s.bubble}>
              <Text style={s.bubbleNum}>{n}</Text>
            </View>
          )}
        </View>
      ))}
      {notEvaluated ? (
        <View style={[s.pill, s.pillOn, { minWidth: 40 }]}>
          <Text style={[s.pillOnText, { fontSize: 5.6 }]}>{notEvaluatedLabel}</Text>
        </View>
      ) : (
        <View style={value === null ? s.pill : [s.pill, s.pillOn]}>
          <Text style={value === null ? s.pillText : s.pillOnText}>{value === null ? "FINAL" : value}</Text>
        </View>
      )}
    </View>
  );
}

/** A "Notes" area: caption, then each written note. */
function NotesBlock({ notes, label }: { notes: { prefix?: string; text: string }[]; label: string }) {
  return (
    <View style={{ paddingHorizontal: 4, paddingBottom: 3, flexGrow: 1 }}>
      <Text style={s.notesLabel}>{label}</Text>
      {notes
        .filter((n) => n.text)
        .map((n, i) => (
          <View key={i} style={{ marginBottom: 2 }}>
            <Written size={6.3}>{n.prefix ? `${n.prefix}: ${clip(n.text)}` : clip(n.text)}</Written>
          </View>
        ))}
    </View>
  );
}

type AffRows = CvaSampleSheet["affectiveRows"];

/** Rows of bubbles (with their name at the left unless the combined layout aligns them to the rulers) and the shared Notes area. */
function AffCell({
  rows,
  t,
  minHeight,
  labelWidth,
}: {
  rows: AffRows;
  t: Record<string, string>;
  minHeight: number;
  labelWidth?: number;
}) {
  return (
    <View style={[s.section, { minHeight }]}>
      {rows.map((row) => (
        <View key={row.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 4, paddingTop: 1 }}>
          {labelWidth ? (
            <Text style={[s.secName, { width: labelWidth }]}>{shortLabel(t, row.labelKey)}</Text>
          ) : null}
          <Bubbles value={row.value} notEvaluated={row.notEvaluated} notEvaluatedLabel={t.notEvaluated} />
        </View>
      ))}
      <NotesBlock
        label={t.notes}
        notes={rows.map((r) => ({ prefix: rows.length > 1 ? shortLabel(t, r.labelKey) : undefined, text: r.notes }))}
      />
    </View>
  );
}

/** Non-uniform and defective cups as boxes, and the defect (if any): the foot of an affective sample. */
function CupsFoot({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  const order = ["moldy", "phenolic", "potato"];
  const types = [...sheet.cups.defectTypes].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return (
    <View style={[s.section, { flexDirection: "row", padding: 4 }]} wrap={false}>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
          <Text style={s.cupLabel}>{t.nonUniform}</Text>
          {sheet.cups.nonUniform.map((on, i) => (
            <CupBox key={i} on={on} />
          ))}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text style={s.cupLabel}>{t.defectiveCups}</Text>
          {sheet.cups.defective.map((on, i) => (
            <CupBox key={i} on={on} />
          ))}
        </View>
      </View>
      <View style={{ width: 70 }}>
        <Text style={s.cupLabel}>{t.defectIfAny}</Text>
        {types.map((dt) => (
          <View key={dt.id} style={{ flexDirection: "row", alignItems: "center", marginTop: 1 }}>
            <Tick on={dt.checked} size={5.5} />
            <Text style={dt.checked ? [s.subText, s.on] : s.subText}>{dt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Affective row groups of the official form: [Fragrance, Aroma] [Flavor, Aftertaste] [Acidity] [Sweetness] [Mouthfeel] [Overall]. */
function affGroups(rows: AffRows): AffRows[] {
  const pick = (ids: string[]) => rows.filter((r) => ids.includes(r.id));
  return [
    pick(["fragancia_af", "aroma_af"]),
    pick(["sabor_af", "sabor_residual_af"]),
    pick(["acidez_af"]),
    pick(["dulzor_af"]),
    pick(["sensacion_af"]),
    pick(["impresion_global"]),
  ].filter((g) => g.length > 0);
}

const AFF_HEIGHTS = [118, 118, 66, 62, 62, 62];

function AffectiveSample({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 0 }}>
      <View style={s.frame}>
        <SampleBand sheet={sheet} t={t} roast={false} />
        {affGroups(sheet.affectiveRows).map((rows, i) => (
          <AffCell key={i} rows={rows} t={t} minHeight={AFF_HEIGHTS[i] ?? 60} labelWidth={56} />
        ))}
        <CupsFoot sheet={sheet} t={t} />
      </View>
    </View>
  );
}

function AffectivePage({ pair, t }: { pair: CvaSampleSheet[]; t: Record<string, string> }) {
  return (
    <Page size="A4" style={s.page}>
      <PageHead sheet={pair[0]} t={t} formName={t.formAffective} />
      <QualityLegend t={t} layout="row" />
      <View style={{ flexDirection: "row", gap: 5 }}>
        {pair.map((sheet, i) => (
          <AffectiveSample key={i} sheet={sheet} t={t} />
        ))}
        {pair.length === 1 ? <View style={{ flexGrow: 1, flexBasis: 0 }} /> : null}
      </View>
      <SheetFooter t={t} />
    </Page>
  );
}

// ─── Combined: Part 1 left / Part 2 right / Part 3 under the left ───────────

const COMBINED_LEFT = 346;
// Both columns of the combined sheet use these, so a row at the right sits level with its ruler at the left.
const COMBINED_H = [126, 150, 42, 42, 66];

function CombinedPage({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  const d = sheet.descriptive;
  const int = (id: StageId) => d.intensity[id];
  const h = sheet.header;
  const ref = h.isReference ? ` · ${t.reference}${h.referenceRank ? ` ${h.referenceRank}` : ""}` : "";
  const groups = affGroups(sheet.affectiveRows);

  return (
    <Page size="A4" style={s.page}>
      {/* Head: the title at the left (the SCA mark's place keeps the brand), the fields under it, the legend at the right. */}
      <View style={s.head}>
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <Text style={s.wordmark}>SCA {t.methodology}</Text>
          <Text style={s.formName}>{t.formCombined}</Text>
        </View>
        <Text style={s.brand}>Café Sensible</Text>
      </View>
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        <View style={{ width: COMBINED_LEFT, paddingRight: 10 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field label={t.name} value={h.cupperName} flex={1.4} />
            <Field label={t.date} value={h.date} flex={1} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Field label={t.purpose} value={h.purpose} flex={1} />
            <Field label={t.sampleNo} value={`${h.sampleLabel}${ref}${h.coffeeName ? ` · ${h.coffeeName}` : ""}`} flex={1.7} />
          </View>
        </View>
        <View style={{ flexGrow: 1, flexBasis: 0, marginLeft: 6 }}>
          <QualityLegend t={t} layout="grid" />
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 6 }}>
        {/* Part 1 — descriptive */}
        <View style={{ width: COMBINED_LEFT }}>
          <View style={s.frame}>
            <View style={s.band}>
              <Text style={[s.bandLabel, { flexGrow: 1 }]}>{t.partDescriptive}</Text>
              <Text style={s.bandLabel}>{t.roastLevel}</Text>
              <View style={[s.bandBox, { flexGrow: 0, flexBasis: 54 }]}>
                {h.roastLevel ? <Written>{h.roastLevel}</Written> : null}
              </View>
            </View>

            <View style={{ minHeight: COMBINED_H[0] }}>
              <Ruler name={t.fragrance} value={int("fragancia")} t={t} nameWidth={54} />
              <Ruler name={t.aroma} value={int("aroma")} t={t} nameWidth={54} />
              <View style={[s.cellRow, s.section]}>
                <CataList rows={d.boxA.map(flavorToRow)} columns={1} style={{ width: 192 }} />
                <NotesCell label={t.notes} items={d.boxANotes} notes={stageNotes(d, ["fragancia", "aroma"], t)} />
              </View>
            </View>

            <View style={[s.section, { minHeight: COMBINED_H[1] }]}>
              <Ruler name={t.flavor} value={int("sabor")} t={t} nameWidth={54} />
              <Ruler name={t.aftertasteShort ?? t.aftertaste} value={int("sabor_residual")} t={t} nameWidth={54} />
              <View style={[s.cellRow, s.section]}>
                <View style={{ width: 192 }}>
                  <CataList rows={d.boxB.map(flavorToRow)} columns={1} />
                  <View style={{ paddingLeft: 4 }}>
                    <Text style={s.tasteTitle}>{t.mainTastesTitle}</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {sheet.basicTastes.map((bt) => (
                        <View key={bt.id} style={{ flexDirection: "row", alignItems: "center", width: "33%", marginBottom: 1 }}>
                          <Tick on={bt.checked} size={5.5} />
                          <Text style={bt.checked ? [s.subText, s.on] : s.subText}>{bt.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <NotesCell label={t.notes} items={d.boxBNotes} notes={stageNotes(d, ["sabor", "sabor_residual"], t)} />
              </View>
            </View>

            <View style={[s.section, { minHeight: COMBINED_H[2] }]}>
              <Ruler name={t.acidity} value={int("acidez")} t={t} nameWidth={54} />
              <View style={{ paddingHorizontal: 4, paddingBottom: 2 }}>
                <Text style={s.notesLabel}>{t.notes}</Text>
                <Chips items={chosenWords(d.acidity)} />
                <WrittenNotes notes={stageNotes(d, ["acidez"], t)} />
              </View>
            </View>

            <View style={[s.section, { minHeight: COMBINED_H[3] }]}>
              <Ruler name={t.sweetness} value={int("dulzor")} t={t} nameWidth={54} />
              <View style={{ paddingHorizontal: 4, paddingBottom: 2 }}>
                <Text style={s.notesLabel}>{t.notes}</Text>
                <Chips items={chosenWords(d.sweetness)} />
                <WrittenNotes notes={stageNotes(d, ["dulzor"], t)} />
              </View>
            </View>

            <View style={[s.section, { minHeight: COMBINED_H[4] }]}>
              <Ruler name={t.mouthfeelShort ?? t.mouthfeel} value={int("sensacion")} t={t} nameWidth={54} />
              <View style={s.cellRow}>
                <CataList rows={d.mouthfeel.map(cataToRow)} columns={1} style={{ width: 192 }} />
                <NotesCell label={t.notes} items={[]} notes={stageNotes(d, ["sensacion"], t)} />
              </View>
            </View>
          </View>

          {/* Part 3 — extrinsic */}
          <View style={[s.frame, { marginTop: 5 }]} wrap={false}>
            <View style={s.partBand}>
              <Text style={s.partBandText}>{t.partExtrinsic}</Text>
            </View>
            <View style={{ padding: 4, minHeight: 70 }}>
              <Text style={s.notesLabel}>{t.notes}</Text>
              <View style={s.metaWrap}>
                {sheet.extrinsic.map((f, i) => (
                  <View key={i} style={{ flexBasis: "46%", marginBottom: 2 }}>
                    <Text style={s.metaLabel}>{f.label}</Text>
                    <Written size={6.3}>{f.value}</Written>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Part 2 — affective: the rows line up with the rulers at the left, so the numbers carry no name. */}
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <View style={s.frame}>
            <View style={s.partBand}>
              <Text style={s.partBandText}>{t.partAffective}</Text>
            </View>
            {groups.slice(0, 5).map((rows, i) => (
              <AffCell key={i} rows={rows} t={t} minHeight={COMBINED_H[i]} />
            ))}
            {groups[5] ? <AffCell rows={groups[5]} t={t} minHeight={60} /> : null}
            <CupsFoot sheet={sheet} t={t} />
          </View>
        </View>
      </View>

      <SheetFooter t={t} />
    </Page>
  );
}

// ─── Document ───────────────────────────────────────────────────────────────

export type CvaDocumentProps = {
  /** Session owner? Gates physical/extrinsic data inside buildCvaFormData. */
  ownerView: boolean;
  sessionName: string;
  date: string;
  cupperName: string;
  purpose: string;
  cupsPerSample: number;
  format: string;
  locale: Locale;
  /** The sheet shows at least one UNSENT (draft) evaluation: stamp it "Borrador". */
  draft?: boolean;
  /** Defaults to the server clock at render time. */
  generatedAt?: Date;
  samples: {
    label: string;
    revealed: boolean;
    coffeeName: string | null;
    roastLevel: string | null;
    /** A9 prep data, already gated by the caller (sheetSamplePrep). */
    prep?: SamplePrep | null;
    isReference?: boolean;
    referenceRank?: number | null;
    /** "v1" = stored before the 2026-11 rule (lib/scoreRule.ts). */
    scoreRule?: ScoreRule;
    /** A-01: the evaluation was sent (stored isDraft === false); only then is a total printed (lib/ownTotal.ts). Absent = not sent. */
    sent?: boolean;
    descriptive: Record<string, unknown>;
    affective: Record<string, unknown>;
    combined: Record<string, unknown>;
    physical: Record<string, unknown>;
    extrinsic: Record<string, unknown>;
    originEditedAt?: string | null;
  }[];
};

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function CvaFormDocument(props: CvaDocumentProps) {
  // The footer repeats on every page, so the generation stamp (server clock,
  // language, draft marker) travels inside `t` as one extra string.
  const t: Record<string, string> = {
    ...CVA_TEXT[props.locale],
    stampLine: buildStampLine({
      locale: props.locale,
      generatedAt: props.generatedAt ?? new Date(),
      draft: props.draft,
    }),
  };
  const sheets: CvaSampleSheet[] = props.samples.map((sample) => {
    const input: CvaFormInput = {
      format: props.format,
      sessionName: props.sessionName,
      date: props.date,
      cupperName: props.cupperName,
      purpose: props.purpose,
      cupsPerSample: props.cupsPerSample,
      sample,
      locale: props.locale,
      ownerView: props.ownerView,
    };
    return buildCvaFormData(input);
  });

  const title = `CVA · ${props.sessionName}`;

  if (sheets.length === 0) {
    return (
      <Document title={title} author="Café Sensible" language={props.locale}>
        <Page size="A4" style={s.page}>
          <Text style={s.formName}>{props.sessionName}</Text>
          <Text style={{ marginTop: 20, color: SOFT }}>{t.none}</Text>
        </Page>
      </Document>
    );
  }

  const format = sheets[0].format;

  // Affective — two samples side by side per page.
  if (format === "affective") {
    return (
      <Document title={title} author="Café Sensible" language={props.locale}>
        {chunk(sheets, 2).map((pair, i) => (
          <AffectivePage key={i} pair={pair} t={t} />
        ))}
      </Document>
    );
  }

  // Combined — one sample per page.
  if (format === "combined") {
    return (
      <Document title={title} author="Café Sensible" language={props.locale}>
        {sheets.map((sheet, i) => (
          <CombinedPage key={i} sheet={sheet} t={t} />
        ))}
      </Document>
    );
  }

  // Descriptive — two samples per page, stacked.
  return (
    <Document title={title} author="Café Sensible" language={props.locale}>
      {chunk(sheets, 2).map((pair, i) => (
        <Page key={i} size="A4" style={s.page}>
          <PageHead sheet={pair[0]} t={t} formName={t.formDescriptive} />
          {pair.map((sheet, j) => (
            <View key={j} style={j > 0 ? { marginTop: 8 } : {}}>
              <DescriptiveBlock sheet={sheet} t={t} />
            </View>
          ))}
          <SheetFooter t={t} />
        </Page>
      ))}
    </Document>
  );
}
