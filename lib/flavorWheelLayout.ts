// Where the words around a flavour wheel go ON SCREEN, and how large the wheel
// may be painted so that every word fits (package R1b of
// docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, sections 6 and 6b).
//
// lib/flavorWheel.ts says where the petals, the rings and the territories are.
// This file adds the one thing a screen needs that a fixed sheet of paper does
// not: a container of any width from 320 px up, with text that must PAINT at a
// fixed size (12 px or more) whatever the scale of the drawing. So the scale is
// an output: the wheel is painted as large as its labels allow.
//
//   fitWheelLabels  -> the scale, the viewBox and every label's lines;
//   wheelHeadline   -> the families most people found, for a caption.
//
// Pure: numbers and strings in, numbers and strings out. No React, no DOM, no
// colour, no word of the interface. A text's width is ESTIMATED from its length
// (no font is measured), a little wide on purpose, so a name is split one
// character early rather than clipped one character late (measured in the
// browser on the app's own face: the widest family name advances 0.58 em per
// character; the estimate is 0.6). No threshold, gate or
// geometry of lib/flavorWheel.ts is restated here: angles and points come from
// its functions. Display-only: scoring, the trigger and AggregateScore never
// read this file.

import {
  WHEEL_FAMILY_ORDER,
  familyAngle,
  familyCounts,
  wheelLabel,
  wheelPoint,
  type WheelCounts,
  type WheelFamilyId,
  type WheelFrame,
} from "@/lib/flavorWheel";

/** Painted sizes, in CSS pixels. They do not change with the wheel's scale. */
export type WheelLabelMetrics = {
  /** A family's name: the caption size of DESIGN.md (data is never under 12 px). */
  namePx: number;
  /** A family's count, in the display face. */
  numberPx: number;
  /** Estimated advance of an average character of a name, in em. */
  nameCharEm: number;
  /** Estimated advance of a digit of a count, in em. */
  numberCharEm: number;
  /** Line step of a two-line name, in em. */
  lineHeight: number;
  /** From the outer ring to the middle of a count (or to a name without one). */
  ringGapPx: number;
  /** Between a count and its name. */
  stackGapPx: number;
  /** Kept free at each edge of the drawing. */
  marginPx: number;
};

export const WHEEL_LABEL_METRICS: WheelLabelMetrics = {
  namePx: 12.25,
  numberPx: 17.5,
  nameCharEm: 0.6,
  numberCharEm: 0.56,
  lineHeight: 1.16,
  ringGapPx: 14,
  stackGapPx: 3,
  marginPx: 2,
};

/** Painted pixels per frame unit: never smaller (a wheel under 60 % of its
 *  frame is too small to read) and never larger than this. */
export const WHEEL_SCALE_LIMITS = { min: 0.6, max: 1.3 } as const;

export type WheelLabelText = {
  /** The family's name, in the reader's language. */
  name: string;
  /** Its count as printed ("7"), or null when the drawing prints no numbers. */
  number: string | null;
};

export type FittedWheelLabel = {
  family: WheelFamilyId;
  index: number;
  /** The count, centred on the family's angle just outside the outer ring. */
  number: { text: string; x: number; y: number } | null;
  /** The name: one or two lines, each with its baseline. */
  name: { anchor: "start" | "middle" | "end"; x: number; lines: { text: string; y: number }[] };
};

export type WheelLabelLayout = {
  /** Painted pixels per frame unit. */
  k: number;
  /** Font sizes in FRAME units (painted size divided by k). */
  nameSize: number;
  numberSize: number;
  /** The SVG `viewBox`: the frame, cut or widened to the container's shape. */
  viewBox: { x: number; y: number; width: number; height: number };
  labels: FittedWheelLabel[];
};

const r2 = (v: number): number => {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
};

/** "Ácido/Fermentado" -> ["Ácido/", "Fermentado"]; a name with no "/" stays whole. */
function splitName(name: string): string[] {
  const cut = name.indexOf("/");
  if (cut <= 0 || cut === name.length - 1) return [name];
  return [`${name.slice(0, cut).trim()}/`, name.slice(cut + 1).trim()];
}

