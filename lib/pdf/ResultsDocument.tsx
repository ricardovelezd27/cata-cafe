// Server-only. The "results of the page" PDF (package OR-E part 3): the "Por café"
// view of the results page, drawn in the page's order and look: the header, the
// coffee that came first, the ranking on its fixed scale, the coffees one by one,
// "Comparar", and the small facts. It draws; it does not decide: WHAT each part
// shows for this viewer is `buildResultsPdfModel` (lib/reports/resultsPdf.ts),
// the page's own models, and the route gates the viewer before it builds.
//
// NEVER import this (or @react-pdf/renderer) from a client component.

import { Document, Page, View, Text, StyleSheet, Svg, Line, Circle, Path } from "@react-pdf/renderer";
import { fillPattern } from "@/lib/fillPattern";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import { referenceBadgeText } from "@/lib/referenceRules";
import type { CoffeeCard, QualityRow } from "@/lib/reports/coffeeCards";
import { rankStripRow, scoreAxis, SCORE_SCALE, countBar } from "@/lib/resultsScales";
import { formatScore, formatSigned } from "@/lib/scoreFormat";
import type { CardsStrings } from "@/components/results/cardsStrings";
import type { OverviewStrings } from "@/components/results/overviewStrings";
import type { ResultsPartsStrings } from "@/components/results/partsStrings";
import { scoreLines, type ResultsPdfModel, type ResultsPdfSample } from "@/lib/reports/resultsPdf";
import { PdfCountedList, PdfFlavorCompare, PdfFlavorWheel } from "./charts";
import { registerPdfFonts, SANS, SERIF } from "./fonts";
import { PDF_PALETTE } from "./palette";
import { ReportStamp } from "./sections/ReportStamp";
import { sanitizePdfText } from "./text";

registerPdfFonts();

type Locale = "es" | "en";

/** Every word of the file: the page's own (`results.*`), built by the route. */
export type ResultsPdfStrings = {
  /** "Resultados · 12 de noviembre de 2026 · Cerrada el …": the line under the title. */
  facts: string;
  overview: OverviewStrings;
  cards: CardsStrings;
  parts: ResultsPartsStrings;
  familyLabels: Record<WheelFamilyId, string>;
  /** Every wheel node's name in the reader's language. */
  nodeLabels: Readonly<Record<string, string>>;
  /** The footer's attribution line. */
  attribution: string;
};

const { ink: INK, soft: SOFT, hair: HAIR, mine: MINE, community: GROUP, grid: GRID } = PDF_PALETTE;
const PAGE_PAD = 36;
const CONTENT_W = 595.28 - PAGE_PAD * 2;
const CARD_PAD = 10;

