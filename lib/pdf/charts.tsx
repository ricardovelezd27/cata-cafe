// Server-only. Small SVG chart primitives for react-pdf reports: a horizontal
// bar list and a minimal trend line. Both use pure fixed-viewBox math (no
// auto-layout) — every coordinate is computed by hand against the `width`/
// `height` props, the same way GroupSummaryDocument/CvaFormDocument hand-lay
// their tables.
//
// react-pdf's TypeScript defs omit `fontSize` (and `fontFamily`) on the SVG
// <Text> element even though the renderer reads them straight off the raw
// props at runtime for SVG text nodes (@react-pdf/layout's getFragments
// reads `instance.props.fontSize`, not `instance.style`, when laying out
// text inside <Svg>). SvgText below is the one contained cast that works
// around that typing gap so the rest of this file — and every caller — stays
// strictly typed.
//
// NEVER import this (or @react-pdf/renderer) from a client component.

import type { ComponentType, ReactNode } from "react";
import { Svg, Rect, Line, Polyline, Polygon, Circle, Path, Text, View } from "@react-pdf/renderer";
import { SANS, SERIF } from "./fonts";
import { PDF_FLAVOR_FAMILY_COLORS, PDF_PALETTE, type PdfFlavorFamilyColors, type ScoreBand } from "./palette";
import { sanitizePdfText } from "./text";
import { formatSignedDelta } from "../referenceDelta";
import { anchorForAngle, percentOf, radarPoint, radarPolygonPoints } from "./chartMath";
import {
  WHEEL_FAMILY_ORDER,
  WHEEL_FRAMES,
  compareGeometry,
  familyAngle,
  ringRadius,
  wheelGeometry,
  wheelLabel,
  wheelPoint,
  type CountedNode,
  type WheelCounts,
  type WheelFamilyId,
  type WheelFrame,
  type WheelPetal,
  type WheelRing,
} from "../flavorWheel";

export { percentOf, radarPoint, radarPolygonPoints } from "./chartMath";

const BRAND_GREEN = PDF_PALETTE.brandGreen;
const INK = PDF_PALETTE.ink;
const SOFT = PDF_PALETTE.soft;
const HAIR = PDF_PALETTE.hair;

type SvgTextProps = {
  x: number;
  y: number;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  textAnchor?: "start" | "middle" | "end";
  children?: ReactNode;
};
const SvgText = Text as unknown as ComponentType<SvgTextProps>;

/**
 * Rough Helvetica advance-width factor (em fraction) used to char-count
 * truncate labels. react-pdf's SVG layer has no text-measurement API to
 * truncate against exactly, so this is an approximation — good enough for a
 * fixed ~140pt label column at small font sizes.
 */
const AVG_CHAR_WIDTH_EM = 0.52;

function ellipsize(text: string, maxWidth: number, fontSize: number): string {
  const charWidth = fontSize * AVG_CHAR_WIDTH_EM;
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth));
  if (text.length <= maxChars) return text;
  if (maxChars <= 1) return "…";
  return `${text.slice(0, maxChars - 1)}…`;
}

/** Compact number formatting for bar/axis values: integers as-is, else 2dp. */
function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

// ─── PdfBarList ──────────────────────────────────────────────────────────────

export type PdfBarListRow = { label: string; value: number; color?: string };

const BAR_ROW_HEIGHT = 14;
const BAR_LABEL_WIDTH = 140;
const BAR_VALUE_WIDTH = 30;
const BAR_GAP = 6;
const BAR_HEIGHT = 8;
const BAR_MIN_WIDTH = 2;
const BAR_FONT_SIZE = 7;

/**
 * Horizontal bar list: label column (fixed ~140pt, ellipsis-truncated) +
 * proportional bar + right-aligned value. Bars scale to the row-set max;
 * `maxRows` caps how many rows are drawn (default 8) so the chart stays a
 * fixed, predictable height.
 */
