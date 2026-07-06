// Server-only. Renders one cupper's evaluation of a session as a PDF that
// faithfully replicates the official SCA CVA paper cupping form — group /
// subgroup checkboxes, qualifying notes on the category's notes line, affective
// 1–9 scales, uniformity/defect cup rows, and the final score box.
//
// NEVER import this (or @react-pdf/renderer) from a client component. It is
// consumed only by the GET route (app/api/sessions/[id]/cva-pdf/route.ts) and
// the throwaway render script. Paper-form austerity: black rules, checkbox
// squares, built-in Helvetica (handles Spanish accents — no font files).

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
  type DescriptorStageModel,
  type Locale,
} from "./cvaFormData";

// Disable mid-word hyphenation document-wide: react-pdf's default breaker
// splits words like "GLOBAL" into "GLOB-AL" in narrow columns. Paper forms wrap
// at spaces only.
Font.registerHyphenationCallback((word) => [word]);

// ─── Palette — restrained, paper-form austerity ─────────────────────────────
const INK = "#111111";
const RULE = "#000000";
const SOFT = "#555555";
const HAIR = "#cfcfcf";
const CREAM = "#f4f0e8";
const RED = "#A83232";
const WHITE = "#FFFFFF";

const s = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 28,
    paddingHorizontal: 26,
    fontFamily: "Helvetica",
    fontSize: 8,
    color: INK,
    lineHeight: 1.25,
  },
  // Header
  headerBox: { borderBottom: `2pt solid ${RULE}`, paddingBottom: 5, marginBottom: 7 },
  headerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  spec: { fontSize: 6.5, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", color: INK },
  badge: {
    border: `1pt solid ${RULE}`,
    paddingVertical: 2,
    paddingHorizontal: 7,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  metaRow: { flexDirection: "row", marginTop: 5, gap: 10 },
  metaCell: { flexGrow: 1, flexBasis: 0 },
  metaLabel: { fontSize: 6, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },
  metaValue: { fontSize: 8.5, borderBottom: `0.5pt solid ${RULE}`, minHeight: 11, paddingTop: 1 },

  // Sample strip
  sampleStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    border: `1pt solid ${RULE}`,
    backgroundColor: CREAM,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  sampleLabel: { fontSize: 6, letterSpacing: 1, color: SOFT, textTransform: "uppercase" },

  // Section framing
  sectionHead: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    backgroundColor: CREAM,
    borderTop: `1pt solid ${RULE}`,
    borderBottom: `0.5pt solid ${RULE}`,
    paddingVertical: 2,
    paddingHorizontal: 5,
  },
  block: { border: `0.75pt solid ${RULE}`, marginBottom: 6 },
  blockPad: { paddingVertical: 4, paddingHorizontal: 6 },

  stageLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  stageLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },

  // Intensity ruler
  intWrap: { marginTop: 2, marginBottom: 3 },
  intBand: { flexDirection: "row", justifyContent: "space-between" },
  intBandLabel: { fontSize: 5.5, color: SOFT, letterSpacing: 0.8 },
  intAxis: { position: "relative", height: 12, marginTop: 1 },

  // Checkbox rows
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 3, marginBottom: 0.8 },
  boxOuter: { width: 7, height: 7, borderRadius: 0.5, marginTop: 0.5 },
  groupLabel: { fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  subLabel: { fontSize: 7 },
  notesInline: { fontSize: 6.8, color: SOFT, fontStyle: "italic" },
  notesLineLabel: { fontSize: 6, letterSpacing: 0.8, color: SOFT, textTransform: "uppercase", marginRight: 3 },
  dottedLine: { borderBottom: `0.5pt dotted ${HAIR}`, height: 8, marginTop: 1 },

  // Two-column flavor grid
  twoCol: { flexDirection: "row", gap: 8 },
  col: { flexGrow: 1, flexBasis: 0 },

  // Affective rows
  affRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottom: `0.5pt solid ${HAIR}`,
    paddingVertical: 2.5,
    paddingHorizontal: 5,
  },
  affLabel: { width: 82, fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  bubbleRow: { flexDirection: "row", alignItems: "center", gap: 2.5 },
  bubble: {
    width: 12,
    height: 12,
    borderRadius: 6,
    border: `0.75pt solid ${INK}`,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleText: { fontSize: 6.5, fontFamily: "Helvetica-Bold" },
  finalBox: {
    marginLeft: 5,
    border: `1pt solid ${INK}`,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: "center",
    minWidth: 22,
  },
  finalLabel: { fontSize: 4.5, letterSpacing: 1, color: SOFT },
  finalValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  affNotes: { fontSize: 6.5, color: SOFT, fontStyle: "italic", marginTop: 1 },

  // Cups
  cupCol: { flexGrow: 1, flexBasis: 0 },
  cupGrid: { flexDirection: "row", gap: 6, marginTop: 2 },
  cupCell: { alignItems: "center" },
  cupNum: { fontSize: 5.5, color: SOFT, marginBottom: 1 },
  cupBox: { width: 11, height: 11, border: `0.75pt solid ${INK}`, borderRadius: 0.5 },

  // Score box
  scoreBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    border: `1.25pt solid ${INK}`,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  scoreLabel: { fontSize: 7, letterSpacing: 1, textTransform: "uppercase", color: SOFT },
  scoreFormula: { fontSize: 5.5, color: SOFT, fontStyle: "italic", marginTop: 1 },
  scoreValue: { fontSize: 18, fontFamily: "Helvetica-Bold" },

  // Extrinsic / physical
  metaBlockRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaField: { flexBasis: "30%", marginBottom: 2 },
  betaTag: {
    fontSize: 5.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    color: WHITE,
    backgroundColor: SOFT,
    paddingHorizontal: 3,
    paddingVertical: 0.5,
    borderRadius: 1,
  },
});

