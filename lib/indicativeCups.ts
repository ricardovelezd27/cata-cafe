/**
 * "Indicativo" by cups (S10 WP1c, owner's decision 7): ONE definition for every
 * scope — a number built on fewer than five POOLED cups is only a first signal.
 * Shared by the coffee's lifetime score and the session ranking
 * (lib/reports/ranking.ts RANKING_POLICY). Display-only: scoring, the trigger
 * and AggregateScore never read it.
 * TODO(kim-validar:A2)
 */
export const INDICATIVE_BELOW_CUPS = 5;

/** `cups` = the cups pooled in the scope (Σ over the included evaluations). */
export function isIndicativeByCups(cups: number | null | undefined): boolean {
  return typeof cups === "number" && Number.isFinite(cups) && cups < INDICATIVE_BELOW_CUPS;
}
