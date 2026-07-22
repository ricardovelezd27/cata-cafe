// Server-only. Renders one cupper's evaluation of a session as a PDF laid out
// to the geometry of the official SCA CVA paper forms (v1.1, Sept 2023):
//
//   Descriptive — A4 portrait, TWO samples per page, one shared CATA box for
//                 Fragrance+Aroma and one for Flavor+Aftertaste.
//   Affective   — A4 LANDSCAPE, samples as side-by-side columns (3 per page),
//                 impression-of-quality legend across the top, cup rows below.
//   Combined    — A4 landscape, Part 1 descriptive left / Part 2 affective
//                 right / Part 3 extrinsic + score along the bottom.
//
// The official form lists nine descriptor categories with their sub-options
// inline in parentheses ("FRUITY (BERRY  DRIED FRUIT  CITRUS FRUIT)"). Our nine
// L1 wheel groups map onto those rows one-for-one and the L2 subgroups fill the
// parentheses, so the app's full vocabulary lands in the official footprint
// without demoting anything. L3 leaves and qualifying notes ride the box's
// notes line, exactly as buildFlavorGroups assembles them.
//
// This is a DERIVED document, not an SCA publication: the footer says so on
// every page and no SCA copyright line is reproduced. See CVA_TEXT.attribution.
//
// NEVER import this (or @react-pdf/renderer) from a client component. It is
// consumed only by the GET route (app/api/sessions/[id]/cva-pdf/route.ts) and
// lib/closeEmail.ts. Built-in Helvetica/Times handle Spanish accents, so no
// font files ship.

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import {
  buildCvaFormData,
  CVA_TEXT,
  type CvaFormInput,
  type CvaSampleSheet,
  type FlavorGroupRow,
  type CataGroupRow,
  type DescriptiveSheet,
  type StageId,
  type Locale,
} from "./cvaFormData";

// Disable mid-word hyphenation document-wide: react-pdf's default breaker
// splits words like "GLOBAL" into "GLOB-AL" in narrow columns. Paper forms wrap
// at spaces only.
Font.registerHyphenationCallback((word) => [word]);

// ─── Palette — paper-form austerity ─────────────────────────────────────────
const INK = "#111111";
const RULE = "#000000";
const SOFT = "#555555";
const HAIR = "#cfcfcf";
const CREAM = "#f4f0e8";
const RED = "#A83232";
const WHITE = "#FFFFFF";

// Section names echo the official form's serif face (and DESIGN.md's editorial
// Newsreader voice); everything else is the grotesque.
const SERIF = "Times-Roman";
const SERIF_BOLD = "Times-Bold";

