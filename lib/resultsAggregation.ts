// Shared, pure aggregation core for a group session's ANONYMOUS results.
//
// This was originally inlined in the results server component
// (app/[locale]/app/sessions/[id]/results/page.tsx). It is extracted here so the
// close-session email path (lib/closeEmail.ts → group-summary PDF) computes the
// exact SAME per-sample block frequencies and statistical summaries as the page —
// no copy-paste, one source of truth. Keep it pure (no Prisma, no JSX, no i18n
// framework): callers pass in already-fetched rows + a block-label resolver.
//
// Anonymity invariants (must not regress): the output carries ONLY aggregated
// counts and template sentences — never a cupperId, name, or alignment ranking.
// Master-excluded cuppers are filtered by the caller-supplied `excludedUserIds`
// set BEFORE they reach any count, consistent with the app's results view.

import {
  collectDescriptors,
  resolveDescriptor,
  resolveMainTaste,
  PERCEPTUAL_BLOCKS,
} from "@/lib/descriptors";
import { summarizeSample, type SummaryBlock } from "@/lib/resultsSummary";

type Locale = "es" | "en";
type D = Record<string, unknown>;

/** One aggregated descriptor for a block, with its display color (for the UI). */
export type RankedDescriptor = {
  id: string;
  label: string;
  color: string;
  count: number;
};

/** Anonymous per-sample block aggregation, matching the results page shape. */
export type SampleBlockFreq = {
  sampleId: string;
  label: string;
  totalEvaluators: number;
  /** blockId → descriptors ranked desc by count (each cupper counts once). */
  blocks: Record<string, RankedDescriptor[]>;
  /** blockId → statistical summary sentence (null text → caller empty state). */
  summary: Record<string, string | null>;
};

/** A raw submitted evaluation row (only the fields aggregation needs). */
export type AggregationEval = {
  cupperId: string;
  sessionSampleId: string;
  descriptiveData: unknown;
  combinedData: unknown;
};

export type AggregationInput = {
  /** Session format — decides which JSON column holds the descriptors. */
  format: string;
  /** Session samples in display order. */
  samples: { id: string; label: string }[];
  /** All submitted (isDraft=false) evaluations for the session. */
  evals: AggregationEval[];
  /** Cuppers excluded from group results (dropped from every count). */
  excludedUserIds: Set<string>;
  /** Resolves a perceptual block id to its localized heading. */
  blockLabel: (blockId: string) => string;
  locale: Locale;
};

export type AggregationOptions = {
  /**
   * Skip every statistical summary sentence (every `summary[blockId]` is
   * `null`). Used for solo sessions, where a single-evaluator "majority of 1
   * of 1" sentence would read absurd — callers should still render the
   * ranked descriptor lists, just without the sentence.
   */
  skipSummaries?: boolean;
};

/**
 * Compute the anonymous per-sample block frequencies + statistical summaries.
 *
 * Returns `null` for affective-only sessions (they carry no descriptors), so the
 * caller can skip the descriptor views entirely — same behavior as the page.
 *
 * The single selection matrix built here feeds both the ranked frequency lists
 * (for the page's descriptor UI) and the SummaryBlock[] handed to
 * `summarizeSample`, so the two views can never disagree — exactly as the page
 * did inline.
 *
 * `options` is additive — omitting it (every existing caller) reproduces the
 * exact prior output, including the prior `blocks`/`summary` key sets, EXCEPT
 * for the new `"general"` pseudo-block described below, which is always added.
 * Callers that only ever read known block ids off `PERCEPTUAL_BLOCKS` (as both
 * current callers do — see lib/closeEmail.ts and
 * components/results/DescriptorFrequency.tsx) are unaffected by the new key.
 */
