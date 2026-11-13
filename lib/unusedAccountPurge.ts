import "server-only";

import { prisma } from "@/lib/prisma";
import { WAITLIST_RETENTION_MONTHS } from "@/lib/legal/config";
import { waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";
import { getSuperAdminEmail } from "@/lib/analytics/access";
import { deleteAuthUser } from "@/lib/accountDeletion/deleteAccount";
import { logError, logInfo, logWarn } from "@/lib/log";
import { normalizeAddress } from "@/lib/emailChangeRules";
import {
  ORPHAN_WAITLIST_BATCH,
  UNUSED_ACCOUNT_BATCH,
  UNUSED_ACCOUNT_RULES,
  planUnusedAccountDeletion,
  recentAccessEmailThreshold,
  rulesInManifestOrder,
  type ProfileFacts,
} from "@/lib/unusedAccountRules";

/**
 * The 12-month deletion of accounts that were NEVER USED (privacy policy
 * sections 3 and 10; owner decision 2026-11-14). Called from the daily
 * close-expired-sessions cron. Switch: UNUSED_ACCOUNT_PURGE_ENABLED=1
 * (lib/features.ts); OFF = it only counts what it would delete.
 *
 * Every founding-seat reservation and every request for a sign-in link creates
 * an auth user at once (signInWithOtp) and handle_new_user creates its
 * profile, so "never used" is a property of the AUTH row: not anonymous,
 * never confirmed, never signed in, older than WAITLIST_RETENTION_MONTHS, and
 * no access email in the last 48 h (the predicate is `notUnusedReason` in
 * lib/unusedAccountRules.ts; the SQL below mirrors it and the DB suite proves
 * they agree).
 *
 * Candidates are selected IN SQL against auth.users (Prisma connects as
 * postgres), oldest first, at most UNUSED_ACCOUNT_BATCH per run, and only
 * accounts that point at nothing that shows use (UNUSED_ACCOUNT_RULES "blocks"
 * tables, the profile flags). The same facts are re-read INSIDE the
 * transaction before anything is written.
 *
 * Why a dedicated transaction and not deleteAccountData: that function always
 * creates a `deleted_<random>` placeholder profile (which would be left behind
 * for an empty account), re-plans sessions and groups, and closes live
 * sessions. An account allowed through here owns none of that, so the smaller
 * blast radius is a short transaction driven by the SAME table list
 * (PROFILE_MANIFEST via UNUSED_ACCOUNT_RULES; tests/unusedAccountRules.test.ts
 * keeps the two equal).
 *
 * Order: ONE transaction per account (re-check, unlink/erase rows, profile),
 * THEN the auth user through the admin API (3 attempts, orphan logged: the
 * helper account deletion uses). profiles has no FK to auth.users, so deleting
 * the auth user does not cascade. Database first is deliberate: if the auth
 * delete then fails, the auth user is still a candidate next run (nothing
 * left to delete in the database, the auth delete is retried); the other way
 * round would leave a profile (with a display name derived from the address)
 * that no auth-based query finds again.
 *
 * Logs carry ids, counts and codes only, never an address.
 */

export type UnusedAccountSummary = {
  /** Accounts that would be (or, enabled, were attempted to be) deleted. */
  due: number;
  deleted: number;
  /** Never-used by the auth row but pointing at something that shows use (or
   *  changed since it was selected): kept. */
  skippedUsed: number;
  failed: number;
  enabled: boolean;
  /** Reservations whose address has no auth user at all, older than the cutoff. */
  orphanReservations: { due: number; deleted: number };
};

type Candidate = { id: string; email: string };

/** The WHERE of the auth-only part of the predicate. $1 cutoff, $2 recent
 *  threshold, $3 protected emails (lowercase). Mirrors notUnusedReason. */
const AUTH_ELIGIBLE_WHERE = `
  u.is_anonymous = false
  AND u.email IS NOT NULL
  AND btrim(u.email) <> ''
  AND lower(btrim(u.email)) <> ALL($3::text[])
  AND u.email_confirmed_at IS NULL
  AND u.phone_confirmed_at IS NULL
  AND u.last_sign_in_at IS NULL
  AND u.invited_at IS NULL
  AND COALESCE(u.is_sso_user, false) = false
  AND u.banned_until IS NULL
  AND u.deleted_at IS NULL
  AND GREATEST(u.created_at, u.confirmation_sent_at, u.recovery_sent_at,
               u.email_change_sent_at, u.reauthentication_sent_at) < $1::timestamptz
  AND (u.confirmation_sent_at IS NULL OR u.confirmation_sent_at <= $2::timestamptz)
  AND (u.recovery_sent_at IS NULL OR u.recovery_sent_at <= $2::timestamptz)
  AND (u.email_change_sent_at IS NULL OR u.email_change_sent_at <= $2::timestamptz)
  AND (u.reauthentication_sent_at IS NULL OR u.reauthentication_sent_at <= $2::timestamptz)
  AND NOT EXISTS (
    SELECT 1 FROM waitlist_entries w
    WHERE lower(btrim(w.email)) = lower(btrim(u.email)) AND w."createdAt" >= $1::timestamptz)`;

/** The "nothing shows use" part, built from the same rule table the plan uses. */
function emptyAccountWhere(): string {
  const parts: string[] = [];
  for (const { rule } of rulesInManifestOrder()) {
    if (rule.rule !== "blocks") continue;
    parts.push(`NOT EXISTS (SELECT 1 FROM "${rule.table}" t WHERE t."${rule.column}" = u.id::text)`);
  }
  parts.push(`NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = u.id::text AND (
      p."analyticsAccess" OR p."onboardingCompleted" OR p.role <> 'cupping_pro'
      OR p.country IS NOT NULL OR p.bio IS NOT NULL OR p."avatarUrl" IS NOT NULL))`);
  return parts.join("\n  AND ");
}

function protectedEmails(): string[] {
  // The super-admin is never a candidate. AI admins are listed by email in an
  // env var and are staff accounts: also never.
  // (unset = no super-admin: required in production, F-insights-5)
  const out = new Set<string>();
  const admin = getSuperAdminEmail();
  if (admin) out.add(normalizeAddress(admin));
  for (const e of (process.env.ANALYTICS_AI_ADMIN_EMAILS ?? "").split(",")) {
    const k = normalizeAddress(e);
    if (k) out.add(k);
  }
  return [...out];
}

function params(now: Date) {
  return [
    waitlistPurgeCutoff(now, WAITLIST_RETENTION_MONTHS),
    recentAccessEmailThreshold(now),
    protectedEmails(),
  ] as const;
}

/** Test and runbook entry point: ids of auth users that pass the auth-only
 *  predicate (no "empty account" filter), oldest first. */
export async function selectAuthEligibleIds(now: Date, limit = 100_000): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT u.id::text AS id FROM auth.users u WHERE ${AUTH_ELIGIBLE_WHERE}
     ORDER BY u.created_at ASC, u.id ASC LIMIT ${Math.max(1, Math.floor(limit))}`,
    ...params(now),
  );
  return rows.map((r) => r.id);
}

async function countAuthEligible(now: Date): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM auth.users u WHERE ${AUTH_ELIGIBLE_WHERE}`,
    ...params(now),
  );
  return rows[0]?.n ?? 0;
}

