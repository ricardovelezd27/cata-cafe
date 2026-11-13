// S10 WP5b (B6, TODO(kim-validar:B6)): the same coffee served twice in one
// CLOSED session. Each cupper who evaluated BOTH samples sees the difference
// between their OWN two evaluations (total and each intensity), against the
// owner's tolerance of 2 points. No consistency score, no ranking of cuppers,
// nothing about anyone else. Pure; the page builds it server-side (the coffee
// id never leaves the server: only partner sample labels do).

import type { SessionFormat } from "@/lib/constants";
import { PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import { calcIndividualScore, isAffectiveComplete } from "@/lib/scoring";
import type { ScoreRule } from "@/lib/scoreRule";

/** Within this many points (inclusive) the two evaluations read "dentro de la tolerancia". */
export const REPEAT_TOLERANCE = 2;

export type PairSample = {
  id: string;
  position: number;
  coffeeId: string | null;
  revealed: boolean;
  /** An anchor-mode reference is pinned (its ratings are not an opinion): never paired. */
  isAnchorReference: boolean;
};

/** sampleId -> the samples it is compared with. Samples of one coffee are
 *  compared with the FIRST of them by position; the first is compared with each
 *  of the others. Only revealed, coffee-linked, non-anchor samples take part. */
export function repeatedSamplePartners(samples: readonly PairSample[]): Map<string, string[]> {
  const byCoffee = new Map<string, PairSample[]>();
  for (const s of samples) {
    if (!s.coffeeId || !s.revealed || s.isAnchorReference) continue;
    const list = byCoffee.get(s.coffeeId);
    if (list) list.push(s);
    else byCoffee.set(s.coffeeId, [s]);
  }
  const out = new Map<string, string[]>();
  for (const list of byCoffee.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.position - b.position);
    const [first, ...rest] = list;
    out.set(first.id, rest.map((r) => r.id));
    for (const r of rest) out.set(r.id, [first.id]);
  }
  return out;
}

export type OwnEval = {
  data: Record<string, unknown>;
  cups?: number | null;
  rule?: ScoreRule;
};

export type RepeatDiffRow = {
  /** "total" or an intensity attribute id. */
  id: string;
  /** Localized attribute name ("" for the total). */
  label: string;
  /** This sample's value, the partner's value, and a - b. */
  mine: number;
  other: number;
  diff: number;
  within: boolean;
};

const positive = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The viewer's two own evaluations compared. `mine` is the sample whose
 *  drill-down is open. Null when there is nothing both evaluations have. */
export function compareOwnEvaluations(input: {
  format: SessionFormat;
  cupsPerSample: number;
  mine: OwnEval | null;
  other: OwnEval | null;
  tolerance?: number;
  locale?: "es" | "en";
}): { total: RepeatDiffRow | null; intensities: RepeatDiffRow[] } | null {
  const { mine, other, format } = input;
  if (!mine || !other) return null;
  const tol = input.tolerance ?? REPEAT_TOLERANCE;
  const locale = input.locale ?? "es";
  const row = (id: string, a: number, b: number, label = ""): RepeatDiffRow => {
    const diff = round2(a - b);
    return { id, label, mine: a, other: b, diff, within: Math.abs(diff) <= tol };
  };

  let total: RepeatDiffRow | null = null;
  if (format !== "descriptive" && isAffectiveComplete(mine.data) && isAffectiveComplete(other.data)) {
    const a = calcIndividualScore(mine.data, mine.cups ?? input.cupsPerSample, { rule: mine.rule });
    const b = calcIndividualScore(other.data, other.cups ?? input.cupsPerSample, { rule: other.rule });
    if (typeof a === "number" && typeof b === "number") total = row("total", a, b);
  }

  const intensities: RepeatDiffRow[] = [];
  if (format !== "affective") {
    for (const block of PERCEPTUAL_BLOCKS) {
      if (block.kind !== "desc") continue;
      for (const attr of block.attrs ?? []) {
        const a = positive(mine.data[`${attr.id}_int`]);
        const b = positive(other.data[`${attr.id}_int`]);
        if (a !== null && b !== null) intensities.push(row(attr.id, a, b, attr.label[locale]));
      }
    }
  }
  return total || intensities.length ? { total, intensities } : null;
}