export function PdfBarList({
  rows,
  width,
  maxRows = 8,
  fontFamily,
}: {
  rows: PdfBarListRow[];
  width: number;
  maxRows?: number;
  /** Optional: register-font family for the labels (default keeps the built-in font). */
  fontFamily?: string;
}) {
  const visible = rows.slice(0, maxRows);
  const height = Math.max(BAR_ROW_HEIGHT, visible.length * BAR_ROW_HEIGHT);
  const barAreaX = BAR_LABEL_WIDTH + BAR_GAP;
  const barAreaWidth = Math.max(1, width - BAR_LABEL_WIDTH - BAR_VALUE_WIDTH - BAR_GAP * 2);
  const max = visible.reduce((m, row) => Math.max(m, row.value), 0);

  const children = visible.flatMap((row, i) => {
    const rowY = i * BAR_ROW_HEIGHT;
    const textY = rowY + BAR_ROW_HEIGHT / 2 + BAR_FONT_SIZE * 0.35;
    const barY = rowY + (BAR_ROW_HEIGHT - BAR_HEIGHT) / 2;
    const barW =
      max > 0 ? Math.max(BAR_MIN_WIDTH, (row.value / max) * barAreaWidth) : BAR_MIN_WIDTH;
    const label = ellipsize(row.label, BAR_LABEL_WIDTH - BAR_GAP, BAR_FONT_SIZE);

    return [
      <SvgText key={`l-${i}`} x={0} y={textY} fontSize={BAR_FONT_SIZE} fontFamily={fontFamily} fill={INK}>
        {label}
      </SvgText>,
      <Rect
        key={`b-${i}`}
        x={barAreaX}
        y={barY}
        width={barW}
        height={BAR_HEIGHT}
        fill={row.color ?? BRAND_GREEN}
      />,
      <SvgText
        key={`v-${i}`}
        x={width}
        y={textY}
        fontSize={BAR_FONT_SIZE}
        fontFamily={fontFamily}
        fill={SOFT}
        textAnchor="end"
      >
        {formatValue(row.value)}
      </SvgText>,
    ];
  });

  return (
    <Svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      {children}
    </Svg>
  );
}

// ─── PdfTrendLine ────────────────────────────────────────────────────────────

export type PdfTrendPoint = { label: string; value: number };

const TREND_PAD_LEFT = 26;
const TREND_PAD_RIGHT = 6;
const TREND_PAD_TOP = 16;
const TREND_PAD_BOTTOM = 14;
const TREND_FONT_SIZE = 6.5;
const TREND_CAPTION_SIZE = 7.5;

/**
 * Minimal trend line: a Polyline over a fixed viewBox with min/max Y labels
 * and first/last X labels only (no full axis). Handles all-zero and
 * single-point series without dividing by zero.
 */
export function PdfTrendLine({
  points,
  width,
  height,
  label,
}: {
  points: PdfTrendPoint[];
  width: number;
  height: number;
  label?: string;
}) {
  const plotX = TREND_PAD_LEFT;
  const plotY = TREND_PAD_TOP;
  const plotWidth = Math.max(1, width - TREND_PAD_LEFT - TREND_PAD_RIGHT);
  const plotHeight = Math.max(1, height - TREND_PAD_TOP - TREND_PAD_BOTTOM);

  const values = points.map((p) => p.value);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = max - min;

  const xFor = (i: number) =>
    points.length > 1 ? plotX + (i / (points.length - 1)) * plotWidth : plotX + plotWidth / 2;
  // All-zero or single-value series (range === 0) draw flat, centered.
  const yFor = (v: number) =>
    range > 0 ? plotY + (1 - (v - min) / range) * plotHeight : plotY + plotHeight / 2;

  const polylinePoints = points.map((p, i) => `${xFor(i)},${yFor(p.value)}`).join(" ");
  const midY = plotY + plotHeight / 2;
  const first = points[0];
  const last = points.length > 1 ? points[points.length - 1] : undefined;

  return (
    <Svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      {label ? (
        <SvgText x={0} y={TREND_CAPTION_SIZE} fontSize={TREND_CAPTION_SIZE} fill={SOFT}>
          {label}
        </SvgText>
      ) : null}

      <Line x1={plotX} y1={midY} x2={plotX + plotWidth} y2={midY} stroke={HAIR} strokeWidth={0.5} />

      {points.length > 0 ? (
        <>
          <SvgText x={0} y={plotY + 3} fontSize={TREND_FONT_SIZE} fill={SOFT}>
            {formatValue(max)}
          </SvgText>
          <SvgText x={0} y={plotY + plotHeight} fontSize={TREND_FONT_SIZE} fill={SOFT}>
            {formatValue(min)}
          </SvgText>
          <Polyline points={polylinePoints} stroke={BRAND_GREEN} strokeWidth={1.5} fill="none" />
        </>
      ) : null}

      {first ? (
        <SvgText x={plotX} y={height - 2} fontSize={TREND_FONT_SIZE} fill={SOFT}>
          {first.label}
        </SvgText>
      ) : null}
      {last ? (
        <SvgText
          x={plotX + plotWidth}
          y={height - 2}
          fontSize={TREND_FONT_SIZE}
          fill={SOFT}
          textAnchor="end"
        >
          {last.label}
        </SvgText>
      ) : null}
    </Svg>
  );
}

// ─── PdfRadar ────────────────────────────────────────────────────────────────

export type PdfRadarSeries = {
  values: number[];
  color: string;
  fillOpacity?: number;
  label?: string;
};

const RADAR_RINGS = [3, 5, 7, 9];
const RADAR_FONT = 7;
const RADAR_LABEL_MARGIN = 56;
const RADAR_LEGEND_H = 14;