const s = StyleSheet.create({
  page: {
    paddingTop: 20,
    paddingBottom: 34,
    paddingHorizontal: 22,
    fontFamily: "Helvetica",
    fontSize: 7,
    color: INK,
    lineHeight: 1.2,
  },

  // ── Header ──
  header: { borderBottom: `1.5pt solid ${RULE}`, paddingBottom: 4, marginBottom: 6 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  wordmark: { fontSize: 6.5, letterSpacing: 1.6, color: SOFT, textTransform: "uppercase" },
  formName: { fontSize: 14, fontFamily: SERIF_BOLD, color: INK, marginTop: 1 },
  brand: { fontSize: 6.5, letterSpacing: 1.4, color: SOFT, textTransform: "uppercase" },
  fieldGrid: { flexDirection: "row", gap: 10, marginTop: 5 },
  field: { flexGrow: 1, flexBasis: 0 },
  fieldLabel: { fontSize: 5.5, letterSpacing: 1.1, color: SOFT, textTransform: "uppercase" },
  fieldValue: {
    fontSize: 8,
    borderBottom: `0.5pt dotted ${SOFT}`,
    minHeight: 11,
    paddingTop: 1.5,
  },

  // ── Footer ──
  footer: {
    position: "absolute",
    left: 22,
    right: 22,
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

  // ── Sample strip ──
  sampleStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    border: `0.75pt solid ${RULE}`,
    backgroundColor: CREAM,
    paddingVertical: 2.5,
    paddingHorizontal: 6,
    marginBottom: 4,
  },
  stripLabel: { fontSize: 5.5, letterSpacing: 1.1, color: SOFT, textTransform: "uppercase" },

  // ── Intensity row ──
  intRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 3 },
  intName: { width: 58, fontSize: 9, fontFamily: SERIF, color: INK, paddingTop: 3 },
  intBody: { flexGrow: 1, flexBasis: 0 },
  intBandRow: { position: "relative", height: 7 },
  intBand: { position: "absolute", fontSize: 5, letterSpacing: 1, color: SOFT },
  intAxis: { position: "relative", height: 12 },
  intCaption: { fontSize: 5, letterSpacing: 0.8, color: SOFT, textTransform: "uppercase" },

  // ── CATA box ──
  cataBox: { border: `0.75pt solid ${RULE}`, marginBottom: 4 },
  cataTitle: {
    fontSize: 5.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    backgroundColor: CREAM,
    borderBottom: `0.5pt solid ${RULE}`,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
  },
  cataBody: { paddingVertical: 3, paddingHorizontal: 5 },
  cataCols: { flexDirection: "row", gap: 8 },
  cataCol: { flexGrow: 1, flexBasis: 0 },
  cataRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginBottom: 1 },
  cataGroupLabel: { fontSize: 6.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  cataSubLabel: { fontSize: 6, color: INK },
  paren: { fontSize: 6, color: SOFT },

  notesRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 2 },
  notesLabel: { fontSize: 5, letterSpacing: 0.9, color: SOFT, textTransform: "uppercase", marginRight: 3, paddingTop: 1 },
  notesText: { fontSize: 6, color: INK, fontStyle: "italic", flexGrow: 1, flexBasis: 0 },
  notesBlank: { borderBottom: `0.5pt dotted ${HAIR}`, height: 8, flexGrow: 1, flexBasis: 0 },

  // ── Affective ──
  legend: {
    flexDirection: "row",
    border: `0.5pt solid ${HAIR}`,
    paddingVertical: 2,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  legendTitle: {
    fontSize: 5.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    marginRight: 6,
  },
  legendItem: { fontSize: 5, color: SOFT, flexGrow: 1, flexBasis: 0, textAlign: "center" },

  grid: { border: `0.75pt solid ${RULE}` },
  gridHeadRow: { flexDirection: "row", borderBottom: `0.75pt solid ${RULE}`, backgroundColor: CREAM },
  gridRow: { flexDirection: "row", borderBottom: `0.5pt solid ${HAIR}` },
  gridRowLast: { flexDirection: "row" },
  rowLabel: {
    width: 76,
    fontSize: 7.5,
    fontFamily: SERIF,
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRight: `0.5pt solid ${HAIR}`,
  },
  rowLabelSm: {
    width: 76,
    fontSize: 5.5,
    letterSpacing: 0.8,
    color: SOFT,
    textTransform: "uppercase",
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRight: `0.5pt solid ${HAIR}`,
  },
  sampleCell: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: 2.5,
    paddingHorizontal: 5,
    borderRight: `0.5pt solid ${HAIR}`,
  },
  sampleCellHead: {
    flexGrow: 1,
    flexBasis: 0,
    paddingVertical: 3,
    paddingHorizontal: 5,
    borderRight: `0.5pt solid ${HAIR}`,
  },

  bubbleRow: { flexDirection: "row", alignItems: "center" },
  bubble: {
    width: 12,
    height: 12,
    borderRadius: 6,
    border: `0.6pt solid ${INK}`,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  bubbleText: { fontSize: 6, fontFamily: "Helvetica-Bold" },
  finalBox: {
    marginLeft: 4,
    border: `0.9pt solid ${INK}`,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    alignItems: "center",
    minWidth: 21,
  },
  finalLabel: { fontSize: 4, letterSpacing: 0.9, color: SOFT },
  finalValue: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  affNotes: { fontSize: 5.5, color: SOFT, fontStyle: "italic", marginTop: 1 },

  cupRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  cupCell: { alignItems: "center", marginRight: 5 },
  cupNum: { fontSize: 4.5, color: SOFT, marginBottom: 0.5 },
  cupBox: { width: 9, height: 9, border: `0.6pt solid ${INK}`, borderRadius: 0.5 },

  scoreValue: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  scoreFormula: { fontSize: 4.5, color: SOFT, fontStyle: "italic", marginTop: 0.5 },

  // ── Part banners / meta ──
  partBanner: {
    fontSize: 6,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    borderBottom: `1pt solid ${RULE}`,
    paddingBottom: 1.5,
    marginBottom: 4,
  },
  metaWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  metaField: { flexBasis: "31%", marginBottom: 2 },
  metaFieldCompact: { flexBasis: "15%", marginBottom: 1 },
  metaLabel: { fontSize: 5, letterSpacing: 0.9, color: SOFT, textTransform: "uppercase" },
  metaValue: { fontSize: 7 },
  metaValueCompact: { fontSize: 6 },
});