type Box = { left: number; right: number; top: number; bottom: number };

type Draft = FittedWheelLabel & { boxes: Box[] };

function textBox(anchor: "start" | "middle" | "end", x: number, baseline: number, width: number, size: number): Box {
  const left = anchor === "start" ? x : anchor === "end" ? x - width : x - width / 2;
  return { left, right: left + width, top: baseline - size * 0.8, bottom: baseline + size * 0.25 };
}

/** One label at scale k, with the boxes its texts are estimated to cover. */
function draftLabel(
  frame: WheelFrame,
  index: number,
  text: WheelLabelText,
  lines: readonly string[],
  k: number,
  m: WheelLabelMetrics,
): Draft {
  const at = wheelLabel(frame, index);
  const nameSize = m.namePx / k;
  const step = nameSize * m.lineHeight;
  const widthOf = (s: string) => s.length * nameSize * m.nameCharEm;
  const p = wheelPoint(frame, frame.R + m.ringGapPx / k, familyAngle(index));
  const boxes: Box[] = [];

  if (text.number === null) {
    // No count: the name starts at the ring, as on the comparison drawing.
    const first =
      at.side === "above"
        ? p.y - (lines.length - 1) * step
        : at.side === "below"
          ? p.y + nameSize * 0.75
          : p.y + nameSize * 0.35 - ((lines.length - 1) * step) / 2;
    const placed = lines.map((line, j) => ({ text: line, y: r2(first + j * step) }));
    placed.forEach((l) => boxes.push(textBox(at.anchor, p.x, l.y, widthOf(l.text), nameSize)));
    return { family: at.family, index, number: null, name: { anchor: at.anchor, x: p.x, lines: placed }, boxes };
  }

  // The count sits ON the family's angle, like a numeral on a clock face; the
  // name hangs from it on the side away from the wheel's horizontal axis, so it
  // never runs into the ring where the ring bulges.
  const numberSize = m.numberPx / k;
  const numberWidth = text.number.length * numberSize * m.numberCharEm;
  const numberY = p.y + numberSize * 0.34;
  boxes.push(textBox("middle", p.x, numberY, numberWidth, numberSize));
  const above = p.y < frame.cy;
  const nameX = at.anchor === "start" ? p.x - numberWidth / 2 : at.anchor === "end" ? p.x + numberWidth / 2 : p.x;
  const first = above
    ? p.y - numberSize * 0.44 - m.stackGapPx / k - nameSize * 0.25 - (lines.length - 1) * step
    : p.y + numberSize * 0.44 + m.stackGapPx / k + nameSize * 0.8;
  const placed = lines.map((line, j) => ({ text: line, y: r2(first + j * step) }));
  placed.forEach((l) => boxes.push(textBox(at.anchor, nameX, l.y, widthOf(l.text), nameSize)));
  return {
    family: at.family,
    index,
    number: { text: text.number, x: p.x, y: r2(numberY) },
    name: { anchor: at.anchor, x: r2(nameX), lines: placed },
    boxes,
  };
}

/**
 * Fit the nine labels of a wheel into a container `width` pixels wide.
 *
 * The scale is the largest at which every label stays inside the container
 * (never over `WHEEL_SCALE_LIMITS.max`). A two-part name ("Ácido/Fermentado")
 * takes one line where that costs the wheel nothing, and two where it lets the
 * wheel be larger. Under `WHEEL_SCALE_LIMITS.min` the scale stops shrinking and
 * a name that still does not fit is cut with "…" (a container under about
 * 240 px: the counted list under the wheel still carries every name).
 *
 * `texts` has one entry per family in `WHEEL_FAMILY_ORDER`. `width` 0 or less
 * means "not measured yet": the frame's own width is used.
 */