/**
 * Radar (spider) chart, 8 axes by convention but any count >= 3 works. Draws
 * rings at 3/5/7/9 (those inside [min,max]), spokes, one polygon per series
 * (max 3) and a legend row when any series has a label. Total height is
 * size + legend.
 */
export function PdfRadar({
  axes,
  series,
  size,
  min = 1,
  max = 9,
}: {
  axes: string[];
  series: PdfRadarSeries[];
  size: number;
  min?: number;
  max?: number;
}) {
  const shown = series.slice(0, 3);
  const hasLegend = shown.some((s) => s.label);
  const height = size + (hasLegend ? RADAR_LEGEND_H : 0);
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.max(10, size / 2 - RADAR_LABEL_MARGIN);
  const n = axes.length;
  const rings = RADAR_RINGS.filter((r) => r >= min && r <= max);
  const legendItemW = size / Math.max(1, shown.length);

  return (
    <Svg viewBox={`0 0 ${size} ${height}`} width={size} height={height}>
      {rings.map((r) => (
        <Circle
          key={`ring-${r}`}
          cx={cx}
          cy={cy}
          r={max > min ? ((r - min) / (max - min)) * radius : 0}
          stroke={PDF_PALETTE.grid}
          strokeWidth={0.5}
          fill="none"
        />
      ))}
      {axes.map((_, i) => {
        const end = radarPoint(i, n, max, min, max, radius, cx, cy);
        return (
          <Line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke={PDF_PALETTE.grid}
            strokeWidth={0.5}
          />
        );
      })}
      {shown.map((s, i) => (
        <Polygon
          key={`poly-${i}`}
          points={radarPolygonPoints(s.values, min, max, radius, cx, cy)}
          fill={s.color}
          fillOpacity={s.fillOpacity ?? 0.2}
          stroke={s.color}
          strokeWidth={1.2}
        />
      ))}
      {axes.map((label, i) => {
        const p = radarPoint(i, n, max, min, max, radius + 6, cx, cy);
        return (
          <SvgText
            key={`axis-${i}`}
            x={p.x}
            y={p.y + RADAR_FONT * 0.35}
            fontSize={RADAR_FONT}
            fontFamily={SANS}
            fill={PDF_PALETTE.axisText}
            textAnchor={anchorForAngle(i, n)}
          >
            {ellipsize(label, RADAR_LABEL_MARGIN - 4, RADAR_FONT)}
          </SvgText>
        );
      })}
      {hasLegend
        ? shown.flatMap((s, i) => {
            const x0 = i * legendItemW;
            const y = size + RADAR_LEGEND_H / 2;
            return [
              <Rect key={`lg-s-${i}`} x={x0} y={y - 3} width={6} height={6} fill={s.color} />,
              <SvgText
                key={`lg-t-${i}`}
                x={x0 + 9}
                y={y + RADAR_FONT * 0.35}
                fontSize={RADAR_FONT}
                fontFamily={SANS}
                fill={INK}
              >
                {ellipsize(s.label ?? "", legendItemW - 12, RADAR_FONT)}
              </SvgText>,
            ];
          })
        : null}
    </Svg>
  );
}

// ─── PdfPercentBars ──────────────────────────────────────────────────────────

export type PdfPercentRow = { label: string; count: number; total: number; color?: string };

const PCT_VALUE_WIDTH = 52;

/**
 * Like PdfBarList but each bar is scaled to its own `total` (full track =
 * 100%), with "3/7 · 43%" at the right. total 0 draws a minimum bar and
 * "0/0 · 0%".
 */
export function PdfPercentBars({
  rows,
  width,
  maxRows = 8,
  valueFormat = "counts",
  labelWidth = BAR_LABEL_WIDTH,
  valueWidth = PCT_VALUE_WIDTH,
}: {
  rows: PdfPercentRow[];
  width: number;
  maxRows?: number;
  /** "counts" → "3/7 · 43%" (default); "percent" → "43%" only. */
  valueFormat?: "counts" | "percent";
  /** Label / value column widths in pt (defaults keep the original layout). */
  labelWidth?: number;
  valueWidth?: number;
}) {
  const visible = rows.slice(0, maxRows);
  const height = Math.max(BAR_ROW_HEIGHT, visible.length * BAR_ROW_HEIGHT);
  const barAreaX = labelWidth + BAR_GAP;
  const barAreaWidth = Math.max(1, width - labelWidth - valueWidth - BAR_GAP * 2);

  const children = visible.flatMap((row, i) => {
    const rowY = i * BAR_ROW_HEIGHT;
    const textY = rowY + BAR_ROW_HEIGHT / 2 + BAR_FONT_SIZE * 0.35;
    const barY = rowY + (BAR_ROW_HEIGHT - BAR_HEIGHT) / 2;
    const frac = row.total > 0 ? Math.min(1, Math.max(0, row.count / row.total)) : 0;
    const barW = Math.max(BAR_MIN_WIDTH, frac * barAreaWidth);
    return [
      <SvgText key={`l-${i}`} x={0} y={textY} fontSize={BAR_FONT_SIZE} fontFamily={SANS} fill={INK}>
        {ellipsize(row.label, labelWidth - BAR_GAP, BAR_FONT_SIZE)}
      </SvgText>,
      <Rect
        key={`t-${i}`}
        x={barAreaX}
        y={barY}
        width={barAreaWidth}
        height={BAR_HEIGHT}
        fill={HAIR}
        fillOpacity={0.5}
      />,
      <Rect
        key={`b-${i}`}
        x={barAreaX}
        y={barY}
        width={barW}
        height={BAR_HEIGHT}
        fill={row.color ?? BRAND_GREEN}
      />,
      <SvgText
        key={`v-${i}`}
        x={width}
        y={textY}
        fontSize={BAR_FONT_SIZE}
        fontFamily={SANS}
        fill={SOFT}
        textAnchor="end"
      >
        {valueFormat === "percent"
          ? `${percentOf(row.count, row.total)}%`
          : `${row.count}/${row.total} · ${percentOf(row.count, row.total)}%`}
      </SvgText>,
    ];
  });

  return (
    <Svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      {children}
    </Svg>
  );
}

