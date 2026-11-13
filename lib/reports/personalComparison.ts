// S10 WP5b (B3, TODO(kim-validar:B3)): the cupper's own numbers next to the
// group's, in the personal drill-down of a sample of a CLOSED group session.
// Pure: no Prisma, no React, no i18n framework. The page builds the payload
// server-side; the client only renders it.
//
// PRIVACY (hard rule, tested): a group comparison is built ONLY when at least
// `RANKING_POLICY.minN` cuppers are included for the sample (with 2 people an
// average hands the other person's values over), AND each ROW of it (the total,
// every attribute, every intensity) carries a group number only when at least
// `minN` included cuppers have a value for THAT row (an average over one or two
// people is those people's value). The payload carries the viewer's own values
// plus anonymous aggregates (mean and SD, per-row means, top descriptors): never
// another cupper's individual value, name or id, and no lowest/highest total; an
// excluded cupper never enters an average. Neutral wording is the renderer's job: nothing here is a "fault".
// Display-only: scoring, the trigger and AggregateScore never read it.

import { AFFECTIVE_ATTRIBUTES, type SessionFormat } from "@/lib/constants";
import { PERCEPTUAL_BLOCKS, collectDescriptors, resolveDescriptor } from "@/lib/descriptors";
import { calcIndividualScore, isAffectiveComplete } from "@/lib/scoring";
import type { ScoreRule } from "@/lib/scoreRule";
import { RANKING_POLICY } from "@/lib/reports/ranking";

export type ComparisonEval = {
  cupperId: string;
  data: Record<string, unknown>;
  /** Evaluation.cups (null = stored before the 2026-11 rule). */
  cups?: number | null;
  rule?: ScoreRule;
};

export type ComparisonRow = { id: string; label: string; mine: number | null; group: number | null };

export type PersonalComparison =
  | { status: "too_few"; included: number }
  | {
      status: "ok";
      included: number;
      /** At least one row has no group number (fewer than minN cuppers set it). */
      partial: boolean;
      affective: {
        mine: number | null;
        group: number | null;
        sd: number | null;
        attrs: ComparisonRow[];
      } | null;
      descriptive: {
        intensities: ComparisonRow[];
        /** Descriptors the cupper chose that the group also chose most. */
        matches: { id: string; label: string }[];
        /** Descriptors the group chose most that the cupper did not choose. */
        missed: { id: string; label: string }[];
      } | null;
    };

const OVERALL_LABEL = { es: "Impresión global", en: "Overall impression" };

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
/** Mean of the values, or null when fewer than `minN` cuppers have one. */
function mean(values: number[], minN: number): number | null {
  return values.length >= minN ? round2(values.reduce((a, b) => a + b, 0) / values.length) : null;
}
function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}
const affValue = (data: Record<string, unknown>, id: string): number | null =>
  numOrNull(data[`${id}_final`] ?? data[id]);

/** The blocks' attributes that carry both an intensity and an affective key. */
const ATTR_LABELS: Record<string, { es: string; en: string }> = {
  impresion_global: OVERALL_LABEL,
};
for (const block of PERCEPTUAL_BLOCKS) {
  for (const a of block.attrs ?? []) {
    if ("affKey" in a && a.affKey) ATTR_LABELS[a.affKey] = a.label;
  }
}

/** Anonymous group descriptor lists (the Descriptores tab's output): blockId →
 *  ranked descriptors with the number of included cuppers who picked each. */
export type GroupBlocks = Record<string, { id: string; label: string; count: number }[]>;

/** How many of a block's most chosen descriptors count as "what the group chose
 *  most" (each needs at least two cuppers). TODO(kim-validar:B3) */
export const GROUP_TOP_PER_BLOCK = 3;

