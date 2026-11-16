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
//     Its optional `blockIds` param may only ever name perceptual block ids
//     (PERCEPTUAL_BLOCKS / ALL_BLOCK_IDS below) — every one of those ids is
//     itself only ever populated for descriptive/combined sessions by
//     computeSampleBlockFrequencies, so widening which blocks are merged never
//     opens a path to affective data.
//   - buildTasterCloud reads whatever blob the caller passes (descriptive or
//     combined data for one participant); callers must not pass affective
//     blobs. Do not add any other data path into either function.
//
// No "use client" — these are plain data transforms, safe to import from
// server or client code.

import type { SampleBlockFreq } from "@/lib/resultsAggregation";
import {
  collectDescriptors,
  resolveDescriptor,
  FLAVOR_DESC_KEYS,
  type PerceptualBlockAttr,
  PERCEPTUAL_BLOCKS,
} from "@/lib/descriptors";

export type CloudWord = {
  id: string;
  /**
   * What identifies this word inside one cloud: its vocabulary (`descriptorFamily`)
   * plus its lower-cased label (`wordKey`). Two descriptors of different
   * vocabularies never share a key, even when they share a label.
   */
  key: string;
  label: string;
  color: string;
  /** Total mentions, summed over every contributing stage. */
  count: number;
  /** Per-stage share of `count` (Fragancia 3 · Aroma 2); absent on taster clouds' legacy path. */
  breakdown?: { stageId: string; label: string; count: number }[];
};

/** "Fragancia 3 · Aroma 2" — the caption/tooltip tail for a word's breakdown. */
export function formatBreakdown(word: CloudWord): string {
  return (word.breakdown ?? []).map((b) => `${b.label} ${b.count}`).join(" · ");
}

/** Top-`max` words (input is already count-ranked). */
export function capWords<T>(words: readonly T[], max: number): T[] {
  return words.slice(0, Math.max(0, max));
}

export const labelKey = (label: string) => label.trim().toLocaleLowerCase();

/**
 * The vocabulary a perceptual block draws its descriptors from. Nariz and Boca
 * pick from ONE vocabulary (the flavour wheel), so the same word named in
 * fragancia and in sabor is one word. Every other block has its own list
 * (acidity, sweetness, mouthfeel, main tastes): its words are a different
 * thing even when the label reads the same (acidity "Suave" is not mouthfeel
 * "Suave", audit A-03).
 */
export function descriptorFamily(blockId: string): string {
  return blockId === "nariz" || blockId === "boca" ? "flavor" : blockId;
}

/** The merge key of a word: vocabulary + lower-cased label. */
export const wordKey = (family: string, label: string) => `${family}|${labelKey(label)}`;

function addBreakdown(word: CloudWord, stageId: string, label: string, count: number) {
  const list = (word.breakdown ??= []);
  const hit = list.find((b) => b.stageId === stageId);
  if (hit) hit.count += count;
  else list.push({ stageId, label, count });
}

export type FlavorCloudScope = { kind: "session" } | { kind: "sample"; sampleId: string };

/** The two perceptual blocks that make up "flavor" descriptors (Nariz + Boca). */
const FLAVOR_BLOCK_IDS = ["nariz", "boca"] as const;

/** Every perceptual block id (Nariz, Boca, Gusto, Acidez, Dulzura, Sensación). */
export const ALL_BLOCK_IDS = PERCEPTUAL_BLOCKS.map((b) => b.id);

/**
 * Merge the given blocks' descriptor counts (from the anonymous per-sample
 * frequency aggregation) into a single sorted word list, scoped to either the
 * whole session (every sample) or one sample.
 *
 * `blockIds` defaults to the Nariz + Boca "flavor" pair (existing callers'
 * behavior is unchanged); pass `ALL_BLOCK_IDS` for the Descriptores tab's
 * "general" scope, or a single block id to scope the cloud to that block.
 */
