// Pure rules of the newsletter sign-up (landing page, closing block). No
// database, no request: unit-tested in tests/newsletter.test.ts.
//
// WHERE A SUBSCRIPTION LIVES (2026-11-15). There is no newsletter table yet:
// a database migration is the owner's to run, and the sign-up had to work the
// day it shipped. A subscription is a row of `waitlist_entries` (one row per
// address, `email` is unique):
//
//   - an address with no row gets one with `plan = "newsletter"` and
//     `source = "newsletter"` (plus the campaign tag), the consent time and
//     the notice version below. No account is created and no email is sent.
//   - an address that already reserved a founding seat keeps its row (and
//     the consent stamp of the reservation); the opt-in and its date are
//     recorded by appending "+newsletter@YYYY-MM-DD" to its `source`.
//   - a newsletter-only address that later reserves a founding seat becomes a
//     founding row (`plan = "pro"`) dated the day of the RESERVATION (its
//     place among the founders), with the reservation's consent stamp; the
//     newsletter opt-in and its own day stay in the mark.
//
// Retention is the reservations' own rule, unchanged: a row whose address has
// no account is deleted by the daily job after WAITLIST_RETENTION_MONTHS
// (lib/unusedAccountPurge.ts), and deleting an account deletes its row.
//
// TODO(owner): when the newsletter really exists, give it its own table
// (address, locale, consent, unsubscribedAt), a one-click unsubscribe link in
// every email, and move these rows there.

import { sanitizeSrcTag } from "./waitlistSource";

/** `waitlist_entries.plan` of a row that is ONLY a newsletter subscription. */
export const NEWSLETTER_PLAN = "newsletter";
/** `plan` of a founding reservation (the column's default). */
export const FOUNDING_PLAN = "pro";
/** Which consent notice the person saw under the newsletter form. */
export const NEWSLETTER_NOTICE_VERSION = "newsletter-2026-11-v1";

const BASE = "newsletter";
const SUFFIX = "+newsletter";
/** "+newsletter@2026-11-15" at the end of a source: the opt-in and its day (UTC). */
const MARK_RE = /\+newsletter@\d{4}-\d{2}-\d{2}$/;

/** `source` of a new newsletter-only row: "newsletter" or "newsletter:<tag>". */
export function newsletterSource(src: unknown): string {
  const tag = sanitizeSrcTag(src);
  return tag ? `${BASE}:${tag}` : BASE;
}

/** True when the row records a newsletter opt-in. */
export function hasNewsletter(row: { plan: string; source: string }): boolean {
  return row.plan === NEWSLETTER_PLAN || MARK_RE.test(row.source);
}

/** The `source` of an existing row once it also carries the opt-in, with the
 *  day it was given (idempotent: an existing mark keeps its own day). */
export function withNewsletter(source: string, now: Date = new Date()): string {
  if (MARK_RE.test(source)) return source;
  return `${source}${SUFFIX}@${now.toISOString().slice(0, 10)}`;
}

/**
 * What a founding reservation does to a row that already exists for the
 * address: a newsletter-only row becomes a founding row that keeps the
 * opt-in; any other row is left as it is (null).
 */
export function foundingUpgrade(
  existing: { plan: string; source: string; consentAt: Date | null; createdAt: Date },
  foundingSource: string,
): { plan: string; source: string } | null {
  if (existing.plan !== NEWSLETTER_PLAN) return null;
  // The day of the opt-in is the day the newsletter row was made.
  return { plan: FOUNDING_PLAN, source: withNewsletter(foundingSource, existing.consentAt ?? existing.createdAt) };
}

/**
 * What a newsletter sign-up writes, given the row the address already has
 * (null = none): "create" a newsletter-only row, "mark" an existing founding
 * row, or "none" when the opt-in is already recorded.
 */
export function newsletterWrite(
  existing: { plan: string; source: string } | null,
  src: unknown,
  now: Date = new Date(),
): { kind: "create"; plan: string; source: string } | { kind: "mark"; source: string } | { kind: "none" } {
  if (!existing) return { kind: "create", plan: NEWSLETTER_PLAN, source: newsletterSource(src) };
  if (hasNewsletter(existing)) return { kind: "none" };
  return { kind: "mark", source: withNewsletter(existing.source, now) };
}

/**
 * The opt-in of a row as a mark ("+newsletter@YYYY-MM-DD"), or null when the
 * row has none: the mark its `source` already ends with, or, for a
 * newsletter-only row, one made from the day it was created.
 */
export function newsletterMark(row: {
  plan: string;
  source: string;
  consentAt: Date | null;
  createdAt: Date;
}): string | null {
  const found = row.source.match(MARK_RE);
  if (found) return found[0];
  if (row.plan !== NEWSLETTER_PLAN) return null;
  return `${SUFFIX}@${(row.consentAt ?? row.createdAt).toISOString().slice(0, 10)}`;
}

/** `source` with `mark` at its end, unless it already carries an opt-in. */
export function carryMark(source: string, mark: string): string {
  return MARK_RE.test(source) ? source : `${source}${mark}`;
}