// ─── PdfScorePill, PdfDeviationBand, PdfDeltaChip ─────────────────────────────────────────────

/** Neutral score pill: the number only, never a colour or a name by quality
 *  (S10 WP3a, TODO(kim-validar:A10)). null score renders an em dash. */
export function PdfScorePill({
  score,
  size = "sm",
}: {
  score: number | null;
  size?: "sm" | "lg";
}) {
  const lg = size === "lg";
  return (
    <View
      style={{
        backgroundColor: PDF_PALETTE.paper,
        borderWidth: 0.75,
        borderColor: PDF_PALETTE.hair,
        borderRadius: lg ? 6 : 4,
        paddingVertical: lg ? 4 : 2,
        paddingHorizontal: lg ? 10 : 6,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: lg ? 14 : 8,
          color: PDF_PALETTE.ink,
        }}
      >
        {score === null ? "—" : score.toFixed(2)}
      </Text>
    </View>
  );
}

/** Rounded score pill coloured by DISTANCE from the group (cupperStats
 *  `bandFor`: >= 1 SD amber, >= 2 SD red), never by quality. Only the owner
 *  matrix and the teacher notes use it. null score renders an em dash. */
export function PdfDeviationBand({
  score,
  band,
  size = "sm",
}: {
  score: number | null;
  band: ScoreBand;
  size?: "sm" | "lg";
}) {
  const lg = size === "lg";
  return (
    <View
      style={{
        backgroundColor: PDF_PALETTE.band[band],
        borderRadius: lg ? 6 : 4,
        paddingVertical: lg ? 4 : 2,
        paddingHorizontal: lg ? 10 : 6,
        alignSelf: "flex-start",
      }}
    >
      <Text
        style={{
          fontFamily: SANS,
          fontWeight: 700,
          fontSize: lg ? 14 : 8,
          color: PDF_PALETTE.white,
        }}
      >
        {score === null ? "—" : score.toFixed(2)}
      </Text>
    </View>
  );
}

/** Signed delta chip: green when > 0, red when < 0, grey when 0 or null. */
export function PdfDeltaChip({ delta, digits = 2 }: { delta: number | null; digits?: 2 }) {
  const rounded = delta === null ? 0 : Number(delta.toFixed(digits));
  const color =
    delta === null || rounded === 0
      ? PDF_PALETTE.band.neutral
      : rounded > 0
        ? PDF_PALETTE.band.green
        : PDF_PALETTE.band.red;
  return (
    <View
      style={{
        borderWidth: 0.75,
        borderColor: color,
        borderRadius: 4,
        paddingVertical: 1.5,
        paddingHorizontal: 5,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontFamily: SANS, fontWeight: 700, fontSize: 8, color }}>
        {delta === null ? "—" : formatSignedDelta(delta, digits)}
      </Text>
    </View>
  );
}

// ─── PdfFlavorWheel, PdfFlavorCompare, PdfCountedList (package R5a) ───────────
//
// The counted flavour wheel and its comparison layer, drawn from the pure
// geometry of lib/flavorWheel.ts (the same numbers the on-screen components
// will use). Rules of these three drawings:
//   - a count is never told by colour alone: the number is printed beside every
//     family, and a comparison carries its table of families by coffees;
//   - territories differ by line style as well as by colour, and each carries
//     its coffee's letter on its own edge;
//   - family colours come from ONE prop (`colors`, default
//     PDF_FLAVOR_FAMILY_COLORS in ./palette); everything else uses PDF_PALETTE;
//   - every word is the caller's (family names, the "de" word, coffee names):
//     this file holds no Spanish or English;
//   - no chart text is drawn under 7 pt.