async function countCandidates(now: Date): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM auth.users u WHERE ${AUTH_ELIGIBLE_WHERE} AND ${emptyAccountWhere()}`,
    ...params(now),
  );
  return rows[0]?.n ?? 0;
}

async function selectCandidates(now: Date, limit: number): Promise<Candidate[]> {
  return prisma.$queryRawUnsafe<Candidate[]>(
    `SELECT u.id::text AS id, lower(btrim(u.email)) AS email FROM auth.users u
     WHERE ${AUTH_ELIGIBLE_WHERE} AND ${emptyAccountWhere()}
     ORDER BY u.created_at ASC, u.id ASC LIMIT ${limit}`,
    ...params(now),
  );
}

// ── Reservations with no auth user at all ──────────────────────────────────
// No exception for an email change "in flight": while a change is really in
// flight the account still HOLDS the old address, so its reservation is not an
// orphan; once the change completes the move (confirmEmailToken) takes the row
// along. A stale app_metadata record therefore never protects anything.
// Addresses compare as lower(btrim()) here and normalizeAddress() in JS (both:
// lowercase, SPACES trimmed only).
const ORPHAN_WHERE = `w."createdAt" < $1::timestamptz
  AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(btrim(u.email)) = lower(btrim(w.email)))`;

async function purgeOrphanReservations(now: Date, enabled: boolean) {
  const cutoff = waitlistPurgeCutoff(now, WAITLIST_RETENTION_MONTHS);
  const due = (
    await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM waitlist_entries w WHERE ${ORPHAN_WHERE}`,
      cutoff,
    )
  )[0]?.n ?? 0;
  if (!enabled || due === 0) return { due, deleted: 0 };
  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM waitlist_entries WHERE id IN (
       SELECT w.id FROM waitlist_entries w WHERE ${ORPHAN_WHERE}
       ORDER BY w."createdAt" ASC, w.id ASC LIMIT ${ORPHAN_WAITLIST_BATCH})`,
    cutoff,
  );
  return { due, deleted };
}

async function stillAuthEligible(id: string, now: Date): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT u.id::text AS id FROM auth.users u WHERE ${AUTH_ELIGIBLE_WHERE} AND u.id = $4::uuid`,
    ...params(now),
    id,
  );
  return rows.length === 1;
}

