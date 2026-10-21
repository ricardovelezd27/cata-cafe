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
import { Svg, Rect, Line, Polyline, Polygon, Circle, Text, View } from "@react-pdf/renderer";
import { SANS } from "./fonts";
import { PDF_PALETTE, type ScoreBand } from "./palette";
import { formatSignedDelta } from "../referenceDelta";
import { anchorForAngle, percentOf, radarPoint, radarPolygonPoints } from "./chartMath";

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

// ─── PdfScoreBand / PdfDeltaChip ─────────────────────────────────────────────

/** Rounded score pill coloured by traffic-light band. null score renders an em dash. */
export function PdfScoreBand({
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