type FlavorTextProps = SvgTextProps & { fontWeight?: number };
const FlavorText = Text as unknown as ComponentType<FlavorTextProps>;

/** The family names, already in the reader's language. */
export type PdfFamilyLabels = Record<WheelFamilyId, string>;

const WHEEL_NAME_PT = 8;
const WHEEL_COUNT_PT = 11;
/** Under this rendered width a two-part name ("Ácido/Fermentado") takes two lines. */
const WHEEL_COMPACT_BELOW = 300;
const WHEEL_MIN_WIDTH = 220;
const WHEEL_LINE = 1.18;
/** Advance of an average Hanken Grotesk character, in em: a little wide, so a
 *  label is split one character early rather than clipped one character late. */
const WHEEL_CHAR_EM = 0.56;

function wheelSize(frame: WheelFrame, width: number) {
  const k = width / frame.width;
  return { k, height: Math.round(width * (frame.height / frame.width) * 100) / 100 };
}

function nameLines(name: string, compact: boolean): string[] {
  const clean = sanitizePdfText(name);
  const cut = clean.indexOf("/");
  if (!compact || cut <= 0 || cut === clean.length - 1) return [clean];
  return [`${clean.slice(0, cut).trim()}/`, clean.slice(cut + 1).trim()];
}

function ringElements(rings: readonly WheelRing[], frame: WheelFrame, k: number) {
  return rings.map((ring, i) => (
    <Circle
      key={`ring-${i}`}
      cx={frame.cx}
      cy={frame.cy}
      r={ring.radius}
      stroke={ring.outer ? PDF_PALETTE.reference : PDF_PALETTE.grid}
      strokeWidth={(ring.outer ? 0.8 : 0.45) / k}
      fill="none"
    />
  ));
}

function petalElements(petals: readonly WheelPetal[], colors: PdfFlavorFamilyColors) {
  return petals.map((petal) =>
    petal.d === null ? null : <Path key={`petal-${petal.family}`} d={petal.d} fill={colors[petal.family]} />,
  );
}

/**
 * The words around a wheel: for each family, its number (bold, on the family's
 * angle just outside the outer ring) and its name beyond it. `numbers[i]` null
 * draws no number; `muted[i]` greys a family nobody found.
 */
function labelElements(input: {
  frame: WheelFrame;
  k: number;
  labels: PdfFamilyLabels;
  numbers: readonly (string | null)[];
  muted: readonly boolean[];
  compact: boolean;
}) {
  const { frame, k, labels, numbers, muted, compact } = input;
  const nameSize = WHEEL_NAME_PT / k;
  const countSize = WHEEL_COUNT_PT / k;
  const widest = numbers.reduce((w, t) => Math.max(w, t ? t.length : 0), 0);
  const hasNumbers = widest > 0;
  // The number sits 9 pt outside the ring; the name clears the widest number.
  const countR = frame.R + (9 + Math.max(0, widest - 1) * 2.5) / k;
  const nameR = frame.R + (hasNumbers ? 15 + widest * 3 + Math.max(0, widest - 1) * 2.5 : 8) / k;
  return WHEEL_FAMILY_ORDER.flatMap((family, i) => {
    const at = wheelLabel(frame, i);
    const angle = familyAngle(i);
    const out: ReactNode[] = [];
    const number = numbers[i];
    if (number) {
      const p = wheelPoint(frame, countR, angle);
      out.push(
        <FlavorText
          key={`count-${family}`}
          x={p.x}
          y={p.y + countSize * 0.35}
          fontSize={countSize}
          fontFamily={SERIF}
          fontWeight={700}
          fill={muted[i] ? PDF_PALETTE.reference : INK}
          textAnchor="middle"
        >
          {number}
        </FlavorText>,
      );
    }
    const p = wheelPoint(frame, nameR, angle);
    const room =
      at.anchor === "start" ? frame.width - p.x : at.anchor === "end" ? p.x : 2 * Math.min(p.x, frame.width - p.x);
    const fits = (text: string) => text.length * nameSize * WHEEL_CHAR_EM <= room - 1 / k;
    const name = labels[family] ?? family;
    let lines = nameLines(name, compact);
    if (lines.length === 1 && !fits(lines[0])) lines = nameLines(name, true);
    lines = lines.map((line) => (fits(line) ? line : ellipsize(line, (room - 1 / k) * (AVG_CHAR_WIDTH_EM / WHEEL_CHAR_EM), nameSize)));
    const step = nameSize * WHEEL_LINE;
    const first =
      at.side === "above"
        ? p.y - (lines.length - 1) * step
        : at.side === "below"
          ? p.y + nameSize * 0.75
          : p.y + nameSize * 0.35 - ((lines.length - 1) * step) / 2;
    lines.forEach((line, j) => {
      out.push(
        <FlavorText
          key={`name-${family}-${j}`}
          x={p.x}
          y={first + j * step}
          fontSize={nameSize}
          fontFamily={SANS}
          fill={muted[i] ? PDF_PALETTE.reference : PDF_PALETTE.axisText}
          textAnchor={at.anchor}
        >
          {line}
        </FlavorText>,
      );
    });
    return out;
  });
}

