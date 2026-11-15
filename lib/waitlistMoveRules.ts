// Pure rule for moving a founding-seat reservation when the NEW address
// already has a reservation of its own (S10 leftovers A2). Dependency-free.
//
// Both rows belong to the same person: they proved control of the new address
// by confirming the email change. Keep the EARLIER-created row (their place in
// the list), give it the new address, delete the other. The kept row keeps its
// own source and consent fields; it takes the other row's consent stamp (the
// pair, never half) only where its own consentAt is null.
//
// Since 2026-11-15 a row can also be a newsletter subscription and nothing
// else (lib/newsletter.ts, `plan = "newsletter"`). Two rules follow:
//  - a founding reservation always wins over a newsletter-only row, whatever
//    their dates: an email change must never cost a person their reservation;
//  - a newsletter opt-in on the row that is dropped is carried onto the row
//    that is kept (as the dated mark at the end of `source`).

import { NEWSLETTER_PLAN, carryMark, newsletterMark } from "./newsletter";

export type WaitlistRowFacts = {
  id: string;
  createdAt: Date;
  consentAt: Date | null;
  consentNoticeVersion: string | null;
  /** Absent = a founding reservation (rows read before the newsletter existed). */
  plan?: string;
  source?: string;
};

export type WaitlistMergePlan = {
  keepId: string;
  deleteId: string;
  /** The consent stamp to write on the kept row, or null to leave it as is. */
  adoptConsent: { consentAt: Date; consentNoticeVersion: string | null } | null;
  /** The kept row's new `source` (it took over a newsletter opt-in), or null. */
  source: string | null;
};

const onlyNewsletter = (r: WaitlistRowFacts) => r.plan === NEWSLETTER_PLAN;

/** `atOld` is the row at the old address, `atNew` the row at the new one. A tie
 *  on createdAt keeps the old-address row (deterministic). */
export function planWaitlistMerge(atOld: WaitlistRowFacts, atNew: WaitlistRowFacts): WaitlistMergePlan {
  const earlier = atNew.createdAt.getTime() < atOld.createdAt.getTime() ? atNew : atOld;
  // One is a reservation and the other only a newsletter row: the reservation.
  const keep = onlyNewsletter(atOld) !== onlyNewsletter(atNew) ? (onlyNewsletter(atOld) ? atNew : atOld) : earlier;
  const drop = keep === atOld ? atNew : atOld;
  // A newsletter-only row's stamp is the consent to the NEWSLETTER notice: it
  // travels as the mark, never as the kept reservation's own consent stamp.
  const adoptConsent =
    keep.consentAt === null && drop.consentAt !== null && !onlyNewsletter(drop)
      ? { consentAt: drop.consentAt, consentNoticeVersion: drop.consentNoticeVersion }
      : null;
  let source: string | null = null;
  if (drop.source !== undefined && keep.source !== undefined) {
    const mark = newsletterMark({ plan: drop.plan ?? "", source: drop.source, consentAt: drop.consentAt, createdAt: drop.createdAt });
    if (mark) {
      const next = onlyNewsletter(keep) ? keep.source : carryMark(keep.source, mark);
      if (next !== keep.source) source = next;
    }
  }
  return { keepId: keep.id, deleteId: drop.id, adoptConsent, source };
}
