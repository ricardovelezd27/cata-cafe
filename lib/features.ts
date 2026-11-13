import "server-only";

// Feature switches read from the environment. SERVER ONLY: never import from a
// client component (pass the boolean down as a prop / render conditionally in a
// server component).

/** Pure parse: a switch is ON only for the exact string "1". Anything else
 *  (unset, "0", "true", " 1 ") is OFF, so a typo can never enable a feature. */
export function parseFlag(value: string | undefined): boolean {
  return value === "1";
}

/**
 * Account deletion (S8-19) ships DISABLED (S8-22 A-01): it is irreversible and
 * has never been executed, because no non-production environment exists yet.
 * Set ACCOUNT_DELETION_ENABLED=1 only after the throwaway-account rehearsal in
 * docs/LAUNCH-RUNBOOK.md §24 has passed.
 */
export function isAccountDeletionEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseFlag(env.ACCOUNT_DELETION_ENABLED);
}

/**
 * The 12-month deletion of accounts that were never used (S10 WP9a, privacy
 * text sections 3 and 10). OFF by default: the daily cron then only COUNTS what
 * it would delete (cron summary `unusedAccounts`). Set UNUSED_ACCOUNT_PURGE_ENABLED=1
 * only after the rehearsal in docs/LAUNCH-RUNBOOK.md ("Unused accounts") has
 * passed, and before the first never-used account reaches 12 months.
 */
export function isUnusedAccountPurgeEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseFlag(env.UNUSED_ACCOUNT_PURGE_ENABLED);
}
