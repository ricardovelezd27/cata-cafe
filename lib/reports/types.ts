// Shared, dependency-free shapes for the report models (lib/reports/*).
// `SessionReportSource` is the ONE fetched snapshot the participant summary,
// ficha tecnica and teacher notes are built from. It deliberately carries
// every cupper's identity (the owner appendix and teacher notes need it) —
// the PURE builders are responsible for stripping what a tier must not see
// (see the anonymity tests in tests/reports.test.ts).

import type { SessionFormat } from "@/lib/constants";
import type { GroupAggregate } from "@/lib/scoring";
import type { SampleBlockFreq } from "@/lib/resultsAggregation";
import type { CupperAlignmentRow } from "@/lib/alignment";

export type ReportLocale = "es" | "en";

/** Localized strings the pure builders need (resolved by the route). */
export type ReportLabels = {
  /** Shown instead of a coffee name once the coffee was anonymized. */
  coffeeDeleted: string;
  /** Prefix of the solo "top descriptors" line (`results.soloTopDescriptors`). */
  soloTopDescriptors: string;
};

export type ReportEvalRow = {
  id: string;
  cupperId: string;
  displayName: string;
  sessionSampleId: string;
  descriptiveData: Record<string, unknown>;
  affectiveData: Record<string, unknown>;
  combinedData: Record<string, unknown>;
  nonUniformCups: boolean[];
  defectiveCups: boolean[];
};

export type ReportCoffee = {
  name: string;
  deletedAt: Date | string | null;
  code: string | null;
  country: string | null;
  region: string | null;
  farm: string | null;
  producer: string | null;
  variety: string | null;
  processType: string | null;
  altitude: string | null;
  roastLevel: string | null;
};

export type ReportSample = {
  id: string;
  label: string;
  position: number;
  revealed: boolean;
  /** True for every reference (R1, R2…). */
  isReference: boolean;
  /** Multi-reference rank (1 = R1); null for regular samples. */
  referenceRank?: number | null;
  coffee: ReportCoffee | null;
  /** Green-bean assessment (per sample, OWNER-ONLY downstream). */
  physical: Record<string, unknown>;
  /** Origin data (reveal-gated downstream). */
  extrinsic: Record<string, unknown>;
};

export type ReportParticipant = {
  userId: string;
  displayName: string;
  status: string;
  excluded: boolean;
};

export type ReportSession = {
  id: string;
  name: string;
  date: Date;
  objective: string | null;
  format: SessionFormat;
  cupsPerSample: number;
  isGroup: boolean;
  status: string;
  createdBy: string;
  referenceSampleId: string | null;
  closedAt: Date | null;
};

export type SessionReportSource = {
  session: ReportSession;
  ownerName: string;
  /** Display order: references first by rank (orderReferencesFirst), then position. */
  samples: ReportSample[];
  participants: ReportParticipant[];
  /** ALL submitted (isDraft=false) evaluations, every cupper. */
  evals: ReportEvalRow[];
  /** Cuppers excluded from group results. */
  excludedUserIds: string[];
  /** Cuppers with at least one submitted evaluation. */
  submittedCupperCount: number;
  /** Community aggregate per sample id (excluded cuppers removed). */
  groupAggBySample: Record<string, GroupAggregate>;
  /** Anonymous block frequencies; null for affective sessions. */
  descriptorFrequency: SampleBlockFreq[] | null;
  /** Per-cupper alignment rows ([] for affective) — IDENTITY DATA. */
  alignmentRows: CupperAlignmentRow[];
  /** Consensus descriptor ids per sample id → block id. */
  majoritySets: Record<string, Record<string, string[]>>;
};

/** The affective/combined/descriptive blob a format scores from. */
export function blobForFormat(
  format: SessionFormat,
  ev: Pick<ReportEvalRow, "descriptiveData" | "affectiveData" | "combinedData">,
): Record<string, unknown> {
  return format === "combined"
    ? ev.combinedData
    : format === "affective"
      ? ev.affectiveData
      : ev.descriptiveData;
}
