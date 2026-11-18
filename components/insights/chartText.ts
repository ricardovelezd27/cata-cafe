// T4c: the text sizes of the Insights charts, in one place. Recharts sets them
// through props, not classes, so the type scale cannot reach them by name.
// DESIGN.md: data is never under 12 px; a tick or a label inside a drawing is
// at least 12 px, and the legend and the tooltip are HTML, so they take the
// caption size (12.25 px at the 14 px root).

/** Axis ticks and pie labels, inside the SVG. */
export const CHART_TICK_PX = 12;

/** The legend and the tooltip: HTML beside the drawing, at the caption size. */
export const CHART_HTML_PX = 12.25;

export const chartTick = (fill: string) => ({ fontSize: CHART_TICK_PX, fill });
