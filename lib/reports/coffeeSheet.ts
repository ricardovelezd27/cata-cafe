// What a coffee's SHEET adds to the data the results page already ships
// (package R3 of docs/audits/app-ui-ux-2026-11-15/RESULTS-DESIGN.md, section 3:
// "Lo que encontró el panel"): the descriptors the panel chose, stage by stage,
// counted by PEOPLE.
//
// Pure: no React, no database, no word of the interface. Built ON THE SERVER.
// It adds no gate of its own: a coffee's lists are given only where that
// coffee's WHEEL was given to this viewer as the group's counts
// (`OverviewData`, built by `buildWheelData` under the page's one gate and the
// wheel's own minimum of cuppers). So a participant under three cuppers, a
// participant of an open session, a solo cupper and an affective session get
// no list here; what a viewer marked themselves is read in the browser from
// their own evaluation, which the page already ships.
//
// The lists come from `computeSampleBlockFrequencies` (lib/resultsAggregation.ts):
// each cupper counts once per descriptor per stage, excluded cuppers are left
// out, and only ids that resolve in the reference data are listed (a wheel
// node, an acidity / sweetness / mouthfeel descriptor, a main taste). The words
// people typed (the old roll-up's "notes") are never part of it.
// Display-only: scoring, the trigger and AggregateScore never read this file.

import { PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import { wheelFamilyOf, type WheelFamilyId } from "@/lib/flavorWheel";
import type { OverviewData } from "@/lib/reports/overview";

/** The stage that holds every other one: each cupper once per descriptor. */
export const SHEET_GENERAL = "general";

/** The stages a sheet can list, in order: all of them together, then each. */
export const SHEET_BLOCK_IDS: readonly string[] = [SHEET_GENERAL, ...PERCEPTUAL_BLOCKS.map((b) => b.id)];

export type SheetDescriptor = {
  id: string;
  /** Its name in the reader's language (resolved on the server). */
  label: string;
  /** Its flavour family when it is on the wheel; null for the other vocabularies. */
  family: WheelFamilyId | null;
  /** How many included cuppers chose it in this stage. */
  count: number;
};

export type SheetBlock = { id: string; items: SheetDescriptor[] };

export type SheetData = {
  /** The cuppers the counts are "of". */
  n: number;
  blocks: SheetBlock[];
};

/** What `computeSampleBlockFrequencies` returns for one sample, as read here. */
export type SheetFrequency = {
  sampleId: string;
  totalEvaluators: number;
  blocks: Record<string, { id: string; label: string; count: number }[]>;
};

/**
 * The panel's descriptors per stage, for every coffee whose group wheel this
 * viewer was given. Null for a coffee where they were not.
 */
export function buildSheetData(input: {
  sampleIds: readonly string[];
  /** The overview's data: its wheel result per coffee is the gate. */
  overview: OverviewData;
  frequencies: readonly SheetFrequency[] | null;
}): Record<string, SheetData | null> {
  const out: Record<string, SheetData | null> = {};
  for (const id of input.sampleIds) {
    const wheel = input.overview.samples[id]?.wheel;
    const frequency = input.frequencies?.find((f) => f.sampleId === id) ?? null;
    if (!wheel || wheel.status !== "ok" || wheel.scope !== "group" || !frequency || frequency.totalEvaluators <= 0) {
      out[id] = null;
      continue;
    }
    out[id] = {
      n: frequency.totalEvaluators,
      blocks: SHEET_BLOCK_IDS.map((blockId) => ({
        id: blockId,
        items: (frequency.blocks[blockId] ?? [])
          .filter((d) => d.count > 0)
          .map((d) => ({ id: d.id, label: d.label, family: wheelFamilyOf(d.id), count: d.count })),
      })),
    };
  }
  return out;
}
