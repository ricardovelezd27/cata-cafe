import { MIN_CUPS_FOR_PENALTIES } from "@/lib/scoring";

// S8-04 (F-solo-4, F-express-4). Pure rules for what the per-user coffee
// history shows. Dependency-free (tests import it).

/**
 * The community score a history row may carry. The trigger writes
 * communityScore = 0 when no COMPLETE affective evaluation exists (COALESCE to
 * 0), which is what a descriptive-only or incomplete session ends up with:
 * showing "0.00" there is a lie. Only a stored aggregate with at least one
 * included evaluation (participantCount > 0) is a real score.
 */
export function historyCommunityScore(
  aggregate: { communityScore: number | null; participantCount: number } | null | undefined,
): number | null {
  if (!aggregate || aggregate.participantCount <= 0) return null;
  return aggregate.communityScore;
}

/**
 * "Impresion rapida": a score from fewer cups than the protocol's penalty gate.
 * Display-only tag, never changes a score. TODO(A3): ships as option (b) (same
 * score, tagged); option (c) would drop these from the history.
 */
export function historyCupsPerSample(
  session: { cupsPerSample: number } | null | undefined,
  snapshot: { cupsPerSample?: number } | null | undefined,
): number | null {
  if (session) return session.cupsPerSample;
  return typeof snapshot?.cupsPerSample === "number" ? snapshot.cupsPerSample : null;
}

export function isQuickImpression(cupsPerSample: number | null | undefined): boolean {
  return typeof cupsPerSample === "number" && cupsPerSample < MIN_CUPS_FOR_PENALTIES;
}
