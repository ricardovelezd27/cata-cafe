// Pure rules for the monthly insights digest claim (S8-14, F-insights-3).
// The old flow checked "did this period run?", sent, THEN recorded the run, so
// two concurrent cron invocations both sent, and a run that sent nothing (no
// email key) still marked the month as done. The new flow claims the period
// first (a `running` DigestRun row; the unique period is the lock), sends,
// records per-recipient outcomes, then marks the row `done`.
//
// Dependency-free so it is unit-tested; lib/insightsDigestEmail.ts does the I/O.

/** A `running` claim older than this is a crashed run and may be taken over. */
export const DIGEST_STALE_MS = 30 * 60 * 1000;

export type DigestRunStatus = "running" | "done";
export type RecipientOutcome = "sent" | "failed";
export type DigestResults = Record<string, RecipientOutcome>;

/** What an existing row for the period means for a new invocation. */
export type ExistingRunState = "done" | "running" | "stale";

export function classifyExistingRun(
  row: { status: string; createdAt: Date },
  now: Date,
): ExistingRunState {
  // Rows written before the status column existed default to 'done'.
  if (row.status !== "running") return "done";
  return now.getTime() - row.createdAt.getTime() >= DIGEST_STALE_MS ? "stale" : "running";
}

/** Reads the `results` JSON column defensively; anything unexpected is dropped. */
export function parseResults(value: unknown): DigestResults {
  const out: DigestResults = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [email, outcome] of Object.entries(value as Record<string, unknown>)) {
    if (outcome === "sent" || outcome === "failed") out[email] = outcome;
  }
  return out;
}

/** A re-run (stale takeover) only sends to recipients without a `sent` result. */
export function recipientsStillToSend(targets: string[], previous: DigestResults): string[] {
  return targets.filter((email) => previous[email] !== "sent");
}

export function mergeResults(
  previous: DigestResults,
  attempts: { email: string; ok: boolean }[],
): DigestResults {
  const merged: DigestResults = { ...previous };
  for (const a of attempts) {
    // A recorded `sent` is never downgraded.
    if (merged[a.email] === "sent") continue;
    merged[a.email] = a.ok ? "sent" : "failed";
  }
  return merged;
}

export function countSent(results: DigestResults): number {
  return Object.values(results).filter((o) => o === "sent").length;
}

/** A run with zero successful sends releases the month so it can be retried. */
export function shouldReleasePeriod(results: DigestResults): boolean {
  return countSent(results) === 0;
}

/** The "open insights" link uses the RECIPIENT's locale (it used to be /es/). */
export function digestInsightsUrl(origin: string, locale: "es" | "en"): string {
  return `${origin.replace(/\/+$/, "")}/${locale}/app/insights`;
}
