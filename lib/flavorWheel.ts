// The counted flavour wheel and its comparison layer: pure geometry (package
// R1a of docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, sections 6 and 6b).
//
//   one coffee   -> a wheel: the nine flavour families at fixed angles, each
//                   petal as long as the number of PEOPLE who found that family,
//                   a ring per person, and the counted list under it;
//   comparison   -> territories: inside each family's sector the edge runs ON
//                   the ring of its count (a plateau), with short joins between
//                   families. Drawn alone (up to three coffees) or over one
//                   coffee's petals (up to two others).
//
// Plain numbers and SVG path strings out. No React, no DOM, no `window`, no
// colour: a family id goes in and comes out, and the caller maps it to the
// palette. The same call feeds a React <svg> and @react-pdf/renderer's <Svg>
// (same split as lib/pdf/chartMath.ts next to lib/pdf/charts.tsx), and the same
// input always gives byte-identical output: coordinates are rounded to one
// decimal of the frame's own units and every list is in the wheel's order.
//
// WHEEL NODE IDS ONLY. An id of another vocabulary (main tastes, the acidity /
// sweetness / mouthfeel sets) must never be passed: the main taste `sweet` and
// the flavour family `sweet` share one id and cannot be told apart here.
// Display-only: scoring, the trigger and AggregateScore never read this file.

import {
  FLAVOR_WHEEL,
  flavorNodeById,
  migrateFlavorId,
  type FlavorLevel,
} from "@/lib/constants";
import { normalizeDescriptorId } from "@/lib/descriptors";
import { countBar, type CountBar } from "@/lib/resultsScales";

// ── The nine families, in the wheel's order ──────────────────────────────────

/**
 * The flavour families clockwise, the first one just left of twelve o'clock.
 * It is the order drawn in the approved mock (the flavour wheel's own order),
 * NOT the order of `FLAVOR_WHEEL` in lib/constants.ts (the picker's). The same
 * family is always at the same angle, on every wheel and every comparison.
 * WAITS ON KIM (RESULTS-DESIGN section 12): whether this is the order cuppers
 * expect, and whether the wheel should count by family or one level down. It
 * has no code in docs/product/kim-validar-S10.md yet.
 */
export const WHEEL_FAMILY_ORDER = [
  "floral",
  "fruity",
  "sour_fermented",
  "green_veg",
  "other",
  "roasted",
  "spice",
  "nutty_cocoa",
  "sweet",
] as const;

export type WheelFamilyId = (typeof WHEEL_FAMILY_ORDER)[number];

const FAMILY_COUNT = WHEEL_FAMILY_ORDER.length;
/** Degrees of the circle each family owns. */
export const SECTOR_DEG = 360 / FAMILY_COUNT;
/** Half the width of a petal: it leaves a 6 degree gap between two petals. */
export const PETAL_HALF_DEG = 17;
/** Half the width of a territory's plateau ("as wide as the middle of a petal"). */
export const PLATEAU_HALF_DEG = 12;
/** How far, in degrees, a join's control point continues along each ring. */
export const JOIN_PULL_DEG = 5.3;
/** Distance from the outer ring to a label's anchor point, in frame units. */
export const LABEL_GAP = 11;
/** Rings are one per person up to this many people; beyond it, quarters. */
export const RING_PER_PERSON_MAX = 10;

const FAMILY_INDEX: ReadonlyMap<string, number> = new Map(
  WHEEL_FAMILY_ORDER.map((id, i) => [id, i] as const),
);
const NODE_ORDER: ReadonlyMap<string, number> = new Map(
  FLAVOR_WHEEL.map((node, i) => [node.id, i] as const),
);

/** The L1 family of a wheel node (itself for a family), or null off the wheel. */
export function wheelFamilyOf(nodeId: string): WheelFamilyId | null {
  let node = flavorNodeById(nodeId);
  while (node && node.parentId) node = flavorNodeById(node.parentId);
  return node && FAMILY_INDEX.has(node.id) ? (node.id as WheelFamilyId) : null;
}

// ── Counting people (on the server, before anything is drawn) ────────────────

/** People per wheel node id. A family (L1) id carries the people of its family. */
export type WheelCounts = Readonly<Record<string, number>>;

export type WheelPeople = {
  /** The cuppers the counts are "of": one per list passed, empty lists included. */
  n: number;
  /** People who picked exactly this node. Feeds the counted list of descriptors. */
  direct: Record<string, number>;
  /** People who picked this node or anything under it. Its L1 entries feed the wheel. */
  rollup: Record<string, number>;
};