// ── One account ────────────────────────────────────────────────────────────

type DbOutcome = "deleted" | "used";

async function deleteAccountRows(id: string, now: Date): Promise<DbOutcome> {
  return prisma.$transaction(
    async (tx) => {
      // Re-check under the transaction: still never used by the auth row (a
      // sign-in or a new access email since selection leaves it alone).
      const still = await tx.$queryRawUnsafe<{ email: string }[]>(
        `SELECT lower(btrim(u.email)) AS email FROM auth.users u WHERE ${AUTH_ELIGIBLE_WHERE} AND u.id = $4::uuid`,
        ...params(now),
        id,
      );
      if (still.length === 0) return "used";
      const email = still[0].email;

      const profileRows = await tx.profile.findUnique({
        where: { id },
        select: { analyticsAccess: true, onboardingCompleted: true, role: true, country: true, bio: true, avatarUrl: true },
      });
      const profile: ProfileFacts | null = profileRows
        ? {
            analyticsAccess: profileRows.analyticsAccess,
            onboardingCompleted: profileRows.onboardingCompleted,
            role: profileRows.role,
            hasCountry: profileRows.country !== null,
            hasBio: profileRows.bio !== null,
            hasAvatar: profileRows.avatarUrl !== null,
          }
        : null;

      // How many rows point at the account, per manifest table.
      const counts: Record<string, number> = {};
      for (const { key, rule } of rulesInManifestOrder()) {
        const r = await tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "${rule.table}" t WHERE ${matchSql(key, rule.column)}`,
          matchValue(key, id, email),
        );
        counts[key] = r[0]?.n ?? 0;
      }

      const plan = planUnusedAccountDeletion(profile, counts);
      if (!plan.ok) return "used";

      for (const key of plan.unlink) {
        const rule = UNUSED_ACCOUNT_RULES[key];
        await tx.$executeRawUnsafe(
          `UPDATE "${rule.table}" SET "${rule.column}" = NULL WHERE "${rule.column}" = $1`,
          id,
        );
      }
      for (const key of plan.erase) {
        const rule = UNUSED_ACCOUNT_RULES[key];
        await tx.$executeRawUnsafe(
          `DELETE FROM "${rule.table}" t WHERE ${matchSql(key, rule.column)}`,
          matchValue(key, id, email),
        );
      }
      // Last, and NOT caught: a Restrict FK nobody ruled on fails here and
      // rolls the whole account back (deleteMany: a missing profile is fine).
      await tx.profile.deleteMany({ where: { id } });
      return "deleted";
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}

/** The column predicate for one rule: the bare user id, `u_<id>` for the
 *  throttle ledger, the normalised address for the reservation (exact match). */
function matchSql(key: string, column: string): string {
  if (key === "WaitlistEntry.email") return `lower(btrim(t."${column}")) = $1`;
  return `t."${column}" = $1`;
}
function matchValue(key: string, id: string, email: string): string {
  if (key === "OutboundEmailEvent.actorKey") return `u_${id}`;
  if (key === "WaitlistEntry.email") return email;
  return id;
}

// ── The run ────────────────────────────────────────────────────────────────

/** Test seams only (tests/db/unusedAccountPurge.dbtest.ts): they let a test
 *  change the world at the two moments where a real sign-in could land. */
export type PurgeHooks = {
  /** After the candidates are selected, before any account's transaction. */
  afterSelect?: (candidates: readonly { id: string }[]) => Promise<void> | void;
  /** After an account's transaction committed, before the auth delete. */
  beforeAuthDelete?: (id: string) => Promise<void> | void;
};

export async function purgeUnusedAccounts(opts: {
  enabled: boolean;
  now?: Date;
  hooks?: PurgeHooks;
}): Promise<UnusedAccountSummary> {
  const now = opts.now ?? new Date();
  const enabled = opts.enabled;

  const eligible = await countAuthEligible(now);
  const due = await countCandidates(now);
  let skippedUsed = Math.max(0, eligible - due);
  let deleted = 0;
  let failed = 0;

  if (enabled && due > 0) {
    const candidates = await selectCandidates(now, UNUSED_ACCOUNT_BATCH);
    await opts.hooks?.afterSelect?.(candidates);
    for (const c of candidates) {
      try {
        const outcome = await deleteAccountRows(c.id, now);
        if (outcome === "used") {
          skippedUsed += 1;
          logInfo({ where: "unusedAccount.skippedUsed", userId: c.id });
          continue;
        }
        await opts.hooks?.beforeAuthDelete?.(c.id);
        // Right before the irreversible step: the account must still qualify
        // (a first sign-in, e.g. Google for the same address, may have landed
        // since the transaction). If not, keep the auth user.
        if (!(await stillAuthEligible(c.id, now))) {
          skippedUsed += 1;
          logWarn({ where: "unusedAccount.signedInDuringPurge", userId: c.id });
          continue;
        }
        if (await deleteAuthUser(c.id)) {
          deleted += 1;
          logInfo({ where: "unusedAccount.deleted", userId: c.id });
        } else {
          // Rows are gone; the auth user is still a candidate next run and the
          // admin delete is retried then (deleteAuthUser logged the orphan).
          failed += 1;
        }
      } catch (err) {
        failed += 1;
        const code = (err as { code?: unknown } | null)?.code;
        logError({ where: "unusedAccount.failed", userId: c.id, code: typeof code === "string" ? code : "unknown" });
      }
    }
  }

  const orphanReservations = await purgeOrphanReservations(now, enabled);

  if (!enabled && (due > 0 || orphanReservations.due > 0)) {
    logWarn({
      where: "unusedAccount.switchOff",
      message: "accounts are due for deletion but UNUSED_ACCOUNT_PURGE_ENABLED is not 1",
      due,
      orphanReservations: orphanReservations.due,
    });
  }
  return { due, deleted, skippedUsed, failed, enabled, orphanReservations };
}
