// Pure rules for the 12-month deletion of accounts that were never used
// (S10 WP9a, owner decision 2026-11-14). Dependency-free so it is unit-tested;
// the SQL and the transaction are in lib/unusedAccountPurge.ts (server-only),
// which MIRRORS `notUnusedReason` in SQL (tests/db/unusedAccountPurge.dbtest.ts
// proves the two agree on a matrix) and follows UNUSED_ACCOUNT_RULES table by
// table.

import { manifestKey, PROFILE_MANIFEST } from "@/lib/accountDeletion/manifest";
import { waitlistPurgeCutoff } from "@/lib/legal/waitlistRetention";

/** An access email sent this recently may still be in someone's inbox: the
 *  account is left for a later run so the link is never broken. */
export const RECENT_ACCESS_EMAIL_HOURS = 48;
/** Accounts deleted per run at most (oldest first). */
export const UNUSED_ACCOUNT_BATCH = 50;
/** Waitlist rows with no auth user deleted per run at most (oldest first). */
export const ORPHAN_WAITLIST_BATCH = 500;

export function recentAccessEmailThreshold(now: Date): Date {
  return new Date(now.getTime() - RECENT_ACCESS_EMAIL_HOURS * 3_600_000);
}

// ── The "never used" predicate over one auth.users row ─────────────────────

/** The columns of auth.users the rule reads. */
export type AuthUserFacts = {
  isAnonymous: boolean;
  email: string | null;
  createdAt: Date;
  emailConfirmedAt: Date | null;
  phoneConfirmedAt: Date | null;
  lastSignInAt: Date | null;
  invitedAt: Date | null;
  bannedUntil: Date | null;
  deletedAt: Date | null;
  isSsoUser: boolean;
  confirmationSentAt: Date | null;
  recoverySentAt: Date | null;
  emailChangeSentAt: Date | null;
  reauthenticationSentAt: Date | null;
};

export type NotUnusedReason =
  | "anonymous"
  | "no_email"
  | "protected_email"
  | "confirmed"
  | "signed_in"
  | "invited"
  | "sso"
  | "banned"
  | "soft_deleted"
  | "too_recent"
  | "access_email_recent";

/**
 * null = the account is "never used" and old enough: it may be deleted (the
 * database part is then decided by planUnusedAccountDeletion). Otherwise why
 * not. Boundaries: created strictly BEFORE the cutoff (calendar months,
 * waitlistPurgeCutoff); an access email counts as recent only when sent
 * strictly AFTER now - 48 h (sent exactly 48 h ago no longer protects).
 *
 * `protectedEmails` = the super-admin and the AI-admin allowlist, lowercase.
 * A Google account is confirmed at creation (email_confirmed_at set), so it is
 * never selected; an OTP / magic-link sign-in confirms the address and sets
 * last_sign_in_at.
 */
export function notUnusedReason(
  u: AuthUserFacts,
  now: Date,
  months: number,
  protectedEmails: readonly string[] = [],
): NotUnusedReason | null {
  if (u.isAnonymous) return "anonymous";
  if (!u.email) return "no_email";
  if (protectedEmails.includes(u.email.trim().toLowerCase())) return "protected_email";
  if (u.emailConfirmedAt || u.phoneConfirmedAt) return "confirmed";
  if (u.lastSignInAt) return "signed_in";
  if (u.invitedAt) return "invited";
  if (u.isSsoUser) return "sso";
  if (u.bannedUntil) return "banned";
  if (u.deletedAt) return "soft_deleted";
  if (!(u.createdAt.getTime() < waitlistPurgeCutoff(now, months).getTime())) return "too_recent";
  const threshold = recentAccessEmailThreshold(now).getTime();
  for (const sent of [u.confirmationSentAt, u.recoverySentAt, u.emailChangeSentAt, u.reauthenticationSentAt]) {
    if (sent && sent.getTime() > threshold) return "access_email_recent";
  }
  return null;
}

export function isNeverUsedAccount(
  u: AuthUserFacts,
  now: Date,
  months: number,
  protectedEmails: readonly string[] = [],
): boolean {
  return notUnusedReason(u, now, months, protectedEmails) === null;
}

// ── What the database does with the account, table by table ────────────────

/** blocks = proof the account WAS used: it is not deleted (skippedUsed);
 *  erase  = the account's own bookkeeping, or a grant TO it: deleted with it;
 *  unlink = a row owned by SOMEONE ELSE that points at it: kept, link cleared. */
export type UnusedRule = {
  rule: "blocks" | "erase" | "unlink";
  /** SQL table and column, used to build the "is it empty" candidate filter
   *  and by the DB tests. */
  table: string;
  column: string;
  why: string;
};

/** Keyed by manifestKey(model, field). tests/unusedAccountRules.test.ts keeps
 *  the key set EQUAL to PROFILE_MANIFEST, so a new table with a user column
 *  fails the build until it is given a rule here. */