export function buildFlavorCloud(
  freq: SampleBlockFreq[],
  scope: FlavorCloudScope,
  blockIds: readonly string[] = FLAVOR_BLOCK_IDS,
  locale: "es" | "en" = "es",
): CloudWord[] {
  const samples =
    scope.kind === "session"
      ? freq
      : freq.filter((s) => s.sampleId === scope.sampleId);

  // One word per descriptor: size = mentions summed over the selected stages
  // (a cupper who lists "chocolate" in fragancia AND aroma counts twice).
  // Entries of the SAME vocabulary whose label matches case-insensitively (e.g.
  // a L1 "Floral" and its L2 of the same name) merge into one word. Entries of
  // different vocabularies never merge: acidity "Suave" and mouthfeel "Suave"
  // stay two words, each with its own count and colour.
  const merged = new Map<string, CloudWord>();
  const add = (
    d: { id: string; label: string; color: string; count: number },
    stageId: string,
    stageLabel: string,
    blockId: string,
  ) => {
    const key = wordKey(descriptorFamily(blockId), d.label);
    let word = merged.get(key);
    if (!word) {
      word = { id: d.id, key, label: d.label, color: d.color, count: 0, breakdown: [] };
      merged.set(key, word);
    }
    word.count += d.count;
    addBreakdown(word, stageId, stageLabel, d.count);
  };

  for (const sample of samples) {
    for (const blockId of blockIds) {
      const block = PERCEPTUAL_BLOCKS.find((b) => b.id === blockId);
      const attrs = (block?.attrs ?? []).filter((a) => a.descKey);
      if (sample.stages && attrs.length > 0) {
        for (const attr of attrs) {
          for (const d of sample.stages[attr.id] ?? []) add(d, attr.id, attr.label[locale], blockId);
        }
      } else {
        // Older aggregation shape without stages: block-level counts only.
        for (const d of sample.blocks[blockId] ?? []) add(d, blockId, blockId, blockId);
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.count - a.count);
}

/**
 * Word keys (`CloudWord.key`) of descriptors that at least TWO different
 * cuppers picked on the same sample, for the given block (or the "general"
 * pseudo-block). Uses the per-cupper-deduped `blocks` counts, so one person
 * naming a word in both fragancia and aroma — or on two samples — is still a
 * "single person" word. Backs the "hide single-person descriptors" toggle.
 *
 * Keys carry the descriptor's vocabulary, so a word shared by two cuppers in
 * acidity does not let a one-person mouthfeel word of the same label through.
 * The "general" pseudo-block has no block of its own: each descriptor takes
 * the vocabulary of the real block it was counted in (the id spaces of the
 * blocks are disjoint, so one id never belongs to two vocabularies).
 */
export function sharedLabelKeys(
  freq: SampleBlockFreq[],
  scope: FlavorCloudScope,
  blockId: string,
): Set<string> {
  const samples =
    scope.kind === "session" ? freq : freq.filter((s) => s.sampleId === scope.sampleId);
  const keys = new Set<string>();
  for (const sample of samples) {
    const familyOfId = new Map<string, string>();
    if (blockId === "general") {
      for (const [realBlockId, list] of Object.entries(sample.blocks)) {
        if (realBlockId === "general") continue;
        for (const d of list) familyOfId.set(d.id, descriptorFamily(realBlockId));
      }
    }
    for (const d of sample.blocks[blockId] ?? []) {
      if (d.count > 1) {
        const family = blockId === "general" ? (familyOfId.get(d.id) ?? "general") : descriptorFamily(blockId);
        keys.add(wordKey(family, d.label));
      }
    }
  }
  return keys;
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
 *
 * No dedicated `sampleId` param: `samples` is already one blob per sample, so
 * callers that want to scope the taster cloud to a single sample just filter
 * their per-sample blob array down to that one element before calling this
 * function — cheaper than threading an id through and matching it here.
 */
export function buildTasterCloud(
  samples: Array<Record<string, unknown>>,
  locale: "es" | "en" = "es",
): CloudWord[] {
  // Same rule as the group cloud: mentions summed per stage, one word per
  // descriptor, case-insensitive label merge.
  const stageAttrs = (
    PERCEPTUAL_BLOCKS as readonly { id: string; attrs?: readonly PerceptualBlockAttr[] }[]
  )
    .flatMap((b) => (b.attrs ?? []).map((attr) => ({ attr, blockId: b.id })))
    .filter(
      ({ attr }) => attr.descKey && (FLAVOR_DESC_KEYS as readonly string[]).includes(attr.descKey),
    );
  const merged = new Map<string, CloudWord>();
  for (const blob of samples) {
    for (const { attr, blockId } of stageAttrs) {
      for (const id of collectDescriptors(blob, [attr.descKey!])) {
        const info = resolveDescriptor(id, locale);
        if (!info) continue;
        const key = wordKey(descriptorFamily(blockId), info.label);
        let word = merged.get(key);
        if (!word) {
          word = { id, key, label: info.label, color: info.color, count: 0, breakdown: [] };
          merged.set(key, word);
        }
        word.count += 1;
        addBreakdown(word, attr.id, attr.label[locale], 1);
      }
    }
  }

  return [...merged.values()].sort((a, b) => b.count - a.count);
}