/**
 * Count PEOPLE, never mentions: `selections` holds one list of wheel node ids
 * per included cupper (everything that cupper picked for this coffee, in any
 * section), and each cupper counts once per node and once per family however
 * many times they picked it. Retired ids are migrated (`migrateFlavorId`), a
 * legacy free-text id counts under `other` (as `collectDescriptors` does), and
 * an id that is not on the wheel is ignored. Records are built in the wheel's
 * order, so the result does not depend on the order of cuppers or of picks.
 */
export function countWheelPeople(selections: readonly (readonly string[])[]): WheelPeople {
  const direct = new Map<string, number>();
  const rollup = new Map<string, number>();
  for (const picks of selections) {
    const own = new Set<string>();
    const under = new Set<string>();
    for (const raw of picks) {
      if (typeof raw !== "string") continue;
      let node = flavorNodeById(migrateFlavorId(normalizeDescriptorId(raw).id));
      if (!node) continue;
      own.add(node.id);
      while (node) {
        under.add(node.id);
        node = node.parentId ? flavorNodeById(node.parentId) : undefined;
      }
    }
    own.forEach((id) => direct.set(id, (direct.get(id) ?? 0) + 1));
    under.forEach((id) => rollup.set(id, (rollup.get(id) ?? 0) + 1));
  }
  const inWheelOrder = (counts: Map<string, number>) => {
    const out: Record<string, number> = {};
    for (const node of FLAVOR_WHEEL) {
      const c = counts.get(node.id);
      if (c) out[node.id] = c;
    }
    return out;
  };
  return { n: selections.length, direct: inWheelOrder(direct), rollup: inWheelOrder(rollup) };
}

const people = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const panel = (n: number): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);

/** The nine family counts in `WHEEL_FAMILY_ORDER`, each cut to 0..n. */
export function familyCounts(counts: WheelCounts, n: number): number[] {
  const total = panel(n);
  return WHEEL_FAMILY_ORDER.map((id) => Math.min(total, people(counts[id])));
}

// ── Frames and polar helpers ─────────────────────────────────────────────────

/** A drawing's own coordinate system: use it as the SVG `viewBox`. */
export type WheelFrame = {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Radius of the centre: where a count of zero sits. */
  r0: number;
  /** Radius of the outer ring: where "everyone" sits. */
  R: number;
};

/** The three sizes of the design. `compare` has a wider centre so that zero and
 *  one are told apart; `mini` is drawn without labels or inner rings. */
export const WHEEL_FRAMES = {
  mini: { width: 80, height: 80, cx: 40, cy: 40, r0: 6, R: 36 },
  full: { width: 320, height: 246, cx: 160, cy: 123, r0: 14, R: 80 },
  compare: { width: 320, height: 246, cx: 160, cy: 123, r0: 24, R: 76 },
} as const satisfies Record<string, WheelFrame>;

/** One decimal, and never "-0": the precision of every coordinate in a path. */
function r1(v: number): number {
  const r = Math.round(v * 10) / 10;
  return r === 0 ? 0 : r;
}

export type Point = { x: number; y: number };

/** A point at radius `r` and `deg` degrees clockwise from twelve o'clock. */
export function wheelPoint(frame: WheelFrame, r: number, deg: number): Point {
  const t = ((deg - 90) * Math.PI) / 180;
  return { x: r1(frame.cx + r * Math.cos(t)), y: r1(frame.cy + r * Math.sin(t)) };
}

const xy = (p: Point) => `${p.x} ${p.y}`;

/** The angle at the middle of a family's sector, clockwise from twelve o'clock. */
export function familyAngle(index: number): number {
  return (index - 0.5) * SECTOR_DEG;
}

/** The slice of the circle a family owns. The nine tile the full circle. */
export function familySector(index: number): { start: number; centre: number; end: number } {
  const centre = familyAngle(index);
  return { start: centre - SECTOR_DEG / 2, centre, end: centre + SECTOR_DEG / 2 };
}

/** The radius of the ring of `count` people out of `n` (r0 for zero, R for everyone). */
export function ringRadius(frame: WheelFrame, count: number, n: number): number {
  const total = panel(n);
  if (total === 0) return r1(frame.r0);
  const c = Math.min(total, people(count));
  return r1(frame.r0 + ((frame.R - frame.r0) * c) / total);
}

export type WheelRing = { people: number; radius: number; outer: boolean };

/**
 * The quiet ground: a ring per person (the scale the petals are read on), or
 * quarters of the panel beyond ten people. The last one is always the outer
 * ring; with nobody (n = 0) only the outer ring is drawn.
 */