export const UNUSED_ACCOUNT_RULES: Readonly<Record<string, UnusedRule>> = {
  "Coffee.createdBy": { rule: "blocks", table: "coffees", column: "createdBy", why: "created a coffee" },
  "CoffeeInvite.createdBy": { rule: "blocks", table: "coffee_invites", column: "createdBy", why: "created a coffee invite" },
  "CuppingSession.createdBy": { rule: "blocks", table: "cupping_sessions", column: "createdBy", why: "created a session" },
  "Evaluation.cupperId": { rule: "blocks", table: "evaluations", column: "cupperId", why: "wrote an evaluation" },
  "PhysicalEvaluation.evaluatedBy": { rule: "blocks", table: "physical_evaluations", column: "evaluatedBy", why: "wrote a physical evaluation" },
  "ExtrinsicData.revealedBy": { rule: "blocks", table: "extrinsic_data", column: "revealedBy", why: "revealed a sample" },
  "SessionInvite.createdBy": { rule: "blocks", table: "session_invites", column: "createdBy", why: "created a session invite" },
  "CoffeeShare.userId": { rule: "erase", table: "coffee_shares", column: "userId", why: "a grant TO the account by another person: the grant dies, the coffee stays" },
  "SessionParticipant.userId": { rule: "blocks", table: "session_participants", column: "userId", why: "took part in (or was added to) a session" },
  "UserCoffeeHistory.userId": { rule: "blocks", table: "user_coffee_history", column: "userId", why: "has tasting history" },
  "SavedInsight.createdBy": { rule: "blocks", table: "saved_insights", column: "createdBy", why: "saved an insight" },
  "TastingGroup.createdBy": { rule: "blocks", table: "tasting_groups", column: "createdBy", why: "owns a group" },
  "GroupPost.authorId": { rule: "blocks", table: "group_posts", column: "authorId", why: "wrote a group post" },
  "TastingGroupMember.userId": { rule: "unlink", table: "tasting_group_members", column: "userId", why: "the group owner's roster row keeps the address the owner typed and loses the link to the account (the FK is SET NULL)" },
  "CloseEmailDelivery.userId": { rule: "erase", table: "close_email_deliveries", column: "userId", why: "the account's own email ledger" },
  "SessionReminderDelivery.userId": { rule: "erase", table: "session_reminder_deliveries", column: "userId", why: "the account's own email ledger" },
  "AiChatUsage.userId": { rule: "blocks", table: "ai_chat_usage", column: "userId", why: "used the analysis assistant" },
  "SessionParticipant.excludedBy": { rule: "blocks", table: "session_participants", column: "excluded_by", why: "excluded someone from a session's results" },
  "OutboundEmailEvent.actorKey": { rule: "erase", table: "outbound_email_events", column: "actorKey", why: "the account's own throttle ledger ('u_<id>')" },
  "WaitlistEntry.email": { rule: "erase", table: "waitlist_entries", column: "email", why: "the reservation, matched on the normalised address" },
};

/** The rule for every manifest entry, in manifest order. */
export function rulesInManifestOrder(): { key: string; rule: UnusedRule }[] {
  return PROFILE_MANIFEST.map((e) => {
    const key = manifestKey(e.model, e.field);
    const rule = UNUSED_ACCOUNT_RULES[key];
    if (!rule) throw new Error(`unused-account rule missing for ${key}`);
    return { key, rule };
  });
}

export type ProfileFacts = {
  analyticsAccess: boolean;
  onboardingCompleted: boolean;
  role: string;
  hasCountry: boolean;
  hasBio: boolean;
  hasAvatar: boolean;
};

/** The role a profile gets when it is created and nobody has chosen one. */
export const DEFAULT_PROFILE_ROLE = "cupping_pro";

export function profileUsedReasons(p: ProfileFacts | null): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.analyticsAccess) out.push("profile.analyticsAccess");
  if (p.onboardingCompleted) out.push("profile.onboardingCompleted");
  if (p.role !== DEFAULT_PROFILE_ROLE) out.push("profile.role");
  if (p.hasCountry) out.push("profile.country");
  if (p.hasBio) out.push("profile.bio");
  if (p.hasAvatar) out.push("profile.avatar");
  return out;
}

export type UnusedPlan =
  | { ok: false; usedBecause: string[] }
  | { ok: true; erase: string[]; unlink: string[] };

/**
 * `counts`: manifest key -> number of rows that point at the account (zero or
 * absent = none). An unknown key blocks (fail safe), so a table nobody ruled on
 * can never be deleted through here.
 */
export function planUnusedAccountDeletion(
  profile: ProfileFacts | null,
  counts: Readonly<Record<string, number>>,
): UnusedPlan {
  const usedBecause = profileUsedReasons(profile);
  const erase: string[] = [];
  const unlink: string[] = [];
  for (const [key, n] of Object.entries(counts)) {
    if (!(n > 0)) continue;
    const r = UNUSED_ACCOUNT_RULES[key];
    if (!r || r.rule === "blocks") usedBecause.push(key);
    else if (r.rule === "erase") erase.push(key);
    else unlink.push(key);
  }
  if (usedBecause.length > 0) return { ok: false, usedBecause };
  return { ok: true, erase, unlink };
}