export function buildPersonalComparison(input: {
  format: SessionFormat;
  cupsPerSample: number;
  locale: "es" | "en";
  /** Submitted evaluations of ONE sample, master-EXCLUDED cuppers already removed. */
  included: ComparisonEval[];
  /** The viewer's own submitted evaluation of the sample (null = none). */
  viewer: ComparisonEval | null;
  /** The sample's community numbers (the page's recompute), for the headline. */
  aggregate: { communityScore: number | null; scoreSd: number | null } | null;
  /** The Descriptores tab's anonymous lists for this sample (descriptive/combined). */
  groupBlocks?: GroupBlocks | null;
  minN?: number;
}): PersonalComparison | null {
  const { format, cupsPerSample, locale } = input;
  if (!input.viewer) return null;
  const minN = input.minN ?? RANKING_POLICY.minN;
  const hasAffective = format !== "descriptive";
  const hasDescriptive = format !== "affective";

  const pool = hasAffective ? input.included.filter((e) => isAffectiveComplete(e.data)) : input.included;
  const n = pool.length;
  // PRIVACY GATE: nothing but the count leaves when the group is too small.
  if (n < minN) return { status: "too_few", included: n };

  const mine = input.viewer;
  let affective: Extract<PersonalComparison, { status: "ok" }>["affective"] = null;
  if (hasAffective) {
    const totalOf = (e: ComparisonEval): number | null => {
      const v = calcIndividualScore(e.data, e.cups ?? cupsPerSample, { rule: e.rule });
      return typeof v === "number" ? v : null;
    };
    const myTotal = isAffectiveComplete(mine.data) ? totalOf(mine) : null;
    affective = {
      mine: myTotal,
      group: input.aggregate?.communityScore ?? null,
      sd: input.aggregate?.scoreSd ?? null,
      attrs: AFFECTIVE_ATTRIBUTES.map((a) => ({
        id: a.id,
        label: (ATTR_LABELS[a.id] ?? { es: a.label, en: a.label })[locale],
        mine: affValue(mine.data, a.id),
        group: mean(pool.map((e) => affValue(e.data, a.id)).filter((v): v is number => v !== null), minN),
      })),
    };
  }

  let descriptive: Extract<PersonalComparison, { status: "ok" }>["descriptive"] = null;
  if (hasDescriptive) {
    const intensities: ComparisonRow[] = [];
    for (const block of PERCEPTUAL_BLOCKS) {
      if (block.kind !== "desc") continue;
      for (const a of block.attrs ?? []) {
        const key = `${a.id}_int`;
        const my = numOrNull(mine.data[key]);
        const group = mean(pool.map((e) => numOrNull(e.data[key])).filter((v): v is number => v !== null), minN);
        if (my === null && group === null) continue;
        // (a row with a value for me but fewer than minN for the group keeps group = null)
        intensities.push({ id: a.id, label: a.label[locale], mine: my, group });
      }
    }
    const myIds = new Set<string>();
    for (const block of PERCEPTUAL_BLOCKS) {
      if (block.kind !== "desc") continue;
      for (const id of collectDescriptors(mine.data, block.descKeys)) myIds.add(id);
    }
    const top = new Map<string, string>();
    for (const [blockId, list] of Object.entries(input.groupBlocks ?? {})) {
      const block = PERCEPTUAL_BLOCKS.find((b) => b.id === blockId);
      if (!block || block.kind !== "desc") continue;
      // "Most chosen" = picked by at least 2 OTHER cuppers (the viewer's own pick is not counted).
      for (const d of list
        .filter((x) => x.count - (myIds.has(x.id) ? 1 : 0) >= 2)
        .slice(0, GROUP_TOP_PER_BLOCK)) {
        if (!top.has(d.id)) top.set(d.id, d.label);
      }
    }
    const labelOf = (id: string) => top.get(id) ?? resolveDescriptor(id, locale)?.label ?? id;
    descriptive = {
      intensities,
      matches: [...top.keys()].filter((id) => myIds.has(id)).map((id) => ({ id, label: labelOf(id) })),
      missed: [...top.keys()].filter((id) => !myIds.has(id)).map((id) => ({ id, label: labelOf(id) })),
    };
  }

  const rows = [...(affective?.attrs ?? []), ...(descriptive?.intensities ?? [])];
  const partial =
    (affective !== null && affective.group === null) ||
    rows.some((r) => r.mine !== null && r.group === null);
  return { status: "ok", included: n, partial, affective, descriptive };
}