export function computeSampleBlockFrequencies(
  input: AggregationInput,
  options?: AggregationOptions,
): SampleBlockFreq[] | null {
  if (input.format === "affective") return null;

  const { evals, excludedUserIds, samples, locale } = input;
  const skipSummaries = options?.skipSummaries ?? false;

  const blobFor = (ev: AggregationEval): D | null =>
    input.format === "combined"
      ? (ev.combinedData as D)
      : input.format === "descriptive"
        ? (ev.descriptiveData as D)
        : null;

  const resolveForBlock = (blockKind: string, id: string) =>
    blockKind === "taste"
      ? resolveMainTaste(id, locale)
      : resolveDescriptor(id, locale);

  // Per (sampleId → blockId) the set of descriptor ids each INCLUDED cupper
  // selected, deduped within the block (per-cupper union across the block's
  // stages).
  type BlockSel = Map<string, Map<string, Set<string>>>;
  const selections = new Map<string, BlockSel>();
  const evaluatorsPerSample = new Map<string, Set<string>>();
  for (const s of samples) {
    const bySel: BlockSel = new Map();
    for (const block of PERCEPTUAL_BLOCKS) bySel.set(block.id, new Map());
    selections.set(s.id, bySel);
    evaluatorsPerSample.set(s.id, new Set());
  }

  for (const ev of evals) {
    if (excludedUserIds.has(ev.cupperId)) continue; // master-excluded cupper
    const bySel = selections.get(ev.sessionSampleId);
    if (!bySel) continue;
    const blob = blobFor(ev);
    if (!blob) continue;
    evaluatorsPerSample.get(ev.sessionSampleId)!.add(ev.cupperId);
    for (const block of PERCEPTUAL_BLOCKS) {
      const ids = collectDescriptors(blob, block.descKeys);
      bySel.get(block.id)!.set(ev.cupperId, new Set(ids));
    }
  }

  return samples.map((s) => {
    const bySel = selections.get(s.id)!;
    const total = evaluatorsPerSample.get(s.id)!.size;
    const blocksOut: Record<string, RankedDescriptor[]> = {};
    const summaryBlocks: SummaryBlock[] = [];

    for (const block of PERCEPTUAL_BLOCKS) {
      const counts = new Map<string, number>();
      for (const set of bySel.get(block.id)!.values()) {
        for (const did of set) counts.set(did, (counts.get(did) ?? 0) + 1);
      }
      const ranked: RankedDescriptor[] = [...counts.entries()]
        .map(([did, count]) => {
          const info = resolveForBlock(block.kind, did);
          return info
            ? { id: did, label: info.label, color: info.color, count }
            : null;
        })
        .filter((d): d is RankedDescriptor => d !== null)
        .sort((a, b) => b.count - a.count);
      blocksOut[block.id] = ranked;

      summaryBlocks.push({
        id: block.id,
        label: input.blockLabel(block.id),
        descriptors: ranked.map((d) => ({ id: d.id, label: d.label, count: d.count })),
        total,
      });
    }

    // ---- "general" pseudo-block ----
    // Descriptors ranked across ALL SIX perceptual blocks, deduped PER CUPPER
    // at the SAMPLE level: a cupper who picked the same descriptor id in
    // several blocks/stages (e.g. "chocolate" in both fragancia and aroma, or
    // in fragancia AND sabor) counts once here, not once per block. This is a
    // union of the same per-block selection sets built above, so it can never
    // disagree with them. The "gusto" block's main-taste ids are included too
    // (they are descriptors for this purpose) — resolved via resolveMainTaste
    // when resolveDescriptor doesn't recognize the id (the "desc"-kind blocks
    // and the "taste"-kind block use disjoint id spaces in practice).
    const generalCounts = new Map<string, number>();
    for (const cupperId of evaluatorsPerSample.get(s.id)!) {
      const union = new Set<string>();
      for (const block of PERCEPTUAL_BLOCKS) {
        const set = bySel.get(block.id)!.get(cupperId);
        if (set) for (const did of set) union.add(did);
      }
      for (const did of union) generalCounts.set(did, (generalCounts.get(did) ?? 0) + 1);
    }
    const generalRanked: RankedDescriptor[] = [...generalCounts.entries()]
      .map(([did, count]) => {
        const info = resolveDescriptor(did, locale) ?? resolveMainTaste(did, locale);
        return info ? { id: did, label: info.label, color: info.color, count } : null;
      })
      .filter((d): d is RankedDescriptor => d !== null)
      .sort((a, b) => b.count - a.count);
    blocksOut["general"] = generalRanked;
    summaryBlocks.push({
      id: "general",
      label: input.blockLabel("general"),
      descriptors: generalRanked.map((d) => ({ id: d.id, label: d.label, count: d.count })),
      total,
    });

    const summary: Record<string, string | null> = {};
    if (skipSummaries) {
      for (const b of summaryBlocks) summary[b.id] = null;
    } else {
      const sentences = summarizeSample(summaryBlocks, locale);
      for (const sent of sentences) summary[sent.blockId] = sent.text;
    }

    return {
      sampleId: s.id,
      label: s.label,
      totalEvaluators: total,
      blocks: blocksOut,
      summary,
    };
  });
}
