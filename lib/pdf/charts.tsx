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
import { Svg, Rect, Line, Polyline, Text } from "@react-pdf/renderer";

const BRAND_GREEN = "#3D5A3E";
const INK = "#111111";
const SOFT = "#555555";
const HAIR = "#d9d3c4";

type SvgTextProps = {
  x: number;
  y: number;
  fontSize?: number;
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
}: {
  rows: PdfBarListRow[];
  width: number;
  maxRows?: number;
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
      <SvgText key={`l-${i}`} x={0} y={textY} fontSize={BAR_FONT_SIZE} fill={INK}>
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