const s = StyleSheet.create({
  page: { paddingTop: PAGE_PAD, paddingBottom: 64, paddingHorizontal: PAGE_PAD, fontFamily: SANS, fontSize: 9, color: INK },
  facts: { fontSize: 8, color: SOFT, marginTop: 4 },
  title: { fontFamily: SERIF, fontWeight: 700, fontSize: 22, lineHeight: 1.1 },
  rule: { borderBottom: `0.75pt solid ${INK}`, marginTop: 10, marginBottom: 12 },

  tile: { border: `0.75pt solid ${HAIR}`, padding: CARD_PAD, marginBottom: 10 },
  tileTitle: { fontFamily: SERIF, fontWeight: 700, fontSize: 11.5, lineHeight: 1.2 },
  context: { fontSize: 7.5, color: SOFT, marginTop: 2, lineHeight: 1.3 },
  line: { fontSize: 8, color: INK, marginTop: 3, lineHeight: 1.3 },
  fact: { fontFamily: SERIF, fontWeight: 700, fontSize: 22, marginTop: 4, lineHeight: 1.05 },

  label: { fontFamily: SERIF, fontWeight: 700 },
  coffeeName: { color: SOFT },

  firstRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 },
  numeral: { fontFamily: SERIF, fontWeight: 700, fontSize: 44, lineHeight: 0.95 },
  decimal: { fontSize: 24 },

  legend: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 12 },
  legendText: { fontSize: 7, color: SOFT, marginLeft: 3 },

  sectionTitle: { fontFamily: SERIF, fontWeight: 700, fontSize: 15, lineHeight: 1.15 },

  card: { border: `0.75pt solid ${HAIR}`, padding: CARD_PAD, marginBottom: 8 },
  cardHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  place: { fontFamily: SERIF, fontWeight: 700, fontSize: 18, width: 24, lineHeight: 1.05 },
  cardLabel: { fontFamily: SERIF, fontWeight: 700, fontSize: 13, lineHeight: 1.15 },
  chips: { flexDirection: "row", flexWrap: "wrap", marginTop: 3 },
  chip: { fontSize: 6.5, letterSpacing: 0.6, color: SOFT, textTransform: "uppercase", marginRight: 8 },
  cardScore: { fontFamily: SERIF, fontWeight: 700, fontSize: 20, lineHeight: 1.05, textAlign: "right" },
  cardScoreLine: { fontSize: 7, color: SOFT, textAlign: "right", marginTop: 1.5 },
  body: { flexDirection: "row", marginTop: 6, alignItems: "flex-start" },
  caption: { fontSize: 7, letterSpacing: 0.8, color: SOFT, textTransform: "uppercase", marginBottom: 3 },
  marks: { fontSize: 8.5, color: INK, lineHeight: 1.35 },
  qualityRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5, borderBottomWidth: 0.5, borderBottomColor: HAIR },

  smallRow: { flexDirection: "row" },
  small: { flexGrow: 1, flexBasis: 0, border: `0.75pt solid ${HAIR}`, padding: CARD_PAD, marginRight: 8 },
  barTrack: { height: 5, backgroundColor: GRID, marginTop: 4 },
  barFill: { height: 5, backgroundColor: MINE },
  defectItem: { flexDirection: "row", marginTop: 5 },
  defectMark: { width: 5, height: 5, backgroundColor: PDF_PALETTE.band.red, marginTop: 3, marginRight: 5 },

  footer: {
    position: "absolute",
    bottom: 22,
    height: 30,
    flexDirection: "row",
    alignItems: "flex-start",
    left: PAGE_PAD,
    right: PAGE_PAD,
    borderTop: `0.5pt solid ${HAIR}`,
    paddingTop: 5,
  },
  footText: { fontSize: 6.5, color: SOFT, lineHeight: 1.35 },
});

const nameOf = (sample: ResultsPdfSample): string | null => (sample.revealed && sample.coffee ? sample.coffee.name : null);

/** "Muestra G" and, once revealed, the coffee's name. */
function Named({ sample, size }: { sample: ResultsPdfSample; size?: number }) {
  const name = nameOf(sample);
  return (
    <Text style={size ? { fontSize: size } : undefined}>
      <Text style={s.label}>{sanitizePdfText(sample.label)}</Text>
      {name ? <Text style={s.coffeeName}>{` ${sanitizePdfText(name)}`}</Text> : null}
    </Text>
  );
}

// ── The ranking, on its fixed scale ──────────────────────────────────────────

const PLACE_W = 18;
const NAME_W = 150;
const SCORE_W = 36;
const STRIP_W = CONTENT_W - CARD_PAD * 2 - PLACE_W - NAME_W - SCORE_W - 12;
const STRIP_H = 22;
const MID = 11;

/** A small arrow outside the track: the score is beyond this edge. */
function offScaleArrow(x: number): string {
  return x <= 0
    ? `M ${x - 3} ${MID - 4} L ${x - 7} ${MID} L ${x - 3} ${MID + 4}`
    : `M ${x + 3} ${MID - 4} L ${x + 7} ${MID} L ${x + 3} ${MID + 4}`;
}

