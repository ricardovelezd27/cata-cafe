// The VIEWER'S OWN evaluation state on the results page. Pure and
// dependency-light (scoring + descriptor tables only) so it is unit-testable
// and shareable between the server loader and the client tabs.
//
// Why this exists (2026-09-26 cupping): the results page renders the viewer's
// evaluation row whether or not it has been submitted, so a cupper who opens
// /results mid-tasting sees "—" in every attribute they have not rated yet.
// Without a status signal that reads as lost data — and, worse,
// calcAffectiveSum() substitutes a neutral 5 for each missing attribute, so an
// unfinished row still printed a plausible CVA score. Every results surface
// now derives "show a score?" and "flag the row?" from this one shape.

import { isAffectiveComplete } from "@/lib/scoring";
import { DESCRIPTOR_STAGES } from "@/lib/descriptors";
import type { SessionFormat } from "@/lib/constants";

export type MyEvaluationStatus = "none" | "draft" | "submitted";

export type MyEvaluation = {
  status: MyEvaluationStatus;
  // Every scored field the format requires is present — the score is real,
  // not a 5-filled placeholder. Always false for `none`.
  complete: boolean;
};

export const NO_EVALUATION: MyEvaluation = { status: "none", complete: false };

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * "Complete" mirrors what the score actually needs:
 * - affective / combined → all 8 affective ratings > 0 (isAffectiveComplete —
 *   the same gate computeGroupAggregate uses to include a cupper).
 * - descriptive → every one of the 7 intensity sliders set (> 0); descriptive
 *   sessions have no score, so this only drives the progress banner.
 * Descriptor pills and notes are optional here on purpose: the cup-screen
 * "you missed X" guard (lib/completeness.ts) is a soft reminder the cupper may
 * override, and a submitted evaluation must never be re-flagged for it.
 */
export function isEvaluationComplete(
  format: SessionFormat,
  data: Record<string, unknown>,
): boolean {
  if (format === "descriptive") {
    return DESCRIPTOR_STAGES.every((stage) => num(data[`${stage.id}_int`]) > 0);
  }
  return isAffectiveComplete(data);
}

export function deriveMyEvaluation(
  format: SessionFormat,
  ev: { isDraft: boolean; data: Record<string, unknown> } | null | undefined,
): MyEvaluation {
  if (!ev) return NO_EVALUATION;
  return {
    status: ev.isDraft ? "draft" : "submitted",
    complete: isEvaluationComplete(format, ev.data),
  };
}

/**
 * Whether a results surface may print the viewer's own score for this row.
 * Submitted rows keep today's behaviour (the cupper chose to send them);
 * drafts only score once complete; unevaluated rows never do.
 */
export function canShowMyScore(my: MyEvaluation): boolean {
  if (my.status === "submitted") return true;
  if (my.status === "draft") return my.complete;
  return false;
}

export type MyProgress = {
  complete: number;
  total: number;
  // True when every sample has a SUBMITTED evaluation — the banner and chips
  // go away entirely.
  allSubmitted: boolean;
};

export function summarizeMyProgress(rows: MyEvaluation[]): MyProgress {
  return {
    complete: rows.filter((r) => r.complete).length,
    total: rows.length,
    allSubmitted: rows.length > 0 && rows.every((r) => r.status === "submitted"),
  };
}
