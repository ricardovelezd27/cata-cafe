// Owner-only per-cupper alignment computation (N15, Step 4).
//
// This MUST stay OUT of lib/resultsAggregation.ts: that module feeds the
// anonymous, per-sample aggregation shared with the close-session email path
// (lib/closeEmail.ts) — per-cupper identity data (names, ids, an alignment
// ranking that singles cuppers out) must never leak into that shared,
// anonymous core. This file is the one place per-cupper alignment is
// computed; it is consumed ONLY by the owner-only server render in
// app/[locale]/app/sessions/[id]/results/page.tsx (the full row list is
// owner-only; non-owners may only receive their OWN scalar triple, extracted
// by the caller — never the row itself).
//
// Extracted verbatim from the inline block that used to live in that page
// component (~lines 258-373) — same majority rule, same excluded handling,
// same ordering — plus an additive `bySample` split of the same counts.

import { collectDescriptors, PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import type { SessionFormat } from "@/lib/constants";

/** A raw submitted evaluation row (only the fields alignment needs). */
export type AlignmentEval = {
  cupperId: string;
  sessionSampleId: string;
  descriptiveData: unknown;
  combinedData: unknown;
  cupper: { displayName: string };
};

/** Per-cupper alignment with the group consensus. */
export type CupperAlignmentRow = {
  id: string;
  name: string;
  excluded: boolean;
  alignment: number; // 0..1 overlap ratio vs majority sets
  matches: number;
  opportunities: number;
  /** Per-sample split of the same matches/opportunities (sums to the totals above). */
  bySample: Record<string, { matches: number; opportunities: number }>;
};

export type CupperAlignmentInput = {
  /** Session format — decides which JSON column holds the descriptors. */
  format: SessionFormat;
  /** Session samples in display order. */
  samples: { id: string }[];
  /** All submitted (isDraft=false) evaluations for the session. */
  evals: AlignmentEval[];
  /** Cuppers excluded from group results — still scored, but flagged. */
  excludedUserIds: Set<string>;
};

/**
 * Compute each cupper's alignment with the group's majority descriptor sets,
 * per sample+block, then rolled up per cupper. Returns `[]` for affective
 * sessions (they carry no descriptors) — same guard as
 * `computeSampleBlockFrequencies`.
 */
export function computeCupperAlignment(input: CupperAlignmentInput): CupperAlignmentRow[] {
  const { format, samples, evals, excludedUserIds } = input;
  if (format === "affective") return [];

  const blobFor = (ev: AlignmentEval): Record<string, unknown> | null =>
    format === "combined"
      ? (ev.combinedData as Record<string, unknown>)
      : format === "descriptive"
        ? (ev.descriptiveData as Record<string, unknown>)
        : null;

  // Per (sampleId → blockId → cupperId → Set<descriptorId>), including
  // excluded cuppers so their (flagged) rows can be scored against the
  // excluded-free consensus.
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
    const bySel = selections.get(ev.sessionSampleId);
    if (!bySel) continue;
    const blob = blobFor(ev);
    if (!blob) continue;
    if (!excludedUserIds.has(ev.cupperId)) {
      evaluatorsPerSample.get(ev.sessionSampleId)!.add(ev.cupperId);
    }
    for (const block of PERCEPTUAL_BLOCKS) {
      const ids = collectDescriptors(blob, block.descKeys);
      bySel.get(block.id)!.set(ev.cupperId, new Set(ids));
    }
  }

  // Consensus (majority) sets per sample+block: descriptors picked by >= 50%
  // of that block's INCLUDED evaluators, min 2 cuppers.
  const majoritySets = new Map<string, Map<string, Set<string>>>();
  for (const s of samples) {
    const bySel = selections.get(s.id)!;
    const total = evaluatorsPerSample.get(s.id)!.size;
    const sampleMajority = new Map<string, Set<string>>();
    for (const block of PERCEPTUAL_BLOCKS) {
      const counts = new Map<string, number>();
      for (const [cupperId, set] of bySel.get(block.id)!) {
        if (excludedUserIds.has(cupperId)) continue; // consensus excludes them
        for (const did of set) counts.set(did, (counts.get(did) ?? 0) + 1);
      }
      const majority = new Set(
        [...counts.entries()]
          .filter(([, c]) => c >= 2 && total > 0 && c / total >= 0.5)
          .map(([did]) => did),
      );
      sampleMajority.set(block.id, majority);
    }
    majoritySets.set(s.id, sampleMajority);
  }

  // For each cupper, across all samples+blocks that HAVE a majority set,
  // alignment = matched majority descriptors / total majority opportunities.
  // Excluded cuppers are dropped from the consensus above but still get a
  // (flagged) row so the owner can see them. Their selections are present in
  // `selections` (every eval is included when building the matrix above), so
  // they score against the excluded-free consensus.
  const rows = new Map<
    string,
    {
      name: string;
      excluded: boolean;
      matches: number;
      opportunities: number;
      bySample: Record<string, { matches: number; opportunities: number }>;
    }
  >();
  for (const ev of evals) {
    if (!rows.has(ev.cupperId)) {
      rows.set(ev.cupperId, {
        name: ev.cupper.displayName,
        excluded: excludedUserIds.has(ev.cupperId),
        matches: 0,
        opportunities: 0,
        bySample: {},
      });
    }
  }

  for (const s of samples) {
    const bySel = selections.get(s.id)!;
    const sampleMajority = majoritySets.get(s.id)!;
    // Build per-cupper block selections INCLUDING excluded cuppers, so
    // excluded rows can still be scored against the (excluded-free)
    // consensus. Re-derive from raw evals for excluded cuppers.
    for (const [cupperId, row] of rows) {
      let sampleMatches = 0;
      let sampleOpportunities = 0;
      for (const block of PERCEPTUAL_BLOCKS) {
        const majority = sampleMajority.get(block.id)!;
        if (majority.size === 0) continue; // no consensus → no opportunity
        sampleOpportunities += majority.size;
        const cupperSet = bySel.get(block.id)!.get(cupperId);
        if (cupperSet) {
          for (const did of majority) if (cupperSet.has(did)) sampleMatches += 1;
        } else if (row.excluded) {
          // Excluded cupper's selections aren't in `bySel`; recover them.
          const ev = evals.find(
            (e) => e.cupperId === cupperId && e.sessionSampleId === s.id,
          );
          const blob = ev ? blobFor(ev) : null;
          if (blob) {
            const ids = new Set(collectDescriptors(blob, block.descKeys));
            for (const did of majority) if (ids.has(did)) sampleMatches += 1;
          }
        }
      }
      row.matches += sampleMatches;
      row.opportunities += sampleOpportunities;
      row.bySample[s.id] = { matches: sampleMatches, opportunities: sampleOpportunities };
    }
  }

  return [...rows.entries()]
    .map(([id, r]) => ({
      id,
      name: r.name,
      excluded: r.excluded,
      matches: r.matches,
      opportunities: r.opportunities,
      alignment: r.opportunities > 0 ? r.matches / r.opportunities : 0,
      bySample: r.bySample,
    }))
    .sort((a, b) => {
      // Included cuppers first (by alignment desc), excluded last.
      if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
      return b.alignment - a.alignment;
    });
}