function RankRow({
  item,
  referenceScore,
  t,
  own,
}: {
  item: ResultsPdfModel["view"]["entries"][number];
  referenceScore: number | null;
  t: ResultsPdfStrings;
  own: boolean;
}) {
  const context = own ? item.context : { ...item.context, mine: null, difference: null };
  const community = context.basis === "community";
  const row = rankStripRow({
    group: community ? context.score : null,
    spread: context.spread,
    mine: community ? context.mine : context.score,
    reference: referenceScore,
  });
  const x = (pct: number) => (pct / 100) * STRIP_W;
  const brief = scoreLines(context, t.parts.score, "brief");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }} wrap={false}>
      <Text style={[s.label, { width: PLACE_W, fontSize: 10 }]}>{item.place === null ? "" : String(item.place)}</Text>
      <View style={{ width: NAME_W, paddingRight: 6 }}>
        <Named sample={item.sample} size={8.5} />
        {brief.map((line, i) => (
          <Text key={i} style={{ fontSize: 6.5, color: SOFT, marginTop: 1 }}>
            {sanitizePdfText(line)}
          </Text>
        ))}
      </View>
      <Text style={{ width: SCORE_W, fontFamily: SERIF, fontWeight: 700, fontSize: 10.5, textAlign: "right", paddingRight: 8 }}>
        {context.score === null ? t.parts.rank.none : formatScore(context.score)}
      </Text>
      <Svg viewBox={`0 0 ${STRIP_W} ${STRIP_H}`} width={STRIP_W} height={STRIP_H}>
        <Line x1={0} y1={MID} x2={STRIP_W} y2={MID} stroke={GRID} strokeWidth={0.75} />
        <Line x1={x(row.neutral)} y1={0} x2={x(row.neutral)} y2={STRIP_H} stroke={GRID} strokeWidth={0.75} />
        {row.reference !== null ? (
          <Line x1={x(row.reference)} y1={0} x2={x(row.reference)} y2={STRIP_H} stroke={PDF_PALETTE.reference} strokeWidth={1.2} strokeDasharray="3 2" />
        ) : null}
        {row.whisker ? (
          <>
            <Line x1={x(row.whisker.from)} y1={MID} x2={x(row.whisker.to)} y2={MID} stroke={PDF_PALETTE.axisText} strokeWidth={1.2} />
            {row.whisker.cutLow ? null : <Line x1={x(row.whisker.from)} y1={MID - 4} x2={x(row.whisker.from)} y2={MID + 4} stroke={PDF_PALETTE.axisText} strokeWidth={1.2} />}
            {row.whisker.cutHigh ? null : <Line x1={x(row.whisker.to)} y1={MID - 4} x2={x(row.whisker.to)} y2={MID + 4} stroke={PDF_PALETTE.axisText} strokeWidth={1.2} />}
          </>
        ) : null}
        {row.group !== null ? <Circle cx={x(row.group)} cy={MID} r={4} fill={GROUP} stroke={PDF_PALETTE.white} strokeWidth={1} /> : null}
        {row.mine !== null ? <Circle cx={x(row.mine)} cy={MID} r={5.4} fill="none" stroke={MINE} strokeWidth={1.8} /> : null}
        {[row.offScale.group ? row.group : null, row.offScale.mine ? row.mine : null].map((at, i) =>
          at === null ? null : <Path key={i} d={offScaleArrow(x(at))} stroke={PDF_PALETTE.axisText} strokeWidth={1} fill="none" />,
        )}
      </Svg>
    </View>
  );
}

