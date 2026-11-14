// The particle dialect of the product, in one place. Pure (no DOM, no React),
// unit-tested in tests/canvasParticles.test.ts.
//
// Two canvases draw dots: the landing's constellation
// (components/landing/journey/ConstellationCanvas.tsx, driven by scroll, with
// its own loop) and the warm-up's stage field
// (components/warmup/StageField.tsx, drawn from the player's single loop).
// They have different drivers, so they are two hosts; what makes them ONE
// language lives here: the same seeded randomness, the same way a dot eases to
// its place whatever the frame rate, the same idle drift, the same dot size on
// the same screen, the same colour parsing. The draw-cost governor both use is
// ./governor.ts. A third host must take these too (DESIGN.md).

export type RGB = [number, number, number];

/** Deterministic RNG: the same seed gives the same cloud on every mount. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How much of the way to its target a dot covers in one 60 Hz frame. */
export const EASE_RATE = 0.085;

/** The share of the remaining distance to cover in a frame that took `dtMs`,
 *  so the motion looks the same at 60, 30 or 10 frames a second. */
export function frameEase(dtMs: number, rate: number = EASE_RATE): number {
  if (dtMs <= 0) return 0;
  return 1 - Math.pow(1 - rate, dtMs / 16.667);
}

/** Side of a dot in CSS px, from the VIEWPORT (not the canvas), so a dot is
 *  the same size on the landing and in the warm-up on the same screen. */
export function dotSize(viewW: number, viewH: number, mobile: boolean): number {
  return Math.max(1.8, Math.min(viewW, viewH) * 0.0028) * (mobile ? 1.3 : 1);
}

/** Idle drift of one dot at `time` (seconds): slow, never periodic to the eye.
 *  `jit` is the formation's own jitter in px, `breath` a small constant sway. */
export function driftX(time: number, phaseA: number, phaseB: number, jit: number, breath: number): number {
  const n1 = Math.sin(time * 1.1 + phaseA);
  const n3 = Math.cos(time * 0.37 + phaseA * 0.5);
  return (n1 * 0.6 + n3 * 0.4) * jit + Math.cos(time * 0.45 + phaseB) * breath * 0.5;
}
export function driftY(time: number, phaseA: number, phaseB: number, jit: number, breath: number): number {
  const n2 = Math.sin(time * 0.63 + phaseB);
  const n3 = Math.cos(time * 0.37 + phaseA * 0.5);
  return (n2 * 0.7 + n3 * 0.3) * jit + Math.sin(time * 0.6 + phaseA) * breath;
}

/** Anything with a canvas context's colour parser (a 2D context in the app,
 *  a small fake in the tests). */
export interface ColorParser {
  fillStyle: string | CanvasGradient | CanvasPattern;
}

/** Resolve any CSS colour string to [r,g,b] through the canvas' own parser. */
export function resolveRgb(ctx: ColorParser, css: string, fallback: string): RGB {
  ctx.fillStyle = css || fallback;
  const norm = String(ctx.fillStyle);
  if (norm.startsWith("#") && norm.length >= 7) {
    return [parseInt(norm.slice(1, 3), 16), parseInt(norm.slice(3, 5), 16), parseInt(norm.slice(5, 7), 16)];
  }
  const m = norm.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  ctx.fillStyle = fallback;
  return resolveRgb(ctx, fallback, "#ffffff");
}

/** WCAG relative luminance of an sRGB colour. */
export function luminance([r, g, b]: RGB): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
