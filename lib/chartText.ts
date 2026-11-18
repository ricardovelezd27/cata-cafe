// The text sizes of the charts, in one place (T4c for Insights; shared with the
// results in T4d). A chart's text is set through props or a CSS module, not a
// class, so the type scale cannot reach it by name.
// DESIGN.md: data is never under 12 px; a tick or a label inside a drawing is at
// least 12 px, and the text beside a drawing is HTML at the caption size.
//
// Who reads it:
// - Insights: InsightChart, PivotChart, TrendChart, OriginContextPanel (ticks,
//   pie labels, legend, tooltip);
// - results: FlavorCompare (the territory tags).
// The two tick rules written in CSS (RankStrip.module.css, DotPlot.module.css
// `.tickText`) cannot import this file: tests/typeScale.test.ts pins them to
// CHART_TICK_PX. The flavour wheel's own text is laid out in
// lib/flavorWheelLayout.ts (names at 12.25 px, numbers at 17.5 px painted).

/** Axis ticks and pie labels, inside the SVG: the drawing floor. */
export const CHART_TICK_PX = 12;

/** A label drawn inside the SVG at the caption size (12.25 px at the 14 px root). */
export const CHART_CAPTION_PX = 12.25;

/** The legend and the tooltip: HTML beside the drawing, at the caption size. */
export const CHART_HTML_PX = CHART_CAPTION_PX;

export const chartTick = (fill: string) => ({ fontSize: CHART_TICK_PX, fill });