function Ranking({ model, t }: { model: ResultsPdfModel; t: ResultsPdfStrings }) {
  const { view, ctx } = model;
  const axis = scoreAxis();
  const rows = view.entries.map((entry) => {
    const community = entry.context.basis === "community";
    return {
      row: rankStripRow({
        group: community ? entry.context.score : null,
        spread: entry.context.spread,
        mine: community ? entry.context.mine : entry.context.score,
        reference: view.referenceLine?.score ?? null,
      }),
    };
  });
  const anyGroup = rows.some((r) => r.row.group !== null);
  const anyMine = model.own && rows.some((r) => r.row.mine !== null);
  const anySpread = rows.some((r) => r.row.whisker !== null);
  const hasScores = view.entries.some((e) => e.context.score !== null);
  const strings = t.overview;
  const title = !view.ranked ? strings.rankingTitleOpen : view.scope === "group" ? strings.rankingTitle : strings.rankingTitleOwn;
  const rank = t.parts.rank;
  const scaleNote = fillPattern(rank.scaleNote, { min: SCORE_SCALE.min, max: SCORE_SCALE.max, neutral: SCORE_SCALE.neutral });
  const tickX = PLACE_W + NAME_W + SCORE_W;

  return (
    <View style={s.tile}>
      <Text style={s.tileTitle}>{title}</Text>
      <Text style={s.context}>
        {strings.scoreName}
        {!view.ranked ? ` ${strings.rankingOpenNote}` : ""}
      </Text>
      {hasScores ? (
        <>
          <View style={{ marginTop: 6, height: 10 }}>
            {axis.map((tick) => (
              <Text
                key={tick.value}
                style={{ position: "absolute", top: 0, left: tickX + (tick.pct / 100) * STRIP_W - 10, width: 20, textAlign: "center", fontSize: 7, color: PDF_PALETTE.axisText }}
              >
                {String(tick.value)}
              </Text>
            ))}
          </View>
          {view.entries.map((entry) => (
            <RankRow key={entry.sample.id} item={entry} referenceScore={view.referenceLine?.score ?? null} t={t} own={model.own} />
          ))}
          <View style={s.legend}>
            {anyGroup ? (
              <View style={s.legendItem}>
                <Svg viewBox="0 0 10 10" width={10} height={10}>
                  <Circle cx={5} cy={5} r={4} fill={GROUP} />
                </Svg>
                <Text style={s.legendText}>{rank.legendGroup}</Text>
              </View>
            ) : null}
            {anyMine ? (
              <View style={s.legendItem}>
                <Svg viewBox="0 0 10 10" width={10} height={10}>
                  <Circle cx={5} cy={5} r={4} fill="none" stroke={MINE} strokeWidth={1.5} />
                </Svg>
                <Text style={s.legendText}>{rank.legendMine}</Text>
              </View>
            ) : null}
            {anySpread ? (
              <View style={s.legendItem}>
                <Svg viewBox="0 0 16 10" width={16} height={10}>
                  <Line x1={1} y1={5} x2={15} y2={5} stroke={PDF_PALETTE.axisText} strokeWidth={1.2} />
                  <Line x1={1} y1={2} x2={1} y2={8} stroke={PDF_PALETTE.axisText} strokeWidth={1.2} />
                  <Line x1={15} y1={2} x2={15} y2={8} stroke={PDF_PALETTE.axisText} strokeWidth={1.2} />
                </Svg>
                <Text style={s.legendText}>{rank.legendSpread}</Text>
              </View>
            ) : null}
            {view.referenceLine ? (
              <View style={s.legendItem}>
                <Svg viewBox="0 0 16 10" width={16} height={10}>
                  <Line x1={1} y1={5} x2={15} y2={5} stroke={PDF_PALETTE.reference} strokeWidth={1.2} strokeDasharray="3 2" />
                </Svg>
                <Text style={s.legendText}>
                  {sanitizePdfText(
                    fillPattern(rank.legendReference, { label: view.referenceLine.sample.label, score: formatScore(view.referenceLine.score) }),
                  )}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={s.context}>{scaleNote}</Text>
        </>
      ) : (
        <Text style={s.context}>{strings.rankingEmpty}</Text>
      )}
      {/* "indicativo", explained once, only where it is used */}
      {view.entries.some((e) => e.context.indicative || e.context.suppressed) ? <Text style={s.context}>{strings.rankHelp}</Text> : null}
      {view.ranked && view.first.status === "none" && view.first.reason === "too_few" ? (
        <Text style={s.context}>{strings.firstTooFew}</Text>
      ) : null}
      {ctx.isGroup && !ctx.canViewGroup ? <Text style={s.context}>{strings.communityPending}</Text> : null}
    </View>
  );
}

// ── The coffees, one by one ──────────────────────────────────────────────────

function QualityList({ rows, t }: { rows: QualityRow[]; t: CardsStrings }) {
  const group = rows.some((row) => row.group !== null);
  const value = (row: QualityRow) => (group ? row.group : row.mine);
  if (!rows.some((row) => value(row) !== null)) return null;
  const text = (v: number | null) => (v === null ? "–" : Number.isInteger(v) && !group ? String(v) : v.toFixed(1));
  return (
    <View style={{ marginTop: 6 }}>
      <Text style={s.caption}>{group ? t.qualityGroup : t.qualityMine}</Text>
      {rows.map((row) => (
        <View key={row.id} style={s.qualityRow}>
          <Text style={{ fontSize: 8 }}>{sanitizePdfText(t.attributes[row.id] ?? row.id)}</Text>
          <Text style={{ fontSize: 8, fontWeight: 700 }}>{text(value(row))}</Text>
        </View>
      ))}
    </View>
  );
}

const WHEEL_W = 220;

function Card({
  card,
  referenceCount,
  model,
  t,
  locale,
}: {
  card: CoffeeCard<ResultsPdfSample>;
  referenceCount: number;
  model: ResultsPdfModel;
  t: ResultsPdfStrings;
  locale: Locale;
}) {
  const { sample } = card;
  const cardsT = t.cards;
  const name = nameOf(sample);
  const stateChip = model.own && card.state === "none" ? cardsT.notEvaluated : null;
  const lines = card.context ? scoreLines(card.context, t.parts.score, "full") : [];
  const ofWord = locale === "es" ? "de" : "of";
  const wheel = card.wheel;
  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardHead}>
        {card.place !== null ? <Text style={s.place}>{String(card.place)}</Text> : null}
        <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 8 }}>
          <Text style={s.cardLabel}>
            {sanitizePdfText(sample.label)}
            {name ? <Text style={[s.coffeeName, { fontFamily: SANS, fontWeight: 400, fontSize: 10 }]}>{` ${sanitizePdfText(name)}`}</Text> : null}
            {name && sample.coffee?.country ? (
              <Text style={[s.coffeeName, { fontFamily: SANS, fontWeight: 400, fontSize: 8 }]}>{` · ${sanitizePdfText(sample.coffee.country)}`}</Text>
            ) : null}
          </Text>
          {card.isReference || stateChip || card.partial ? (
            <View style={s.chips}>
              {card.isReference ? (
                <>
                  <Text style={s.chip}>{referenceBadgeText(cardsT.referenceBadge, sample.referenceRank, referenceCount)}</Text>
                  <Text style={s.chip}>{cardsT.outsideRanking}</Text>
                </>
              ) : null}
              {stateChip ? <Text style={s.chip}>{stateChip}</Text> : null}
              {card.partial ? <Text style={s.chip}>{cardsT.partialLabel}</Text> : null}
            </View>
          ) : null}
        </View>
        {card.context ? (
          <View style={{ width: 150 }}>
            <Text style={s.cardScore}>{card.context.score === null ? t.parts.score.none : formatScore(card.context.score)}</Text>
            {lines.map((line, i) => (
              <Text key={i} style={s.cardScoreLine}>
                {sanitizePdfText(line)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      {wheel?.status === "ok" ? (
        <View style={s.body}>
          <PdfFlavorWheel counts={wheel.counts} n={wheel.n} familyLabels={t.familyLabels} width={WHEEL_W} />
          <View style={{ flexGrow: 1, flexBasis: 0, paddingLeft: 12 }}>
            {wheel.scope === "group" ? (
              <>
                <Text style={s.caption}>{cardsT.mostChosen}</Text>
                <PdfCountedList
                  items={wheel.descriptors}
                  labels={t.nodeLabels}
                  ofWord={ofWord}
                  width={CONTENT_W - CARD_PAD * 2 - WHEEL_W - 12}
                  labelWidth={92}
                  marked={model.own ? wheel.mine : []}
                  markLabel={t.parts.counted.chosenByYou}
                />
              </>
            ) : (
              <>
                <Text style={s.caption}>{cardsT.youMarked}</Text>
                <Text style={s.marks}>
                  {sanitizePdfText(wheel.descriptors.map((d) => t.nodeLabels[d.id] ?? d.id).join(", "))}
                  {wheel.mine.length > wheel.descriptors.length ? ` +${wheel.mine.length - wheel.descriptors.length}` : ""}
                </Text>
              </>
            )}
          </View>
        </View>
      ) : wheel?.status === "too_few" ? (
        <Text style={[s.context, { marginTop: 6 }]}>{cardsT.tooFew}</Text>
      ) : null}

      {/* an affective session has no wheel: the eight quality attributes instead */}
      {model.header.format === "affective" && card.quality && !(card.isReference && model.referencePinned) ? (
        <QualityList rows={card.quality} t={cardsT} />
      ) : null}
    </View>
  );
}

// ── The document ─────────────────────────────────────────────────────────────

export function ResultsDocument({ model, strings: t, locale }: { model: ResultsPdfModel; strings: ResultsPdfStrings; locale: Locale }) {
  const { view, ctx, header } = model;
  const title = sanitizePdfText(header.name);
  const o = t.overview;
  const showFirst = ctx.format !== "descriptive" && view.ranked && view.first.status === "ok";
  const showBoxes = ctx.format !== "descriptive";
  const you = model.own ? view.you : null;
  const defectCups = view.defects.reduce((sum, d) => sum + d.summary.cups, 0);
  const smallTiles = (you ? 1 : 0) + (view.who ? 1 : 0) + (view.defects.length > 0 ? 1 : 0);
  const referenceCount = model.cards.filter((card) => card.isReference).length;
  const names = Object.fromEntries(
    model.cards.map((c) => [c.sample.id, nameOf(c.sample) ? `${c.sample.label} ${nameOf(c.sample)}` : c.sample.label]),
  );
  const cardsNote = ctx.format === "descriptive" ? t.cards.noteDescriptive : ctx.format === "affective" ? t.cards.noteAffective : t.cards.note;

  return (
    <Document title={`${o.pageKind} · ${title}`} author="Café Sensible" language={locale}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.facts}>{sanitizePdfText(t.facts)}</Text>
        <ReportStamp
          locale={locale}
          inclusion={model.stamp.inclusion}
          viewerExcluded={model.stamp.viewerExcluded}
          resultsUpdatedAt={model.stamp.resultsUpdatedAt}
          originEditedAt={model.stamp.originEditedAt}
        />
        <View style={s.rule} />

        {/* 1. The coffee that came first: its name and its score. */}
        {showFirst && view.first.status === "ok"
          ? (() => {
              const { entry } = view.first;
              const [whole, decimals] = formatScore(entry.context.score as number).split(".");
              return (
                <View style={s.tile} wrap={false}>
                  <Text style={s.tileTitle}>{view.scope === "group" ? o.firstTitle : o.firstTitleOwn}</Text>
                  <View style={s.firstRow}>
                    <Text style={{ fontSize: 11 }}>
                      <Named sample={entry.sample} />
                    </Text>
                    <Text style={s.numeral}>
                      {whole}
                      <Text style={s.decimal}>{`.${decimals}`}</Text>
                    </Text>
                  </View>
                </View>
              );
            })()
          : null}

        {/* 2. Every coffee on one fixed scale. */}
        {showBoxes ? <Ranking model={model} t={t} /> : null}

        {/* 3. The coffees, one by one. */}
        <View style={{ marginTop: 6, marginBottom: 8 }}>
          <Text style={s.sectionTitle}>{t.cards.title}</Text>
          <Text style={s.context}>{cardsNote}</Text>
        </View>
        {model.cards.map((card) => (
          <Card key={card.sample.id} card={card} referenceCount={referenceCount} model={model} t={t} locale={locale} />
        ))}

        {/* 4. Where coffees are compared: their territories on one wheel, the counts in a table. */}
        {model.compare ? (
          <View style={{ marginTop: 6 }} wrap={false}>
            <Text style={s.sectionTitle}>{t.cards.compare}</Text>
            <Text style={[s.context, { marginBottom: 6 }]}>{t.cards.compareHint}</Text>
            <View style={s.tile}>
              <PdfFlavorCompare
                others={model.compare.picked.map((option) => ({
                  id: option.id,
                  tag: option.tag,
                  name: names[option.id] ?? option.tag,
                  counts: option.series.counts,
                  n: option.series.n,
                }))}
                familyLabels={t.familyLabels}
                ofWord={locale === "es" ? "de" : "of"}
                width={300}
                ground="families"
              />
            </View>
          </View>
        ) : null}

        {/* 5. The small facts: each said once, here. */}
        {smallTiles > 0 ? (
          <View style={[s.smallRow, { marginTop: 6 }]} wrap={false}>
            {you ? (
              <View style={s.small}>
                <Text style={s.tileTitle}>{o.youTitle}</Text>
                <Text style={s.fact}>{fillPattern(o.youAbove, { k: you.above, m: you.of })}</Text>
                <Text style={s.context}>{o.youAboveNote}</Text>
                <Text style={s.line}>{fillPattern(o.youMean, { d: formatSigned(you.meanDifference) })}</Text>
                {model.myAlignment && model.myAlignment.opportunities > 0 ? (
                  <>
                    <Text style={s.line}>
                      {fillPattern(o.youAlignment, {
                        k: model.myAlignment.matches,
                        o: model.myAlignment.opportunities,
                        p: Math.round((model.myAlignment.matches / model.myAlignment.opportunities) * 100),
                      })}
                    </Text>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${countBar(model.myAlignment.matches, model.myAlignment.opportunities).pct}%` }]} />
                    </View>
                    <Text style={s.context}>{o.youAlignmentNote}</Text>
                  </>
                ) : null}
              </View>
            ) : null}
            {view.who ? (
              <View style={s.small}>
                <Text style={s.tileTitle}>{o.whoTitle}</Text>
                <Text style={s.fact}>{fillPattern(o.whoSentOf, { k: view.who.sent, n: view.who.joined })}</Text>
                <Text style={s.context}>{o.whoSentNote}</Text>
                {view.who.excluded !== null && view.who.excluded > 0 ? (
                  <Text style={s.line}>{fillPattern(o.whoExcluded, { n: view.who.excluded })}</Text>
                ) : null}
              </View>
            ) : null}
            {view.defects.length > 0 ? (
              <View style={s.small}>
                <Text style={s.tileTitle}>{o.defectsTitle}</Text>
                <Text style={s.fact}>{defectCups === 1 ? o.defectCupsOne : fillPattern(o.defectCupsMany, { n: defectCups })}</Text>
                {view.defects.map(({ sample, summary }) => (
                  <View key={sample.id} style={s.defectItem}>
                    <View style={s.defectMark} />
                    <View style={{ flexGrow: 1, flexBasis: 0 }}>
                      <Text style={{ fontSize: 8 }}>
                        <Named sample={sample} />
                        {`  ${summary.cups === 1 ? o.defectCupsOne : fillPattern(o.defectCupsMany, { n: summary.cups })}`}
                      </Text>
                      <Text style={s.context}>
                        {summary.types
                          .map((type) =>
                            fillPattern(o.defectType, {
                              type: type.type === null ? o.defectUnspecified : (o.defectTypes[type.type] ?? type.type),
                              n: type.cups,
                            }),
                          )
                          .join(" · ")}
                      </Text>
                      {view.scope === "group" ? (
                        <Text style={s.context}>{fillPattern(o.defectBy, { k: summary.cuppers, n: summary.n })}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={s.footer} fixed>
          <View style={{ flexGrow: 1, flexBasis: 0, paddingRight: 10 }}>
            <Text style={s.footText}>{t.attribution}</Text>
          </View>
          <Text
            style={s.footText}
            render={({ pageNumber, totalPages }) => (locale === "es" ? `Página ${pageNumber} de ${totalPages}` : `Page ${pageNumber} of ${totalPages}`)}
          />
        </View>
      </Page>
    </Document>
  );
}