// ─── Primitives ─────────────────────────────────────────────────────────────

function CheckBox({ checked, size = 6, color = INK }: { checked: boolean; size?: number; color?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 0.5,
        border: `0.6pt solid ${color}`,
        backgroundColor: checked ? color : WHITE,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 2,
      }}
    >
      {checked ? (
        <Text style={{ color: WHITE, fontSize: size - 1.5, fontFamily: "Helvetica-Bold", lineHeight: 1 }}>
          x
        </Text>
      ) : null}
    </View>
  );
}

/** Label over a dotted rule — the official form's dot-leader fields. */
function DotField({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Text style={s.fieldValue}>{value || " "}</Text>
    </View>
  );
}

/** 0–15 continuous intensity ruler with LOW/MEDIUM/HIGH bands and a marker. */
function IntensityRow({
  name,
  value,
  t,
  compact,
}: {
  name: string;
  value: number | null;
  t: Record<string, string>;
  compact?: boolean;
}) {
  const pct = value === null ? null : (Math.max(0, Math.min(15, value)) / 15) * 100;
  // Compact rows shave ~5pt each so Part 1 of the combined sheet clears the
  // landscape page and leaves room for Part 3.
  const axisTop = compact ? 3 : 4;
  return (
    <View style={[s.intRow, compact ? { marginBottom: 1.5 } : {}]} wrap={false}>
      <Text style={[s.intName, compact ? { fontSize: 8, width: 50, paddingTop: 2 } : {}]}>{name}</Text>
      <View style={s.intBody}>
        <View style={[s.intBandRow, compact ? { height: 5.5 } : {}]}>
          <Text style={[s.intBand, { left: "6%" }]}>{t.low.toUpperCase()}</Text>
          <Text style={[s.intBand, { left: "43%" }]}>{t.medium.toUpperCase()}</Text>
          <Text style={[s.intBand, { left: "84%" }]}>{t.high.toUpperCase()}</Text>
        </View>
        <View style={[s.intAxis, compact ? { height: 9.5 } : {}]}>
          <View
            style={{ position: "absolute", left: 0, right: 0, top: axisTop, height: 0.6, backgroundColor: RULE }}
          />
          {Array.from({ length: 16 }, (_, i) => {
            const major = i % 5 === 0;
            const h = major ? 6 : 3;
            return (
              <View
                key={i}
                style={{
                  position: "absolute",
                  left: `${(i / 15) * 100}%`,
                  top: axisTop - h / 2,
                  width: 0.6,
                  height: h,
                  backgroundColor: RULE,
                }}
              />
            );
          })}
          {[0, 5, 10, 15].map((m) => (
            <Text
              key={m}
              style={{
                position: "absolute",
                left: `${(m / 15) * 100 - 1}%`,
                top: axisTop + 2,
                fontSize: 4.5,
                color: SOFT,
              }}
            >
              {m}
            </Text>
          ))}
          {pct !== null ? (
            <Text
              style={{
                position: "absolute",
                left: `${pct - 1.4}%`,
                top: axisTop - 7.5,
                fontSize: 7,
                fontFamily: "Helvetica-Bold",
                color: INK,
              }}
            >
              {"▼"}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** "NOTAS ......" — carries L3 detail and qualifying terms under a CATA box. */
function NotesLine({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={s.notesRow}>
      <Text style={s.notesLabel}>{label}</Text>
      {items.length > 0 ? (
        <Text style={s.notesText}>{items.join(" · ")}</Text>
      ) : (
        <View style={s.notesBlank} />
      )}
    </View>
  );
}

// ─── CATA rows in the official parenthetical style ──────────────────────────
//
//   [x] FRUITY ( [ ] Berry  [x] Citrus  [ ] Dried fruit )
//
// One row per category, sub-options inline — the exact device the paper form
// uses, which is what lets our richer wheel occupy the official footprint.

type Row = {
  id: string;
  label: string;
  checked: boolean;
  subs: { id: string; label: string; checked: boolean }[];
};

const flavorToRow = (g: FlavorGroupRow): Row => ({
  id: g.id,
  label: g.label,
  checked: g.checked,
  subs: g.subgroups,
});

const cataToRow = (g: CataGroupRow): Row => ({
  id: g.id,
  label: g.label,
  checked: g.checked,
  subs: g.subItems,
});

function CataRow({ row }: { row: Row }) {
  return (
    <View style={s.cataRow}>
      <CheckBox checked={row.checked} size={6} />
      <Text style={s.cataGroupLabel}>{row.label}</Text>
      {row.subs.length > 0 ? (
        <>
          <Text style={[s.paren, { marginLeft: 2, marginRight: 1 }]}>(</Text>
          {row.subs.map((sub) => (
            <View key={sub.id} style={{ flexDirection: "row", alignItems: "center", marginRight: 3 }}>
              <CheckBox checked={sub.checked} size={4.5} />
              <Text style={s.cataSubLabel}>{sub.label}</Text>
            </View>
          ))}
          <Text style={s.paren}>)</Text>
        </>
      ) : null}
    </View>
  );
}

/** A bordered CATA box: caption, rows split into N columns, notes line. */
function CataBox({
  title,
  section,
  rows,
  notes,
  notesLabel,
  columns = 2,
  aside,
  style,
}: {
  title: string;
  /** Section name, when the box is not directly under its own intensity ruler. */
  section?: string;
  rows: Row[];
  notes?: string[];
  notesLabel?: string;
  columns?: number;
  aside?: React.ReactNode;
  /** Flex sizing only, for boxes laid out side by side. */
  style?: { flexGrow?: number; flexBasis?: number };
}) {
  const per = Math.ceil(rows.length / columns);
  const cols = Array.from({ length: columns }, (_, i) => rows.slice(i * per, (i + 1) * per));
  return (
    <View style={[s.cataBox, style ?? {}]} wrap={false}>
      <Text style={s.cataTitle}>{section ? `${section} · ${title}` : title}</Text>
      <View style={[s.cataBody, aside ? { flexDirection: "row", gap: 8 } : {}]}>
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <View style={s.cataCols}>
            {cols.map((col, ci) => (
              <View key={ci} style={s.cataCol}>
                {col.map((row) => (
                  <CataRow key={row.id} row={row} />
                ))}
              </View>
            ))}
          </View>
          {notes && notesLabel ? <NotesLine label={notesLabel} items={notes} /> : null}
        </View>
        {aside}
      </View>
    </View>
  );
}

/** Main tastes — the small box that sits beside Box B on the official form. */
function MainTastesAside({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  return (
    <View style={{ width: 74, borderLeft: `0.5pt solid ${HAIR}`, paddingLeft: 6 }}>
      <Text style={[s.cataTitle, { backgroundColor: "transparent", borderBottom: "none", padding: 0, marginBottom: 2 }]}>
        {t.mainTastesTitle}
      </Text>
      {sheet.basicTastes.map((bt) => (
        <View key={bt.id} style={{ flexDirection: "row", alignItems: "center", marginBottom: 1 }}>
          <CheckBox checked={bt.checked} size={5.5} />
          <Text style={s.cataSubLabel}>{bt.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Affective primitives ───────────────────────────────────────────────────

const QUALITY_KEYS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"];

/** Grid label column is narrow; prefer the short form where one exists. */
const shortLabel = (t: Record<string, string>, key: string) =>
  t[`${key}Short`] ?? t[key] ?? key;

function QualityLegend({ t }: { t: Record<string, string> }) {
  return (
    <View style={s.legend} wrap={false}>
      <Text style={s.legendTitle}>{t.impressionOfQuality}</Text>
      {QUALITY_KEYS.map((k, i) => (
        <Text key={k} style={s.legendItem}>
          {i + 1} {t[k]}
        </Text>
      ))}
    </View>
  );
}

function Bubbles({ value, none }: { value: number | null; none: string }) {
  return (
    <View style={s.bubbleRow}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const on = n === value;
        return (
          <View key={n} style={[s.bubble, on ? { backgroundColor: INK } : {}]}>
            <Text style={[s.bubbleText, on ? { color: WHITE } : {}]}>{n}</Text>
          </View>
        );
      })}
      <View style={s.finalBox}>
        <Text style={s.finalLabel}>FINAL</Text>
        <Text style={s.finalValue}>{value ?? none}</Text>
      </View>
    </View>
  );
}

function CupBoxes({ marks, color = INK }: { marks: boolean[]; color?: string }) {
  return (
    <View style={s.cupRow}>
      {marks.map((on, i) => (
        <View key={i} style={s.cupCell}>
          <Text style={s.cupNum}>{i + 1}</Text>
          <View style={[s.cupBox, on ? { backgroundColor: color, borderColor: color } : {}]} />
        </View>
      ))}
    </View>
  );
}

function ScoreCell({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  return (
    <View>
      <Text style={s.scoreValue}>{sheet.scoreState === "complete" ? sheet.score : t.none}</Text>
      {sheet.scoreState === "complete" ? (
        <Text style={s.scoreFormula}>
          {"Σ"}h={sheet.breakdown.affectiveSum} · u={sheet.breakdown.u} · d={sheet.breakdown.d}
        </Text>
      ) : sheet.scoreState === "partial" ? (
        <Text style={s.scoreFormula}>{t.incomplete}</Text>
      ) : null}
    </View>
  );
}

// ─── Page furniture ─────────────────────────────────────────────────────────

function SheetHeader({
  sheet,
  t,
  formName,
  extraField,
}: {
  sheet: CvaSampleSheet;
  t: Record<string, string>;
  formName: string;
  extraField?: React.ReactNode;
}) {
  const h = sheet.header;
  return (
    <View style={s.header}>
      <View style={s.headerRow}>
        <View>
          <Text style={s.wordmark}>SCA {t.methodology}</Text>
          <Text style={s.formName}>{formName}</Text>
        </View>
        <Text style={s.brand}>Cata Café</Text>
      </View>
      <View style={s.fieldGrid}>
        <DotField label={t.name} value={h.cupperName} />
        <DotField label={t.date} value={h.date} />
        <DotField label={t.purpose} value={h.purpose} />
        <DotField label={t.session} value={h.sessionName} />
        {extraField}
      </View>
    </View>
  );
}

function SheetFooter({ t }: { t: Record<string, string> }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{t.attribution}</Text>
      <Text
        style={s.footerPage}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function SampleStrip({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  const h = sheet.header;
  return (
    <View style={s.sampleStrip}>
      <Text>
        <Text style={s.stripLabel}>{t.sampleNo} </Text>
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{h.sampleLabel}</Text>
      </Text>
      {h.coffeeName ? (
        <Text>
          <Text style={s.stripLabel}>{t.coffee} </Text>
          <Text style={{ fontSize: 8 }}>{h.coffeeName}</Text>
        </Text>
      ) : (
        <Text style={s.stripLabel}>{t.cups}: {h.cupsPerSample}</Text>
      )}
    </View>
  );
}

// ─── Descriptive sample block (half a portrait page) ────────────────────────

function DescriptiveBlock({
  sheet,
  t,
  withStrip = true,
}: {
  sheet: CvaSampleSheet;
  t: Record<string, string>;
  withStrip?: boolean;
}) {
  const d: DescriptiveSheet = sheet.descriptive;
  const int = (id: StageId) => d.intensity[id];
  return (
    <View>
      {withStrip ? <SampleStrip sheet={sheet} t={t} /> : null}

      {/* Fragrance + Aroma share Box A — orthonasal. */}
      <IntensityRow name={t.fragrance} value={int("fragancia")} t={t} />
      <IntensityRow name={t.aroma} value={int("aroma")} t={t} />
      <CataBox
        title={t.selectUpToFive}
        rows={d.boxA.map(flavorToRow)}
        notes={d.boxANotes}
        notesLabel={t.notes}
      />

      {/* Flavor + Aftertaste share Box B — retronasal — with main tastes beside. */}
      <IntensityRow name={t.flavor} value={int("sabor")} t={t} />
      <IntensityRow name={t.aftertaste} value={int("sabor_residual")} t={t} />
      <CataBox
        title={t.selectUpToFive}
        rows={d.boxB.map(flavorToRow)}
        notes={d.boxBNotes}
        notesLabel={t.notes}
        aside={<MainTastesAside sheet={sheet} t={t} />}
      />

      <IntensityRow name={t.acidity} value={int("acidez")} t={t} />
      <CataBox title={t.selectAllApply} rows={d.acidity.map(cataToRow)} columns={2} />

      <IntensityRow name={t.sweetness} value={int("dulzor")} t={t} />
      <CataBox title={t.selectAllApply} rows={d.sweetness.map(cataToRow)} columns={2} />

      <IntensityRow name={t.mouthfeel} value={int("sensacion")} t={t} />
      <CataBox title={t.selectUpToTwo} rows={d.mouthfeel.map(cataToRow)} columns={2} />
    </View>
  );
}

// ─── Affective grid: samples as columns, official landscape layout ──────────

function AffectiveGridPage({
  sheets,
  t,
  formName,
}: {
  sheets: CvaSampleSheet[];
  t: Record<string, string>;
  formName: string;
}) {
  const first = sheets[0];
  const rowCount = first.affectiveRows.length;
  // Keep column width stable when the last page holds fewer than three samples.
  const filler = Math.max(0, 3 - sheets.length);
  const pad = Array.from({ length: filler });

  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <SheetHeader sheet={first} t={t} formName={formName} />
      <QualityLegend t={t} />

      <View style={s.grid}>
        {/* Sample column headings */}
        <View style={s.gridHeadRow}>
          <View style={s.rowLabelSm}>
            <Text>{t.sampleNo}</Text>
          </View>
          {sheets.map((sheet) => (
            <View key={sheet.header.sampleLabel} style={s.sampleCellHead}>
              <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{sheet.header.sampleLabel}</Text>
              {sheet.header.coffeeName ? (
                <Text style={{ fontSize: 6, color: SOFT }}>{sheet.header.coffeeName}</Text>
              ) : null}
            </View>
          ))}
          {pad.map((_, i) => (
            <View key={`p${i}`} style={s.sampleCellHead} />
          ))}
        </View>

        {/* One row per affective attribute, one cell per sample */}
        {first.affectiveRows.map((row, ri) => (
          <View key={row.id} style={ri === rowCount - 1 ? s.gridRowLast : s.gridRow} wrap={false}>
            <Text style={s.rowLabel}>{shortLabel(t, row.labelKey)}</Text>
            {sheets.map((sheet) => {
              const cell = sheet.affectiveRows[ri];
              return (
                <View key={sheet.header.sampleLabel} style={s.sampleCell}>
                  <Bubbles value={cell?.value ?? null} none={t.none} />
                  {cell?.notes ? <Text style={s.affNotes}>{cell.notes}</Text> : null}
                </View>
              );
            })}
            {pad.map((_, i) => (
              <View key={`p${i}`} style={s.sampleCell} />
            ))}
          </View>
        ))}
      </View>

      {/* Uniformity / defects / score band */}
      <View style={[s.grid, { marginTop: 4 }]} wrap={false}>
        <CupBand sheets={sheets} pad={pad} t={t} />
      </View>

      <SheetFooter t={t} />
    </Page>
  );
}

function CupBand({
  sheets,
  pad,
  t,
}: {
  sheets: CvaSampleSheet[];
  pad: unknown[];
  t: Record<string, string>;
}) {
  const rows: {
    key: string;
    label: string;
    render: (sheet: CvaSampleSheet) => React.ReactNode;
  }[] = [
    {
      key: "u",
      label: t.nonUniform,
      render: (sheet) => <CupBoxes marks={sheet.cups.nonUniform} />,
    },
    {
      key: "d",
      label: t.defectiveCups,
      render: (sheet) => <CupBoxes marks={sheet.cups.defective} color={RED} />,
    },
    {
      key: "type",
      label: t.defectIfAny,
      render: (sheet) => (
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {sheet.cups.defectTypes.map((dt) => (
            <View key={dt.id} style={{ flexDirection: "row", alignItems: "center", marginRight: 6 }}>
              <CheckBox checked={dt.checked} size={5.5} color={dt.checked ? RED : INK} />
              <Text style={{ fontSize: 6, color: dt.checked ? RED : INK }}>{dt.label}</Text>
            </View>
          ))}
        </View>
      ),
    },
    {
      key: "score",
      label: t.score,
      render: (sheet) => <ScoreCell sheet={sheet} t={t} />,
    },
  ];

  return (
    <>
      {rows.map((r, i) => (
        <View key={r.key} style={i === rows.length - 1 ? s.gridRowLast : s.gridRow}>
          <Text style={s.rowLabelSm}>{r.label}</Text>
          {sheets.map((sheet) => (
            <View key={sheet.header.sampleLabel} style={s.sampleCell}>
              {r.render(sheet)}
            </View>
          ))}
          {pad.map((_, pi) => (
            <View key={`p${pi}`} style={s.sampleCell} />
          ))}
        </View>
      ))}
    </>
  );
}

// ─── Combined: Part 1 left / Part 2 right / Part 3 bottom (landscape) ───────

function CombinedPage({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  const d = sheet.descriptive;
  const int = (id: StageId) => d.intensity[id];
  return (
    <Page size="A4" orientation="landscape" style={s.page}>
      <SheetHeader sheet={sheet} t={t} formName={t.formCombined} />
      <SampleStrip sheet={sheet} t={t} />

      <View style={{ flexDirection: "row", gap: 10 }}>
        {/* Part 1 — descriptive */}
        <View style={{ flexGrow: 1, flexBasis: 0 }}>
          <Text style={s.partBanner}>{t.partDescriptive}</Text>
          <IntensityRow name={t.fragrance} value={int("fragancia")} t={t} compact />
          <IntensityRow name={t.aroma} value={int("aroma")} t={t} compact />
          <CataBox
            title={t.selectUpToFive}
            rows={d.boxA.map(flavorToRow)}
            notes={d.boxANotes}
            notesLabel={t.notes}
          />
          <IntensityRow name={t.flavor} value={int("sabor")} t={t} compact />
          <IntensityRow name={t.aftertaste} value={int("sabor_residual")} t={t} compact />
          <CataBox
            title={t.selectUpToFive}
            rows={d.boxB.map(flavorToRow)}
            notes={d.boxBNotes}
            notesLabel={t.notes}
            aside={<MainTastesAside sheet={sheet} t={t} />}
          />
          <IntensityRow name={t.acidity} value={int("acidez")} t={t} compact />
          <IntensityRow name={t.sweetness} value={int("dulzor")} t={t} compact />
          <IntensityRow name={t.mouthfeel} value={int("sensacion")} t={t} compact />
          {/* The last three CATA lists run across rather than stacked — Part 1
              otherwise overflows the landscape page. */}
          <View style={{ flexDirection: "row", gap: 5 }}>
            {/* Acidity is a flat 10-term list — two columns keep it five rows
                tall, matching the other two boxes. */}
            <CataBox
              section={t.acidity}
              title={t.selectAllApply}
              rows={d.acidity.map(cataToRow)}
              columns={2}
              style={{ flexGrow: 1.6, flexBasis: 0 }}
            />
            <CataBox
              section={t.sweetness}
              title={t.selectAllApply}
              rows={d.sweetness.map(cataToRow)}
              columns={1}
              style={{ flexGrow: 1, flexBasis: 0 }}
            />
            <CataBox
              section={t.mouthfeel}
              title={t.selectUpToTwo}
              rows={d.mouthfeel.map(cataToRow)}
              columns={1}
              style={{ flexGrow: 1, flexBasis: 0 }}
            />
          </View>
        </View>

        {/* Part 2 — affective. Sized to the bubble row + FINAL box; any wider
            just steals wrapping room from Part 1's CATA lists. */}
        <View style={{ width: 182 }}>
          <Text style={s.partBanner}>{t.partAffective}</Text>
          <View style={s.grid}>
            {sheet.affectiveRows.map((row, i) => (
              <View
                key={row.id}
                style={i === sheet.affectiveRows.length - 1 ? s.gridRowLast : s.gridRow}
                wrap={false}
              >
                <View style={{ paddingVertical: 3, paddingHorizontal: 4, flexGrow: 1, flexBasis: 0 }}>
                  <Text style={{ fontSize: 8, fontFamily: SERIF, marginBottom: 1.5 }}>
                    {t[row.labelKey] ?? row.labelKey}
                  </Text>
                  <Bubbles value={row.value} none={t.none} />
                  {row.notes ? <Text style={s.affNotes}>{row.notes}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {/* Uniformity / defects / score */}
          <View style={[s.cataBox, { marginTop: 4 }]} wrap={false}>
            <View style={s.cataBody}>
              <Text style={s.intCaption}>{t.nonUniform}</Text>
              <CupBoxes marks={sheet.cups.nonUniform} />
              <Text style={[s.intCaption, { marginTop: 3 }]}>{t.defectiveCups}</Text>
              <CupBoxes marks={sheet.cups.defective} color={RED} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 3 }}>
                {sheet.cups.defectTypes.map((dt) => (
                  <View key={dt.id} style={{ flexDirection: "row", alignItems: "center", marginRight: 6 }}>
                    <CheckBox checked={dt.checked} size={5.5} color={dt.checked ? RED : INK} />
                    <Text style={{ fontSize: 6, color: dt.checked ? RED : INK }}>{dt.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              border: `1.25pt solid ${INK}`,
              paddingVertical: 3,
              paddingHorizontal: 6,
              marginTop: 4,
            }}
            wrap={false}
          >
            <Text style={s.intCaption}>{t.score}</Text>
            <ScoreCell sheet={sheet} t={t} />
          </View>
        </View>
      </View>

      {/* Part 3 — extrinsic */}
      {/* Part 3 (extrinsic) lives on the shared appendix page, not here: our
          descriptor vocabulary makes Part 1 roughly twice the official form's
          height, so nothing else fits on the landscape sheet. Keeping extrinsic
          on a separate page also matches the CVA's own guidance to record it
          apart from the sensory assessment to avoid bias. */}

      <SheetFooter t={t} />
    </Page>
  );
}

function MetaFields({
  fields,
  compact,
}: {
  fields: { label: string; value: string }[];
  compact?: boolean;
}) {
  if (fields.length === 0) {
    return (
      <View>
        {[0, 1].map((i) => (
          <View key={i} style={{ borderBottom: `0.5pt dotted ${HAIR}`, height: 10 }} />
        ))}
      </View>
    );
  }
  return (
    <View style={s.metaWrap}>
      {fields.map((f, i) => (
        <View key={i} style={compact ? s.metaFieldCompact : s.metaField}>
          <Text style={s.metaLabel}>{f.label}</Text>
          <Text style={compact ? s.metaValueCompact : s.metaValue}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Bordered block for physical / extrinsic data on the standalone sheets. */
function MetaBlock({
  title,
  fields,
}: {
  title: string;
  fields: { label: string; value: string }[];
}) {
  if (fields.length === 0) return null;
  return (
    <View style={s.cataBox} wrap={false}>
      <Text style={s.cataTitle}>{title}</Text>
      <View style={s.cataBody}>
        <MetaFields fields={fields} />
      </View>
    </View>
  );
}

/**
 * Physical + extrinsic data for every sample, on one appendix page. All three
 * formats share it: the sensory sheets stay at official density, and extrinsic
 * data stays visually separate from the assessment, as the CVA intends.
 */
function MetaAppendix({
  sheets,
  t,
  formName,
}: {
  sheets: CvaSampleSheet[];
  t: Record<string, string>;
  formName: string;
}) {
  const withData = sheets.filter((sh) => sh.physical.length + sh.extrinsic.length > 0);
  if (withData.length === 0) return null;
  return (
    <Page size="A4" style={s.page}>
      <SheetHeader sheet={sheets[0]} t={t} formName={formName} />
      <Text style={s.partBanner}>{t.partExtrinsic}</Text>
      {withData.map((sheet, i) => (
        <View key={i} wrap={false}>
          <SampleStrip sheet={sheet} t={t} />
          <MetaBlock title={t.physical} fields={sheet.physical} />
          <MetaBlock title={t.extrinsic} fields={sheet.extrinsic} />
        </View>
      ))}
      <SheetFooter t={t} />
    </Page>
  );
}

// ─── Document ───────────────────────────────────────────────────────────────

export type CvaDocumentProps = {
  sessionName: string;
  date: string;
  cupperName: string;
  purpose: string;
  cupsPerSample: number;
  format: string;
  locale: Locale;
  samples: {
    label: string;
    revealed: boolean;
    coffeeName: string | null;
    descriptive: Record<string, unknown>;
    affective: Record<string, unknown>;
    combined: Record<string, unknown>;
    physical: Record<string, unknown>;
    extrinsic: Record<string, unknown>;
  }[];
};

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export function CvaFormDocument(props: CvaDocumentProps) {
  const t = CVA_TEXT[props.locale];
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
    };
    return buildCvaFormData(input);
  });

  const title = `CVA · ${props.sessionName}`;

  if (sheets.length === 0) {
    return (
      <Document title={title} author="Cata Café">
        <Page size="A4" style={s.page}>
          <Text style={s.formName}>{props.sessionName}</Text>
          <Text style={{ marginTop: 20, color: SOFT }}>{t.none}</Text>
        </Page>
      </Document>
    );
  }

  const format = sheets[0].format;

  // Affective — landscape, samples as columns, three per page.
  if (format === "affective") {
    return (
      <Document title={title} author="Cata Café">
        {chunk(sheets, 3).map((group, i) => (
          <AffectiveGridPage key={i} sheets={group} t={t} formName={t.formAffective} />
        ))}
        <MetaAppendix sheets={sheets} t={t} formName={t.formAffective} />
      </Document>
    );
  }

  // Combined — landscape, one sample per page, extrinsic on the appendix.
  if (format === "combined") {
    return (
      <Document title={title} author="Cata Café">
        {sheets.map((sheet, i) => (
          <CombinedPage key={i} sheet={sheet} t={t} />
        ))}
        <MetaAppendix sheets={sheets} t={t} formName={t.formCombined} />
      </Document>
    );
  }

  // Descriptive — portrait, two samples per page.
  return (
    <Document title={title} author="Cata Café">
      {chunk(sheets, 2).map((pair, i) => (
        <Page key={i} size="A4" style={s.page}>
          <SheetHeader sheet={pair[0]} t={t} formName={t.formDescriptive} />
          {pair.map((sheet, j) => (
            <View key={j} style={j > 0 ? { marginTop: 6 } : {}}>
              <DescriptiveBlock sheet={sheet} t={t} />
            </View>
          ))}
          <SheetFooter t={t} />
        </Page>
      ))}
      <MetaAppendix sheets={sheets} t={t} formName={t.formDescriptive} />
    </Document>
  );
}