export function wheelRings(frame: WheelFrame, n: number): WheelRing[] {
  const total = panel(n);
  if (total === 0) return [{ people: 0, radius: r1(frame.R), outer: true }];
  const steps =
    total <= RING_PER_PERSON_MAX
      ? Array.from({ length: Math.ceil(total) }, (_, i) => Math.min(total, i + 1))
      : [total / 4, total / 2, (3 * total) / 4, total];
  return steps.map((k) => ({ people: k, radius: ringRadius(frame, k, total), outer: k === total }));
}

// ── The wheel (one coffee) ───────────────────────────────────────────────────

/** A petal: the family's sector from the centre out to the ring of its count.
 *  `null` when nobody found the family: a zero takes no space. */
export function petalPath(frame: WheelFrame, index: number, count: number, n: number): string | null {
  if (panel(n) === 0 || people(count) === 0) return null;
  const rr = ringRadius(frame, count, n);
  const r0 = r1(frame.r0);
  const a = familyAngle(index);
  const a0 = a - PETAL_HALF_DEG;
  const a1 = a + PETAL_HALF_DEG;
  return (
    `M ${xy(wheelPoint(frame, rr, a0))} A ${rr} ${rr} 0 0 1 ${xy(wheelPoint(frame, rr, a1))}` +
    ` L ${xy(wheelPoint(frame, r0, a1))} A ${r0} ${r0} 0 0 0 ${xy(wheelPoint(frame, r0, a0))} Z`
  );
}

export type WheelPetal = {
  family: WheelFamilyId;
  index: number;
  /** People who found the family, cut to 0..n. */
  count: number;
  /** Degrees clockwise from twelve o'clock, at the middle of the petal. */
  angle: number;
  /** Where the petal ends: the ring of its count. */
  radius: number;
  /** SVG path, or null when the count is zero. */
  d: string | null;
};

export type WheelLabel = {
  family: WheelFamilyId;
  index: number;
  /** The anchor point, just outside the outer ring on the family's angle. */
  x: number;
  y: number;
  /** `text-anchor`: the text grows away from the wheel. */
  anchor: "start" | "middle" | "end";
  /** Where the lines stack from the anchor: upward, downward, or centred on it. */
  side: "above" | "below" | "beside";
};

/** Where a family's name and number are written. Every family has a label,
 *  also the ones nobody found (the caller prints them muted). */
