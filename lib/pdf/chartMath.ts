// Pure geometry/number helpers for lib/pdf/charts.tsx. No react-pdf import so
// they can be unit-tested under vitest.

export type XY = { x: number; y: number };

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Whole-percent share of `total`; 0 when total is 0 (or not positive). */
export function percentOf(count: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(count)) return 0;
  return Math.round((count / total) * 100);
}

/**
 * Point for spoke `index` of `count`, value mapped from [min,max] onto
 * [0,radius]. Spoke 0 points straight up; spokes proceed clockwise. Values
 * outside [min,max] are clamped.
 */
export function radarPoint(
  index: number,
  count: number,
  value: number,
  min: number,
  max: number,
  radius: number,
  cx: number,
  cy: number,
): XY {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, count);
  const span = max - min;
  const t = span > 0 ? Math.min(1, Math.max(0, (value - min) / span)) : 0;
  return { x: cx + Math.cos(angle) * radius * t, y: cy + Math.sin(angle) * radius * t };
}

/** SVG `points` string for one series polygon (one value per axis). */
export function radarPolygonPoints(
  values: number[],
  min: number,
  max: number,
  radius: number,
  cx: number,
  cy: number,
): string {
  return values
    .map((v, i) => {
      const p = radarPoint(i, values.length, v, min, max, radius, cx, cy);
      return `${round2(p.x)},${round2(p.y)}`;
    })
    .join(" ");
}

/** Label anchor from the spoke's horizontal position relative to centre. */
export function anchorForAngle(index: number, count: number): "start" | "middle" | "end" {
  const cos = Math.cos(-Math.PI / 2 + (2 * Math.PI * index) / Math.max(1, count));
  if (cos > 0.2) return "start";
  if (cos < -0.2) return "end";
  return "middle";
}