/**
 * One coffee's counted flavour wheel: a ring per person, a petal per family as
 * long as the number of people who found it, and each family's number and name.
 * `size="mini"` draws the shape only (petals and the outer ring), for a row of
 * small wheels; the caller writes its caption.
 */
export function PdfFlavorWheel({
  counts,
  n,
  familyLabels,
  size = "full",
  width,
  colors = PDF_FLAVOR_FAMILY_COLORS,
}: {
  /** People per wheel node id (the `rollup` of `countWheelPeople` / `WheelData`). */
  counts: WheelCounts;
  /** The cuppers the counts are "of". */
  n: number;
  familyLabels: PdfFamilyLabels;
  size?: "full" | "mini";
  /** Rendered width in pt (default 320 for full, 64 for mini). The height follows the frame. */
  width?: number;
  colors?: PdfFlavorFamilyColors;
}) {
  const mini = size === "mini";
  const frame: WheelFrame = mini ? WHEEL_FRAMES.mini : WHEEL_FRAMES.full;
  const w = mini ? (width ?? 64) : Math.max(WHEEL_MIN_WIDTH, width ?? 320);
  const { k, height } = wheelSize(frame, w);
  const g = wheelGeometry(counts, n, frame);
  return (
    <Svg viewBox={`0 0 ${frame.width} ${frame.height}`} width={w} height={height}>
      {petalElements(g.petals, colors)}
      {mini ? ringElements(g.rings.filter((r) => r.outer), frame, k) : ringElements(g.rings, frame, k)}
      {mini
        ? null
        : labelElements({
            frame,
            k,
            labels: familyLabels,
            numbers: g.petals.map((p) => String(p.count)),
            muted: g.petals.map((p) => p.count === 0),
            compact: w < WHEEL_COMPACT_BELOW,
          })}
    </Svg>
  );
}

// ── The comparison ───────────────────────────────────────────────────────────

/** One coffee of a comparison. `tag` is the letter drawn on its territory;
 *  `name` is what the legend and the table call it. */
export type PdfCompareCoffee = { id: string; tag: string; name: string; counts: WheelCounts; n: number };

type TerritoryStyle = { color: string; dash?: string; fill: number };
/** Alone: colour AND line style AND the letter tell the coffees apart. */
const TERRITORY_ALONE: TerritoryStyle[] = [
  { color: PDF_PALETTE.mine, fill: 0.16 },
  { color: PDF_PALETTE.community, dash: "6 2.5", fill: 0.13 },
  { color: PDF_PALETTE.ink, dash: "1.5 2.5", fill: 0 },
];
/** Over a coffee's petals: ink outlines, so colour stays the family's. */
const TERRITORY_OVER: TerritoryStyle[] = [
  { color: PDF_PALETTE.ink, fill: 0 },
  { color: PDF_PALETTE.ink, dash: "5 3", fill: 0 },
];

const COMPARE_FAMILY_COL = 118;
const COMPARE_CELL_COL = 46;

/**
 * The comparison drawing with its legend and its table. With `base`, that
 * coffee keeps its coloured petals and up to two `others` are laid over them as
 * outlines; without it, up to three `others` are drawn as territories alone.
 * The table under it (families by coffees) is the exact reading: with three
 * coffees the drawing prints no numbers.
 */