// ─── Primitives ─────────────────────────────────────────────────────────────

function CheckBox({ checked, size = 7 }: { checked: boolean; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 0.5,
        marginTop: 0.5,
        border: `0.75pt solid ${INK}`,
        backgroundColor: checked ? INK : WHITE,
        alignItems: "center",
        justifyContent: "center",
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

function IntensityRuler({ value, t }: { value: number | null; t: Record<string, string> }) {
  // 0–15 horizontal ruler with major ticks at 0/5/10/15 and a marker.
  const pct = value === null ? null : (Math.max(0, Math.min(15, value)) / 15) * 100;
  return (
    <View style={s.intWrap}>
      <View style={s.intBand}>
        <Text style={s.intBandLabel}>{t.low}</Text>
        <Text style={s.intBandLabel}>{t.medium}</Text>
        <Text style={s.intBandLabel}>{t.high}</Text>
      </View>
      <View style={s.intAxis}>
        {/* axis line */}
        <View style={{ position: "absolute", left: 0, right: 0, top: 6, height: 0.75, backgroundColor: RULE }} />
        {Array.from({ length: 16 }, (_, i) => {
          const major = i % 5 === 0;
          const h = major ? 7 : 3.5;
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: `${(i / 15) * 100}%`,
                top: 6 - h / 2,
                width: 0.75,
                height: h,
                backgroundColor: RULE,
              }}
            />
          );
        })}
        {[0, 5, 10, 15].map((m) => (
          <Text
            key={m}
            style={{ position: "absolute", left: `${(m / 15) * 100 - 1.5}%`, top: 6, fontSize: 5, color: SOFT }}
          >
            {m}
          </Text>
        ))}
        {pct !== null ? (
          <Text
            style={{
              position: "absolute",
              left: `${pct - 1.5}%`,
              top: -2,
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: INK,
            }}
          >
            {"▼"}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function NotesLine({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 1.5 }}>
      <Text style={s.notesLineLabel}>{label}:</Text>
      {items.length > 0 ? (
        <Text style={[s.notesInline, { flexGrow: 1, flexBasis: 0 }]}>{items.join(", ")}</Text>
      ) : (
        <View style={[s.dottedLine, { flexGrow: 1, flexBasis: 0 }]} />
      )}
    </View>
  );
}

// ─── Flavor checkbox grid (one descriptive stage) ───────────────────────────

function FlavorGrid({
  groups,
  t,
}: {
  groups: FlavorGroupRow[];
  t: Record<string, string>;
}) {
  // Split the 9 L1 groups into two balanced columns.
  const mid = Math.ceil(groups.length / 2);
  const cols = [groups.slice(0, mid), groups.slice(mid)];
  return (
    <View style={s.twoCol}>
      {cols.map((col, ci) => (
        <View key={ci} style={s.col}>
          {col.map((g) => (
            <View key={g.id} style={{ marginBottom: 2.5 }}>
              <View style={s.checkRow}>
                <CheckBox checked={g.checked} />
                <Text style={s.groupLabel}>{g.label}</Text>
              </View>
              <View style={{ paddingLeft: 8 }}>
                {g.subgroups.map((sub) => (
                  <View key={sub.id} style={s.checkRow}>
                    <CheckBox checked={sub.checked} size={6} />
                    <Text style={s.subLabel}>{sub.label}</Text>
                  </View>
                ))}
                {g.notesLine.length > 0 ? <NotesLine label={t.notes} items={g.notesLine} /> : null}
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Flat CATA checkbox grid (acidity / sweetness / mouthfeel) ──────────────

function CataGrid({ groups, t }: { groups: CataGroupRow[]; t: Record<string, string> }) {
  return (
    <View style={s.twoCol}>
      {[groups.slice(0, Math.ceil(groups.length / 2)), groups.slice(Math.ceil(groups.length / 2))].map(
        (col, ci) => (
          <View key={ci} style={s.col}>
            {col.map((g) => (
              <View key={g.id} style={{ marginBottom: 2 }}>
                <View style={s.checkRow}>
                  <CheckBox checked={g.checked} />
                  <Text style={s.groupLabel}>{g.label}</Text>
                </View>
                {g.subItems.length > 0 ? (
                  <View style={{ paddingLeft: 8 }}>
                    {g.subItems.map((sub) => (
                      <View key={sub.id} style={s.checkRow}>
                        <CheckBox checked={sub.checked} size={6} />
                        <Text style={s.subLabel}>{sub.label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {g.notesLine.length > 0 ? (
                  <View style={{ paddingLeft: 8 }}>
                    <NotesLine label={t.notes} items={g.notesLine} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )
      )}
    </View>
  );
}

// ─── One descriptor stage (intensity + checkbox grid + free notes) ──────────

function DescriptorStage({
  stage,
  t,
}: {
  stage: DescriptorStageModel;
  t: Record<string, string>;
}) {
  return (
    <View style={s.block} wrap={false}>
      <Text style={s.sectionHead}>{t[stage.labelKey]}</Text>
      <View style={s.blockPad}>
        <View style={s.stageLabelRow}>
          <Text style={{ fontSize: 6.5, color: SOFT, letterSpacing: 0.8, textTransform: "uppercase" }}>
            {t.intensity}
          </Text>
        </View>
        <IntensityRuler value={stage.intensity} t={t} />
        {stage.kind === "flavor" && stage.flavorGroups ? (
          <FlavorGrid groups={stage.flavorGroups} t={t} />
        ) : null}
        {stage.kind === "cata" && stage.cataGroups ? (
          <CataGrid groups={stage.cataGroups} t={t} />
        ) : null}
        {stage.freeNotes ? (
          <View style={{ marginTop: 2 }}>
            <NotesLine label={t.notes} items={[stage.freeNotes]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Affective attribute row (1–9 bubbles + final box + notes) ──────────────

function AffectiveRowView({
  labelKey,
  value,
  notes,
  t,
  last,
}: {
  labelKey: string;
  value: number | null;
  notes: string;
  t: Record<string, string>;
  last?: boolean;
}) {
  return (
    <View style={[s.affRow, last ? { borderBottom: "none" } : {}]}>
      <Text style={s.affLabel}>{t[labelKey] ?? labelKey}</Text>
      <View style={{ flexGrow: 1, flexBasis: 0 }}>
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
            <Text style={s.finalValue}>{value ?? t.none}</Text>
          </View>
        </View>
        {notes ? <Text style={s.affNotes}>{notes}</Text> : null}
      </View>
    </View>
  );
}

// ─── Cups (uniformity + defects) ────────────────────────────────────────────

function CupsBlock({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  const { cups } = sheet;
  return (
    <View style={[s.block, { flexDirection: "row" }]} wrap={false}>
      <View style={[s.cupCol, s.blockPad]}>
        <Text style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", color: SOFT }}>
          {t.uniformity} {cups.u > 0 ? `(-2 x ${cups.u})` : ""}
        </Text>
        <View style={s.cupGrid}>
          {cups.nonUniform.map((on, i) => (
            <View key={i} style={s.cupCell}>
              <Text style={s.cupNum}>{i + 1}</Text>
              <View style={[s.cupBox, on ? { backgroundColor: INK } : {}]} />
            </View>
          ))}
        </View>
      </View>
      <View style={[s.cupCol, s.blockPad, { borderLeft: `0.5pt solid ${HAIR}` }]}>
        <Text style={{ fontSize: 6.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase", color: SOFT }}>
          {t.defects} {cups.d > 0 ? `(-4 x ${cups.d})` : ""}
        </Text>
        <View style={s.cupGrid}>
          {cups.defective.map((on, i) => (
            <View key={i} style={s.cupCell}>
              <Text style={s.cupNum}>{i + 1}</Text>
              <View style={[s.cupBox, on ? { backgroundColor: RED, borderColor: RED } : {}]} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 3 }}>
          {cups.defectTypes.map((dt) => (
            <View key={dt.id} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <CheckBox checked={dt.checked} size={6} />
              <Text style={{ fontSize: 6.5, color: dt.checked ? RED : INK }}>{dt.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ─── Score box ──────────────────────────────────────────────────────────────

function ScoreBox({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  // Only a COMPLETE evaluation (all 8 finals) prints a total + intermediates —
  // calcAffectiveSum's neutral-5 substitution would otherwise fabricate a
  // number (e.g. 79.00 from an entirely empty form). Partial evaluations get
  // an explicit "evaluación incompleta" note; empty ones stay blank, like an
  // unfilled paper form. See CvaSampleSheet.scoreState.
  return (
    <View style={s.scoreBox} wrap={false}>
      <View>
        <Text style={s.scoreLabel}>{t.score}</Text>
        {sheet.scoreState === "complete" ? (
          <Text style={s.scoreFormula}>
            0.65625 x {"Σ"}h + 52.75 - 2u - 4d ({"Σ"}h={sheet.breakdown.affectiveSum}, u=
            {sheet.breakdown.u}, d={sheet.breakdown.d})
          </Text>
        ) : sheet.scoreState === "partial" ? (
          <Text style={s.scoreFormula}>{t.incomplete}</Text>
        ) : null}
      </View>
      <Text style={s.scoreValue}>{sheet.scoreState === "complete" ? sheet.score : t.none}</Text>
    </View>
  );
}

// ─── Extrinsic / physical labeled block ─────────────────────────────────────

function MetaBlock({
  title,
  fields,
  t,
}: {
  title: string;
  fields: { label: string; value: string }[];
  t: Record<string, string>;
}) {
  if (fields.length === 0) return null;
  return (
    <View style={s.block} wrap={false}>
      <View style={[s.sectionHead, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
        <Text>{title}</Text>
        <Text style={s.betaTag}>{t.beta}</Text>
      </View>
      <View style={[s.blockPad, s.metaBlockRow]}>
        {fields.map((f, i) => (
          <View key={i} style={s.metaField}>
            <Text style={s.metaLabel}>{f.label}</Text>
            <Text style={{ fontSize: 8 }}>{f.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Sheet header ───────────────────────────────────────────────────────────

function SheetHeaderView({
  sheet,
  t,
  formatBadge,
  specSuffix,
}: {
  sheet: CvaSampleSheet;
  t: Record<string, string>;
  formatBadge: string;
  specSuffix: string;
}) {
  const h = sheet.header;
  return (
    <View>
      <View style={s.headerBox}>
        <View style={s.headerTopRow}>
          <View>
            <Text style={s.spec}>
              {t.spec} · {specSuffix}
            </Text>
            <Text style={s.title}>{h.sessionName}</Text>
          </View>
          <Text style={s.badge}>{formatBadge}</Text>
        </View>
        <View style={s.metaRow}>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>{t.cupper}</Text>
            <Text style={s.metaValue}>{h.cupperName || " "}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>{t.date}</Text>
            <Text style={s.metaValue}>{h.date || " "}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>{t.cups}</Text>
            <Text style={s.metaValue}>{String(h.cupsPerSample)}</Text>
          </View>
          {h.purpose ? (
            <View style={s.metaCell}>
              <Text style={s.metaLabel}>{t.purpose}</Text>
              <Text style={s.metaValue}>{h.purpose}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={s.sampleStrip}>
        <Text>
          <Text style={s.sampleLabel}>{t.sample}: </Text>
          <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>{h.sampleLabel}</Text>
        </Text>
        {h.coffeeName ? (
          <Text>
            <Text style={s.sampleLabel}>{t.coffee}: </Text>
            <Text style={{ fontSize: 9 }}>{h.coffeeName}</Text>
          </Text>
        ) : (
          <Text style={{ fontSize: 6.5, color: SOFT, fontStyle: "italic" }} />
        )}
      </View>
    </View>
  );
}

// ─── Descriptive sheet body (fragrance/aroma → flavor/aftertaste → basic
//     tastes → acidity → sweetness → mouthfeel), matching the paper form order ─

function DescriptiveBody({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  return (
    <View>
      {sheet.descriptorStages.map((stage) => (
        <View key={stage.id}>
          <DescriptorStage stage={stage} t={t} />
          {/* Basic tastes sit right after Aftertaste on the official form. */}
          {stage.id === "sabor_residual" ? <BasicTastes sheet={sheet} t={t} /> : null}
        </View>
      ))}
    </View>
  );
}

function BasicTastes({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  return (
    <View style={s.block} wrap={false}>
      <Text style={s.sectionHead}>{t.basicTastes}</Text>
      <View style={[s.blockPad, { flexDirection: "row", flexWrap: "wrap", gap: 10 }]}>
        {sheet.basicTastes.map((bt) => (
          <View key={bt.id} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <CheckBox checked={bt.checked} />
            <Text style={s.subLabel}>{bt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Affective sheet body (8 attributes + uniformity/defects + score) ───────

function AffectiveBody({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  return (
    <View>
      <Text style={{ fontSize: 6.5, color: SOFT, fontStyle: "italic", marginBottom: 3 }}>{t.scale9}</Text>
      <View style={s.block}>
        {sheet.affectiveRows.map((row, i) => (
          <AffectiveRowView
            key={row.id}
            labelKey={row.labelKey}
            value={row.value}
            notes={row.notes}
            t={t}
            last={i === sheet.affectiveRows.length - 1}
          />
        ))}
      </View>
      {sheet.cups.cupsPerSample >= 2 ? <CupsBlock sheet={sheet} t={t} /> : null}
      <ScoreBox sheet={sheet} t={t} />
    </View>
  );
}

// ─── Per-sample pages ───────────────────────────────────────────────────────

function SampleSheet({ sheet, t }: { sheet: CvaSampleSheet; t: Record<string, string> }) {
  const formatBadge =
    sheet.format === "affective" ? t.affective : sheet.format === "combined" ? t.combined : t.descriptive;

  if (sheet.format === "descriptive") {
    return (
      <Page size="A4" style={s.page}>
        <SheetHeaderView sheet={sheet} t={t} formatBadge={formatBadge} specSuffix={t.sheetDescriptive} />
        <DescriptiveBody sheet={sheet} t={t} />
        <MetaBlock title={t.physical} fields={sheet.physical} t={t} />
        <MetaBlock title={t.extrinsic} fields={sheet.extrinsic} t={t} />
      </Page>
    );
  }

  if (sheet.format === "affective") {
    return (
      <Page size="A4" style={s.page}>
        <SheetHeaderView sheet={sheet} t={t} formatBadge={formatBadge} specSuffix={t.sheetAffective} />
        <AffectiveBody sheet={sheet} t={t} />
        <MetaBlock title={t.physical} fields={sheet.physical} t={t} />
        <MetaBlock title={t.extrinsic} fields={sheet.extrinsic} t={t} />
      </Page>
    );
  }

  // Combined — descriptive sheet followed by affective sheet content (the way
  // the app's combined format merges the two into one evaluation).
  return (
    <Page size="A4" style={s.page}>
      <SheetHeaderView sheet={sheet} t={t} formatBadge={formatBadge} specSuffix={t.combined} />
      <Text style={s.sectionHead}>{t.partDescriptive}</Text>
      <View style={{ marginTop: 4 }}>
        <DescriptiveBody sheet={sheet} t={t} />
      </View>
      <Text style={[s.sectionHead, { marginTop: 2 }]} break>
        {t.partAffective}
      </Text>
      <View style={{ marginTop: 4 }}>
        <AffectiveBody sheet={sheet} t={t} />
      </View>
      <MetaBlock title={t.physical} fields={sheet.physical} t={t} />
      <MetaBlock title={t.extrinsic} fields={sheet.extrinsic} t={t} />
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

  return (
    <Document title={`CVA · ${props.sessionName}`} author="Cata Café">
      {sheets.length === 0 ? (
        <Page size="A4" style={s.page}>
          <Text style={s.title}>{props.sessionName}</Text>
          <Text style={{ marginTop: 20, color: SOFT }}>—</Text>
        </Page>
      ) : (
        sheets.map((sheet, i) => <SampleSheet key={i} sheet={sheet} t={t} />)
      )}
    </Document>
  );
}
