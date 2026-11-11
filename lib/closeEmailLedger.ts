// Pure rules for the close-email ledger (`close_email_deliveries`), S9-01 / B-08.
// No Prisma, no server-only: tests/closeEmailLedger.test.ts covers it.
//
// The row is RESERVED (status "sending") before the PDF render and the send,
// the way lib/reminderEmail.ts reserves its row, so the cron repair pass racing
// the owner's "resend" cannot email the same person twice. Unlike the reminder
// ledger (which deletes its row on failure), this table keeps the outcome of
// every attempt, so a reservation is a LEASE: a "sending" row older than
// CLOSE_EMAIL_LEASE_MS belongs to a run that crashed (or timed out) and is
// claimable again. No schema change: `status` is a free string and `updatedAt`
// is stamped on every write, including the claim.

export type CloseEmailStatus = "sending" | "sent" | "skipped" | "failed";

/** How long a "sending" reservation holds before another run may take it over.
 *  Far longer than one recipient's lookup + PDF render + send, shorter than
 *  the daily repair cadence. */
export const CLOSE_EMAIL_LEASE_MS = 10 * 60_000;

/** `updatedAt` (ms epoch) at or before which a "sending" row is abandoned. */
export function leaseCutoff(now: number): number {
  return now - CLOSE_EMAIL_LEASE_MS;
}

/**
 * May a run take this recipient now?
 *  - no row            → yes (create it)
 *  - "sent"            → never (the whole point of the ledger)
 *  - "failed"/"skipped"→ yes (retry; "skipped" covers a later-fixed address or
 *                        configuration, as before)
 *  - "sending"         → only once its lease expired (a crashed run)
 *  - anything unknown  → no (never email on a status we do not understand)
 */
export function isClaimable(
  row: { status: string; updatedAt: number } | null,
  now: number,
): boolean {
  if (!row) return true;
  switch (row.status) {
    case "failed":
    case "skipped":
      return true;
    case "sending":
      return row.updatedAt <= leaseCutoff(now);
    default:
      return false;
  }
}