export function wheelLabel(frame: WheelFrame, index: number): WheelLabel {
  const a = familyAngle(index);
  const t = ((a - 90) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const p = wheelPoint(frame, frame.R + LABEL_GAP, a);
  return {
    family: WHEEL_FAMILY_ORDER[index],
    index,
    x: p.x,
    y: p.y,
    anchor: cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle",
    side: sin < -0.5 ? "above" : sin > 0.5 ? "below" : "beside",
  };
}

export type WheelGeometry = {
  frame: WheelFrame;
  /** The cuppers the counts are "of". */
  n: number;
  rings: WheelRing[];
  /** All nine families in the wheel's order; `d` is null where the count is zero. */
  petals: WheelPetal[];
  labels: WheelLabel[];
  /** The family most people found (the first in the wheel's order on a tie),
   *  or null when nobody picked anything. */
  top: { family: WheelFamilyId; count: number } | null;
};

function petalsOf(frame: WheelFrame, counts: readonly number[], n: number): WheelPetal[] {
  return WHEEL_FAMILY_ORDER.map((family, index) => ({
    family,
    index,
    count: counts[index],
    angle: familyAngle(index),
    radius: ringRadius(frame, counts[index], n),
    d: petalPath(frame, index, counts[index], n),
  }));
}

/** The family with the most people in `counts` (wheel order), skipping `skip`. */
function largest(counts: readonly number[], skip?: ReadonlySet<number>): number {
  let best = -1;
  counts.forEach((c, i) => {
    if (skip?.has(i)) return;
    if (best < 0 || c > counts[best]) best = i;
  });
  return best;
}

/**
 * Everything one counted wheel draws. `counts` is people per wheel node id (the
 * `rollup` of `countWheelPeople`); only its nine family entries are read.
 * Sizes: `WHEEL_FRAMES.full` (the sheet), `.mini` (tiles and cards: draw the
 * petals and the outer ring only).
 */
export function wheelGeometry(
  counts: WheelCounts,
  n: number,
  frame: WheelFrame = WHEEL_FRAMES.full,
): WheelGeometry {
  const total = panel(n);
  const fam = familyCounts(counts, total);
  const best = largest(fam);
  return {
    frame,
    n: total,
    rings: wheelRings(frame, total),
    petals: petalsOf(frame, fam, total),
    labels: WHEEL_FAMILY_ORDER.map((_, index) => wheelLabel(frame, index)),
    top: best >= 0 && fam[best] > 0 ? { family: WHEEL_FAMILY_ORDER[best], count: fam[best] } : null,
  };
}

// ── The comparison layer (territories) ───────────────────────────────────────

/**
 * A territory's outline. Inside each family's sector the edge is an arc ON the
 * ring of that family's count, `PLATEAU_HALF_DEG` to each side of its angle;
 * only the joins between two families are curves, and nothing between two
 * counts is interpolated. A plateau lies exactly where the same coffee's petal
 * would end. `familyCountsInOrder` has one count per `WHEEL_FAMILY_ORDER` entry.
 */
export function territoryPath(
  frame: WheelFrame,
  familyCountsInOrder: readonly number[],
  n: number,
): string {
  const rr = WHEEL_FAMILY_ORDER.map((_, i) => ringRadius(frame, familyCountsInOrder[i] ?? 0, n));
  let d = `M ${xy(wheelPoint(frame, rr[0], familyAngle(0) - PLATEAU_HALF_DEG))}`;
  for (let i = 0; i < FAMILY_COUNT; i++) {
    const j = (i + 1) % FAMILY_COUNT;
    const ai = familyAngle(i);
    const aj = familyAngle(j);
    const end = wheelPoint(frame, rr[i], ai + PLATEAU_HALF_DEG);
    const c1 = wheelPoint(frame, rr[i], ai + PLATEAU_HALF_DEG + JOIN_PULL_DEG);
    const c2 = wheelPoint(frame, rr[j], aj - PLATEAU_HALF_DEG - JOIN_PULL_DEG);
    const next = wheelPoint(frame, rr[j], aj - PLATEAU_HALF_DEG);
    d += ` A ${rr[i]} ${rr[i]} 0 0 1 ${xy(end)} C ${xy(c1)} ${xy(c2)} ${xy(next)}`;
  }
  return `${d} Z`;
}

/** How many coffees one comparison draws (RESULTS-DESIGN 6b). */
export const COMPARE_LIMITS = {
  /** Territories alone, in the overview: no coffee is the base. */
  alone: 3,
  /** Territories laid over one coffee's petals, on its sheet. */
  overPetals: 2,
} as const;

export type CompareSeries = {
  /** The caller's own id for the coffee (a sample id or its letter); passed through. */
  id: string;
  /** People per wheel node id for this coffee. */
  counts: WheelCounts;
  /** The cuppers this coffee's counts are "of". */
  n: number;
};

export type Territory = {
  id: string;
  /** 0 for the first territory, 1 for the second...: the caller's line style. */
  order: number;
  d: string;
  /** Where the coffee's letter sits: on its own edge, at the family where it
   *  reaches furthest among those no earlier territory has taken. */
  tag: { family: WheelFamilyId; index: number; x: number; y: number };
};

export type CompareLabel = WheelLabel & {
  /** This family's count for every coffee drawn, the base first. */
  counts: number[];
  /** Nobody found this family in any of the coffees drawn. */
  empty: boolean;
};

export type CompareTable = {
  /** The coffees drawn, the base first. */
  series: { id: string; n: number; role: "petals" | "territory" }[];
  /** Families somebody found in at least one of them, in the wheel's order. */
  rows: { family: WheelFamilyId; index: number; counts: number[] }[];
};

export type CompareGeometry = {
  frame: WheelFrame;
  /** The scale of the rings: the largest panel among the coffees drawn. A ring
   *  is a number of PEOPLE, so coffees cupped by different numbers of cuppers
   *  share one honest scale; the table's header carries each coffee's own n. */
  n: number;
  rings: WheelRing[];
  /** The base coffee's petals; empty when the territories are drawn alone. */
  petals: WheelPetal[];
  territories: Territory[];
  labels: CompareLabel[];
  /** Print the counts beside each family's name: only with two coffees or fewer
   *  (three cannot each carry a number on the drawing; the table does). */
  countsOnLabels: boolean;
  /** The exact reading and the text equivalent of the drawing. */
  table: CompareTable;
  /** Ids left out because the comparison was full (`COMPARE_LIMITS`). */
  dropped: string[];
};

/**
 * The comparison drawing. With `base`, that coffee keeps its petals and up to
 * two `others` are laid over them as territories; without it, up to three
 * `others` are drawn as territories alone. Extra coffees are not drawn and are
 * listed in `dropped`. Territories keep the order given.
 */
export function compareGeometry(
  input: { base?: CompareSeries | null; others: readonly CompareSeries[] },
  frame: WheelFrame = WHEEL_FRAMES.compare,
): CompareGeometry {
  const base = input.base ?? null;
  const limit = base ? COMPARE_LIMITS.overPetals : COMPARE_LIMITS.alone;
  const drawn = input.others.slice(0, limit);
  const all = base ? [base, ...drawn] : drawn;
  const n = all.reduce((max, s) => Math.max(max, panel(s.n)), 0);
  // Each coffee's counts are cut to its OWN panel, then drawn on the shared rings.
  const fam = (s: CompareSeries) => familyCounts(s.counts, s.n);
  const allCounts = all.map(fam);

  const taken = new Set<number>();
  const territories = drawn.map((s, order): Territory => {
    const counts = fam(s);
    const at = largest(counts, taken);
    taken.add(at);
    const p = wheelPoint(frame, ringRadius(frame, counts[at], n), familyAngle(at));
    return {
      id: s.id,
      order,
      d: territoryPath(frame, counts, n),
      tag: { family: WHEEL_FAMILY_ORDER[at], index: at, x: p.x, y: p.y },
    };
  });

  const labels = WHEEL_FAMILY_ORDER.map((_, index): CompareLabel => {
    const counts = allCounts.map((c) => c[index]);
    return { ...wheelLabel(frame, index), counts, empty: counts.every((c) => c === 0) };
  });

  return {
    frame,
    n,
    rings: wheelRings(frame, n),
    petals: base ? petalsOf(frame, fam(base), n) : [],
    territories,
    labels,
    countsOnLabels: all.length <= 2,
    table: {
      series: all.map((s, i) => ({
        id: s.id,
        n: panel(s.n),
        role: base && i === 0 ? ("petals" as const) : ("territory" as const),
      })),
      rows: labels
        .filter((l) => !l.empty)
        .map((l) => ({ family: l.family, index: l.index, counts: l.counts })),
    },
    dropped: input.others.slice(limit).map((s) => s.id),
  };
}

// ── The counted list (always under the full wheel) ───────────────────────────

export type CountedNode = {
  /** A wheel node id. */
  id: string;
  level: FlavorLevel;
  /** Its family: the caller's colour and the petal it belongs to. */
  family: WheelFamilyId;
  /** "count de n": people, share and the bar's length. */
  bar: CountBar;
};

function counted(ids: readonly string[], counts: WheelCounts, n: number, top?: number): CountedNode[] {
  const rows: CountedNode[] = [];
  for (const id of ids) {
    const node = flavorNodeById(id);
    const family = wheelFamilyOf(id);
    const bar = countBar(people(counts[id]), n);
    if (!node || !family || bar.count === 0) continue;
    rows.push({ id, level: node.level, family, bar });
  }
  // `ids` arrive in the wheel's order, and Array.prototype.sort is stable: equal
  // counts keep that order, so the list never reshuffles between renders.
  rows.sort((a, b) => b.bar.count - a.bar.count);
  return typeof top === "number" && top >= 0 ? rows.slice(0, top) : rows;
}

/** The nine families as counted bars: most people first, equal counts in the
 *  wheel's order, families nobody found left out. */
export function countedFamilies(counts: WheelCounts, n: number, top?: number): CountedNode[] {
  return counted(WHEEL_FAMILY_ORDER, counts, n, top);
}

/**
 * The descriptors as counted bars ("Frutos rojos · 6 de 7"): pass the `direct`
 * counts of `countWheelPeople`. Most people first; equal counts in the wheel's
 * order (family by family clockwise, then as the wheel lists them). Only ids
 * that are on the wheel are listed.
 */
export function countedDescriptors(direct: WheelCounts, n: number, top?: number): CountedNode[] {
  const ids = Object.keys(direct)
    .filter((id) => NODE_ORDER.has(id) && wheelFamilyOf(id) !== null)
    .sort((a, b) => {
      const fa = FAMILY_INDEX.get(wheelFamilyOf(a) as string) as number;
      const fb = FAMILY_INDEX.get(wheelFamilyOf(b) as string) as number;
      return fa - fb || (NODE_ORDER.get(a) as number) - (NODE_ORDER.get(b) as number);
    });
  return counted(ids, direct, n, top);
}