export function fitWheelLabels(input: {
  frame: WheelFrame;
  width: number;
  texts: readonly WheelLabelText[];
  metrics?: WheelLabelMetrics;
}): WheelLabelLayout {
  const { frame } = input;
  const m = input.metrics ?? WHEEL_LABEL_METRICS;
  const width = Number.isFinite(input.width) && input.width > 0 ? input.width : frame.width;
  const texts = WHEEL_FAMILY_ORDER.map((family, i) => ({
    name: input.texts[i]?.name ?? family,
    number: input.texts[i]?.number ?? null,
  }));
  const split = texts.map((t) => splitName(t.name));
  const whole = texts.map((t) => [t.name]);

  const half = (k: number) => width / (2 * k) - m.marginPx / k;
  const inside = (d: Draft, k: number) =>
    d.boxes.every((b) => b.left >= frame.cx - half(k) - 1e-6 && b.right <= frame.cx + half(k) + 1e-6);
  const draft = (lines: readonly (readonly string[])[], k: number) =>
    texts.map((t, i) => draftLabel(frame, i, t, lines[i], k, m));
  const fits = (lines: readonly (readonly string[])[], k: number) => draft(lines, k).every((d) => inside(d, k));

  // The largest scale at which the split names fit: a smaller scale always
  // leaves more room, so a bisection finds it.
  let k: number = WHEEL_SCALE_LIMITS.max;
  if (!fits(split, k)) {
    let lo: number = WHEEL_SCALE_LIMITS.min;
    let hi: number = WHEEL_SCALE_LIMITS.max;
    if (!fits(split, lo)) {
      k = lo;
    } else {
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (fits(split, mid)) lo = mid;
        else hi = mid;
      }
      k = Math.floor(lo * 100) / 100;
    }
  }

  // At that scale a name goes back to one line wherever one line also fits.
  const lines = texts.map((t, i) => {
    if (split[i].length === 1) return split[i];
    const one = draftLabel(frame, i, t, whole[i], k, m);
    return inside(one, k) ? whole[i] : split[i];
  });

  // Last resort (the scale is at its floor): cut what still does not fit.
  const nameSize = m.namePx / k;
  const cut = lines.map((own, i) => {
    const d = draftLabel(frame, i, texts[i], own, k, m);
    if (inside(d, k)) return own;
    const at = wheelLabel(frame, i);
    const x = d.name.x;
    const room =
      at.anchor === "start"
        ? frame.cx + half(k) - x
        : at.anchor === "end"
          ? x - (frame.cx - half(k))
          : 2 * Math.min(x - (frame.cx - half(k)), frame.cx + half(k) - x);
    const maxChars = Math.max(1, Math.floor(room / (nameSize * m.nameCharEm)));
    return own.map((line) => (line.length <= maxChars ? line : `${line.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`));
  });

  const placed = draft(cut, k);
  const boxes = placed.flatMap((d) => d.boxes);
  const pad = m.marginPx / k;
  const top = Math.min(frame.cy - frame.R, ...boxes.map((b) => b.top)) - pad;
  const bottom = Math.max(frame.cy + frame.R, ...boxes.map((b) => b.bottom)) + pad;
  const vbWidth = width / k;
  return {
    k,
    nameSize: r2(nameSize),
    numberSize: r2(m.numberPx / k),
    viewBox: { x: r2(frame.cx - vbWidth / 2), y: r2(top), width: r2(vbWidth), height: r2(bottom - top) },
    labels: placed.map((d) => ({ family: d.family, index: d.index, number: d.number, name: d.name })),
  };
}

// ── The caption of a wheel ───────────────────────────────────────────────────

export type WheelHeadline = {
  /** The cuppers the counts are "of". */
  n: number;
  /** The largest number of people who found one family. */
  count: number;
  /** Every family found by that many people, in the wheel's order. */
  families: WheelFamilyId[];
  /** How many of the nine families somebody found. */
  found: number;
};

/**
 * What a caption can say about one wheel WITHOUT judging it: the families most
 * people found, how many people that is, and how many families appear at all.
 * No threshold: a panel that agreed on little simply reads "2 de 7" here.
 * Null when nobody picked a flavour.
 */
export function wheelHeadline(counts: WheelCounts, n: number): WheelHeadline | null {
  const fam = familyCounts(counts, n);
  const count = Math.max(0, ...fam);
  if (count === 0) return null;
  return {
    n: typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0,
    count,
    families: WHEEL_FAMILY_ORDER.filter((_, i) => fam[i] === count),
    found: fam.filter((c) => c > 0).length,
  };
}
