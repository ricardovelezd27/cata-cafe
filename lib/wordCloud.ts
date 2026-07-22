// Pure helpers that turn the anonymous descriptor-frequency aggregation (or a
// single participant's raw evaluation blobs) into the flat, count-ranked shape
// the results word cloud renders.
//
// HARD CONSTRAINT: flavor descriptors are exclusive to descriptive/combined
// session formats — never affective. Both builders below only ever consume
// data that is already format-gated by their callers:
//   - buildFlavorCloud reads `SampleBlockFreq[]`, which
//     `computeSampleBlockFrequencies` (lib/resultsAggregation.ts) returns as
//     `null` for affective sessions — callers gate the whole descriptors tab
//     on that null check, so this function is never invoked for affective data.
//   - buildTasterCloud reads whatever blob the caller passes (descriptive or
//     combined data for one participant); callers must not pass affective
//     blobs. Do not add any other data path into either function.
//
// No "use client" — these are plain data transforms, safe to import from
// server or client code.

import type { SampleBlockFreq } from "@/lib/resultsAggregation";
import { collectDescriptors, resolveDescriptor, FLAVOR_DESC_KEYS } from "@/lib/descriptors";

export type CloudWord = {
  id: string;
  label: string;
  color: string;
  count: number;
};

export type FlavorCloudScope = { kind: "session" } | { kind: "sample"; sampleId: string };

/** The two perceptual blocks that make up "flavor" descriptors (Nariz + Boca). */
const FLAVOR_BLOCK_IDS = ["nariz", "boca"] as const;

/**
 * Merge the Nariz + Boca block descriptor counts (from the anonymous
 * per-sample frequency aggregation) into a single sorted word list, scoped to
 * either the whole session (every sample) or one sample.
 */
export function buildFlavorCloud(
  freq: SampleBlockFreq[],
  scope: FlavorCloudScope,
): CloudWord[] {
  const samples =
    scope.kind === "session"
      ? freq
      : freq.filter((s) => s.sampleId === scope.sampleId);

  const merged = new Map<string, CloudWord>();
  for (const sample of samples) {
    for (const blockId of FLAVOR_BLOCK_IDS) {
      const ranked = sample.blocks[blockId] ?? [];
      for (const d of ranked) {
        const existing = merged.get(d.id);
        if (existing) {
          existing.count += d.count;
        } else {
          merged.set(d.id, { id: d.id, label: d.label, color: d.color, count: d.count });
        }
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.count - a.count);
}

/**
 * Build a single participant's flavor word cloud across their own samples.
 * `samples` is one blob per sample (descriptive or combined data — whichever
 * the session format uses); count = number of samples the descriptor appears
 * in (each blob is deduped internally by collectDescriptors).
 *
 * `locale` is optional (defaults to "es") — resolveDescriptor needs it to pick
 * the right label language; buildFlavorCloud doesn't need the parameter
 * because its labels are already resolved server-side inside SampleBlockFreq.
 */
export function buildTasterCloud(
  samples: Array<Record<string, unknown>>,
  locale: "es" | "en" = "es",
): CloudWord[] {
  const counts = new Map<string, number>();
  for (const blob of samples) {
    const ids = collectDescriptors(blob, FLAVOR_DESC_KEYS);
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const words: CloudWord[] = [];
  for (const [id, count] of counts) {
    const info = resolveDescriptor(id, locale);
    if (!info) continue;
    words.push({ id, label: info.label, color: info.color, count });
  }

  return words.sort((a, b) => b.count - a.count);
}