export function PdfFlavorCompare({
  base = null,
  others,
  familyLabels,
  ofWord,
  width,
  colors = PDF_FLAVOR_FAMILY_COLORS,
}: {
  base?: PdfCompareCoffee | null;
  others: readonly PdfCompareCoffee[];
  familyLabels: PdfFamilyLabels;
  /** The word between a count and its total: "de" / "of". */
  ofWord: string;
  /** Rendered width of the drawing in pt (default 320). */
  width?: number;
  colors?: PdfFlavorFamilyColors;
}) {
  const frame: WheelFrame = WHEEL_FRAMES.compare;
  const w = Math.max(WHEEL_MIN_WIDTH, width ?? 320);
  const { k, height } = wheelSize(frame, w);
  const series = (c: PdfCompareCoffee) => ({ id: c.id, counts: c.counts, n: c.n });
  const g = compareGeometry({ base: base ? series(base) : null, others: others.map(series) }, frame);
  const styles = base ? TERRITORY_OVER : TERRITORY_ALONE;
  const drawn = [...(base ? [base] : []), ...others].filter((c) => g.table.series.some((s) => s.id === c.id));
  const coffeeOf = (id: string) => drawn.find((c) => c.id === id);
  const tagSize = 9 / k;

  return (
    <View style={{ width: Math.max(w, COMPARE_FAMILY_COL + COMPARE_CELL_COL * drawn.length) }}>
      <Svg viewBox={`0 0 ${frame.width} ${frame.height}`} width={w} height={height}>
        {petalElements(g.petals, colors)}
        {ringElements(g.rings, frame, k)}
        {g.territories.map((t) => {
          const st = styles[t.order % styles.length];
          return st.fill > 0 ? <Path key={`fill-${t.id}`} d={t.d} fill={st.color} fillOpacity={st.fill} /> : null;
        })}
        {/* the centre is "nobody": kept paper white, so overlapping fills do not make it the darkest place */}
        {base ? null : <Circle cx={frame.cx} cy={frame.cy} r={frame.r0 - 0.8 / k} fill={PDF_PALETTE.white} />}
        {g.territories.flatMap((t) => {
          const st = styles[t.order % styles.length];
          return [
            // a paper-coloured line under the outline keeps it legible over petals and rings
            <Path key={`under-${t.id}`} d={t.d} stroke={PDF_PALETTE.white} strokeWidth={3.4 / k} fill="none" />,
            <Path
              key={`terr-${t.id}`}
              d={t.d}
              stroke={st.color}
              strokeWidth={1.5 / k}
              strokeDasharray={st.dash}
              fill="none"
            />,
          ];
        })}
        {g.territories.flatMap((t) => {
          const st = styles[t.order % styles.length];
          const own = coffeeOf(t.id);
          const edge = own ? ringRadius(frame, own.counts[t.tag.family] ?? 0, g.n) : frame.r0;
          const at = wheelPoint(frame, Math.min(edge, frame.R - 8 / k), familyAngle(t.tag.index));
          return [
            <Circle
              key={`tag-c-${t.id}`}
              cx={at.x}
              cy={at.y}
              r={7 / k}
              fill={PDF_PALETTE.white}
              stroke={st.color}
              strokeWidth={1 / k}
            />,
            <FlavorText
              key={`tag-t-${t.id}`}
              x={at.x}
              y={at.y + tagSize * 0.36}
              fontSize={tagSize}
              fontFamily={SERIF}
              fontWeight={700}
              fill={INK}
              textAnchor="middle"
            >
              {sanitizePdfText(coffeeOf(t.id)?.tag ?? "").slice(0, 2)}
            </FlavorText>,
          ];
        })}
        {labelElements({
          frame,
          k,
          labels: familyLabels,
          numbers: g.labels.map(() => null),
          muted: g.labels.map((l) => l.empty),
          compact: w < WHEEL_COMPACT_BELOW,
        })}
      </Svg>

      {/* Legend: the shape says which coffee is which, not the colour alone. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
        {drawn.map((c, i) => {
          const isBase = base !== null && i === 0;
          const st = isBase ? null : styles[(base ? i - 1 : i) % styles.length];
          return (
            <View key={`lg-${c.id}`} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 2 }}>
              <Svg viewBox="0 0 26 10" width={26} height={10}>
                {st ? (
                  <Line x1={1} y1={5} x2={25} y2={5} stroke={st.color} strokeWidth={1.6} strokeDasharray={st.dash} />
                ) : (
                  <Path d="M 13 10 L 5.5 2.4 A 10.6 10.6 0 0 1 20.5 2.4 Z" fill={PDF_PALETTE.reference} />
                )}
              </Svg>
              <Text style={{ fontFamily: SANS, fontSize: 8, color: INK, marginLeft: 3 }}>
                <Text style={{ fontFamily: SERIF, fontWeight: 700 }}>{sanitizePdfText(c.tag)}</Text>
                {`  ${sanitizePdfText(c.name)}`}
              </Text>
            </View>
          );
        })}
      </View>

      {/* The table: families by coffees, each coffee with its own n. */}
      {g.table.rows.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          <View style={{ flexDirection: "row", borderBottomWidth: 0.75, borderBottomColor: HAIR, paddingBottom: 2 }}>
            <View style={{ width: COMPARE_FAMILY_COL }} />
            {g.table.series.map((s) => (
              <View key={`th-${s.id}`} style={{ width: COMPARE_CELL_COL, alignItems: "center" }}>
                <Text style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 9, color: INK }}>
                  {sanitizePdfText(coffeeOf(s.id)?.tag ?? "")}
                </Text>
                <Text style={{ fontFamily: SANS, fontSize: 7, color: SOFT }}>{`${ofWord} ${s.n}`}</Text>
              </View>
            ))}
          </View>
          {g.table.rows.map((row) => (
            <View
              key={`tr-${row.family}`}
              style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: HAIR, paddingVertical: 2 }}
            >
              <View style={{ width: COMPARE_FAMILY_COL, flexDirection: "row", alignItems: "center" }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors[row.family], marginRight: 4 }} />
                <Text style={{ fontFamily: SANS, fontSize: 8, color: INK }}>
                  {sanitizePdfText(familyLabels[row.family] ?? row.family)}
                </Text>
              </View>
              {row.counts.map((count, i) => (
                <Text
                  key={`td-${row.family}-${i}`}
                  style={{
                    width: COMPARE_CELL_COL,
                    textAlign: "center",
                    fontFamily: SANS,
                    fontSize: 8,
                    fontWeight: count > 0 ? 700 : 400,
                    color: count > 0 ? INK : PDF_PALETTE.reference,
                  }}
                >
                  {String(count)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ── The counted list ─────────────────────────────────────────────────────────

const COUNTED_ROW_H = 14;
const COUNTED_FONT = 8;
const COUNTED_VALUE_W = 44;
const COUNTED_DOT = 15;
const COUNTED_DOT_X = 6;

/**
 * The counted list that sits under (or beside) a wheel: one row per family or
 * per descriptor, a dot and a bar in the family's colour as long as the share
 * of people, and "6 de 7" at the right. Rows come from `countedFamilies` /
 * `countedDescriptors`, already in order; `labels` maps each id to its name.
 * A marked row (`marked`: the ids the reader chose) gets a small ring.
 */
export function PdfCountedList({
  items,
  labels,
  ofWord,
  width,
  maxRows = 10,
  labelWidth = 120,
  marked,
  markLabel,
  colors = PDF_FLAVOR_FAMILY_COLORS,
}: {
  items: readonly CountedNode[];
  /** id (a wheel node) -> its name in the reader's language. */
  labels: Readonly<Record<string, string>>;
  /** "de" / "of". */
  ofWord: string;
  width: number;
  maxRows?: number;
  labelWidth?: number;
  marked?: readonly string[];
  /** What the ring means ("elegido por ti"): drawn as a legend line under the
   *  list when a visible row is marked. The ring is a drawing, not a character. */
  markLabel?: string;
  colors?: PdfFlavorFamilyColors;
}) {
  const rows = items.slice(0, maxRows);
  const markedIds = new Set(marked ?? []);
  const legend = markLabel && rows.some((r) => markedIds.has(r.id)) ? sanitizePdfText(markLabel) : null;
  const listHeight = Math.max(COUNTED_ROW_H, rows.length * COUNTED_ROW_H);
  const height = listHeight + (legend ? COUNTED_ROW_H : 0);
  const barX = COUNTED_DOT + labelWidth + BAR_GAP;
  const barW = Math.max(1, width - barX - COUNTED_VALUE_W - BAR_GAP);
  return (
    <Svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      {rows.flatMap((row, i) => {
        const y = i * COUNTED_ROW_H;
        const mid = y + COUNTED_ROW_H / 2;
        const textY = mid + COUNTED_FONT * 0.35;
        const color = colors[row.family];
        const name = sanitizePdfText(labels[row.id] ?? row.id);
        return [
          <Circle key={`dot-${row.id}`} cx={COUNTED_DOT_X} cy={mid} r={3} fill={color} />,
          markedIds.has(row.id) ? (
            <Circle key={`mark-${row.id}`} cx={COUNTED_DOT_X} cy={mid} r={5} stroke={INK} strokeWidth={0.8} fill="none" />
          ) : null,
          <FlavorText key={`name-${row.id}`} x={COUNTED_DOT} y={textY} fontSize={COUNTED_FONT} fontFamily={SANS} fill={INK}>
            {ellipsize(name, labelWidth, COUNTED_FONT)}
          </FlavorText>,
          <Rect key={`track-${row.id}`} x={barX} y={mid - BAR_HEIGHT / 2} width={barW} height={BAR_HEIGHT} fill={HAIR} fillOpacity={0.5} />,
          <Rect
            key={`bar-${row.id}`}
            x={barX}
            y={mid - BAR_HEIGHT / 2}
            width={Math.max(BAR_MIN_WIDTH, (row.bar.pct / 100) * barW)}
            height={BAR_HEIGHT}
            fill={color}
          />,
          <FlavorText
            key={`value-${row.id}`}
            x={width}
            y={textY}
            fontSize={COUNTED_FONT}
            fontFamily={SANS}
            fill={INK}
            textAnchor="end"
          >
            {`${row.bar.count} ${ofWord} ${row.bar.n}`}
          </FlavorText>,
        ];
      })}
      {legend
        ? [
            <Circle key="legend-ring" cx={COUNTED_DOT_X} cy={listHeight + COUNTED_ROW_H / 2 + 1} r={5} stroke={INK} strokeWidth={0.8} fill="none" />,
            <FlavorText
              key="legend-text"
              x={COUNTED_DOT}
              y={listHeight + COUNTED_ROW_H / 2 + 1 + 7.5 * 0.35}
              fontSize={7.5}
              fontFamily={SANS}
              fill={SOFT}
            >
              {legend}
            </FlavorText>,
          ]
        : null}
    </Svg>
  );
}
