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
 */
export function computeSampleBlockFrequencies(
  input: AggregationInput,
): SampleBlockFreq[] | null {
  if (input.format === "affective") return null;

  const { evals, excludedUserIds, samples, locale } = input;

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

    const sentences = summarizeSample(summaryBlocks, locale);
    const summary: Record<string, string | null> = {};
    for (const sent of sentences) summary[sent.blockId] = sent.text;

    return {
      sampleId: s.id,
      label: s.label,
      totalEvaluators: total,
      blocks: blocksOut,
      summary,
    };
  });
}
