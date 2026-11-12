// Single data-source gate for the CVA sheet (print page, cva-pdf route, close
// email). The builder (cvaFormData.ts) already hides a blind coffee at paint
// time; this moves the same rule to the data source so the serialized payload
// of /print never carries the name/roast of an unrevealed sample (S8-02,
// F-informes-1). The owner is NOT exempt: identical to the builder.
//
// Pure module (only imports another pure module) so vitest can load it.

import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { gateSamplePrep, type SamplePrep, type SamplePrepRow } from "@/lib/samplePrep";

export interface SheetSampleSource {
  revealed: boolean;
  coffee: {
    name: string;
    deletedAt?: Date | string | null;
    roastLevel?: string | null;
  } | null;
}

export interface SheetSampleIdentity {
  coffeeName: string | null;
  roastLevel: string | null;
}

/** Name + roast of the coffee, only when the sample is revealed. `deletedLabel`
 *  is the localized "Café eliminado". */
export function sheetSampleIdentity(
  sample: SheetSampleSource,
  deletedLabel: string,
): SheetSampleIdentity {
  if (!sample.revealed || !sample.coffee) return { coffeeName: null, roastLevel: null };
  return {
    coffeeName: coffeeDisplayName(sample.coffee, deletedLabel),
    roastLevel: sample.coffee.roastLevel ?? null,
  };
}

/** A9: the owner's optional prep data (roast date, preparation note,
 *  off-protocol) for the sheet header. BLIND DATA: owner view or a revealed
 *  sample only (lib/samplePrep.ts `gateSamplePrep`, the one shared rule), so a
 *  participant's sheet of a still-blind sample never carries it. */
export function sheetSamplePrep(
  sample: SamplePrepRow & { revealed: boolean },
  ownerView: boolean,
): { prep: SamplePrep | null } {
  return { prep: gateSamplePrep(sample, { ownerView, revealed: sample.revealed }) };
}

/** Per-sample owner-authored records: physical only for the owner view,
 *  extrinsic for the owner view or once the sample is revealed. */
export function sheetSampleRecords(
  sample: {
    revealed: boolean;
    physical: { data: unknown } | null | undefined;
    extrinsic: { data: unknown } | null | undefined;
  },
  ownerView: boolean,
): { physical: Record<string, unknown>; extrinsic: Record<string, unknown> } {
  const asRecord = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  return {
    physical: ownerView ? asRecord(sample.physical?.data) : {},
    extrinsic: ownerView || sample.revealed ? asRecord(sample.extrinsic?.data) : {},
  };
}
