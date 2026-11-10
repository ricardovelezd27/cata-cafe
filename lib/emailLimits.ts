// Outbound-email limits (S8-03: F-grupos-1, F-entrar-6, F-landing-2).
//
// Pure: no Prisma, no Next, no env. The numbers and the decision live here so
// a unit test pins them and a live-event morning can be unblocked by editing
// ONE file. The ledger read/write is lib/emailBudget.ts (server-only).
//
// Every public sender reserves budget BEFORE it sends. A reservation is one
// row in `outbound_email_events`; the rules below are evaluated over the rows
// of one bucket (same kind + same actor, or same kind + same target).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** What is being sent. One meaning each:
 *  - `magic_link`       sign-in link (login form, waitlist, guest claim)
 *  - `group_broadcast`  one message to a whole roster (compose, session
 *                       notice, announcement post). Uses a broadcast slot.
 *  - `group_invite`     invitations (create group, add member, resend) and
 *                       "retry failed" of a broadcast. Recipients only. */
export type EmailKind = "magic_link" | "group_broadcast" | "group_invite";

/** One reservation already in the ledger, reduced to what a rule needs. */
export type EmailEvent = { at: number; recipients: number };

/** A limit over a time window. Either bound may be omitted. */
export type ThrottleRule = {
  windowMs: number;
  /** Max number of reservations (sends, broadcasts) in the window. */
  maxEvents?: number;
  /** Max total recipients across the reservations in the window. */
  maxRecipients?: number;
};

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

// ── Magic link ──────────────────────────────────────────────────────────────
// Per address: stops one mailbox being flooded.
export const MAGIC_LINK_PER_ADDRESS: ThrottleRule = { windowMs: 15 * MINUTE, maxEvents: 3 };
// Per IP: an abuse tripwire only. A cupping room shares one NAT address and
// ~50 walk-up guests all ask for a link to claim their results within minutes,
// so this must sit well above a full room (the audit's draft value of 6 would
// have locked the room out).
export const MAGIC_LINK_PER_IP: ThrottleRule = { windowMs: 15 * MINUTE, maxEvents: 60 };

// ── Group mail (per sending account) ────────────────────────────────────────
export const GROUP_BROADCASTS_PER_HOUR: ThrottleRule = { windowMs: HOUR, maxEvents: 3 };
export const GROUP_RECIPIENTS_PER_DAY: ThrottleRule = { windowMs: DAY, maxRecipients: 300 };
/** Replaces GROUP_RECIPIENTS_PER_DAY while the account is younger than
 *  NEW_ACCOUNT_AGE_MS. */
export const GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT: ThrottleRule = { windowMs: DAY, maxRecipients: 40 };
export const NEW_ACCOUNT_AGE_MS = DAY;

/** The longest window any rule looks back; the ledger query uses it. */
export const MAX_WINDOW_MS = DAY;

/** The per-day recipient rule for an account created at `accountCreatedAt`. */
export function groupRecipientRule(accountCreatedAt: number | null, now: number): ThrottleRule {
  const isNew = accountCreatedAt !== null && now - accountCreatedAt < NEW_ACCOUNT_AGE_MS;
  return isNew ? GROUP_RECIPIENTS_PER_DAY_NEW_ACCOUNT : GROUP_RECIPIENTS_PER_DAY;
}

/** Decide whether ONE more reservation of `request.recipients` fits `rule`,
 *  given the reservations already made in the same bucket.
 *
 *  Contract (pinned by tests/emailLimits.test.ts):
 *  - `events` may contain rows older than the window; ignore them.
 *  - `maxEvents`: allowed while fewer than `maxEvents` reservations fall
 *    inside the window (the request would be the next one).
 *  - `maxRecipients`: allowed while recipients inside the window plus
 *    `request.recipients` do not exceed it. No partial sends.
 *  - When refused, `retryAfterMs` is how long until the request would fit
 *    (always > 0). */
export function decideThrottle(
  events: readonly EmailEvent[],
  rule: ThrottleRule,
  request: { recipients: number },
  now: number,
): ThrottleDecision {
  // TODO(human): implement the window decision described in the contract above.
  void events;
  void rule;
  void request;
  void now;
  throw new Error("decideThrottle_not_implemented");
}

/** All rules must allow; the longest wait wins so the caller can show one. */
export function decideAll(
  checks: ReadonlyArray<{ events: readonly EmailEvent[]; rule: ThrottleRule }>,
  request: { recipients: number },
  now: number,
): ThrottleDecision {
  let retryAfterMs = 0;
  for (const c of checks) {
    const d = decideThrottle(c.events, c.rule, request, now);
    if (!d.allowed) retryAfterMs = Math.max(retryAfterMs, d.retryAfterMs);
  }
  return retryAfterMs > 0 ? { allowed: false, retryAfterMs } : { allowed: true };
}
