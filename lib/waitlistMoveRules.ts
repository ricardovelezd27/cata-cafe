// Pure rule for moving a founding-seat reservation when the NEW address
// already has a reservation of its own (S10 leftovers A2). Dependency-free.
//
// Both rows belong to the same person: they proved control of the new address
// by confirming the email change. Keep the EARLIER-created row (their place in
// the list), give it the new address, delete the other. The kept row keeps its
// own source and consent fields; it takes the other row's consent stamp (the
// pair, never half) only where its own consentAt is null.

export type WaitlistRowFacts = {
  id: string;
  createdAt: Date;
  consentAt: Date | null;
  consentNoticeVersion: string | null;
};

export type WaitlistMergePlan = {
  keepId: string;
  deleteId: string;
  /** The consent stamp to write on the kept row, or null to leave it as is. */
  adoptConsent: { consentAt: Date; consentNoticeVersion: string | null } | null;
};

/** `atOld` is the row at the old address, `atNew` the row at the new one. A tie
 *  on createdAt keeps the old-address row (deterministic). */
export function planWaitlistMerge(atOld: WaitlistRowFacts, atNew: WaitlistRowFacts): WaitlistMergePlan {
  const keep = atNew.createdAt.getTime() < atOld.createdAt.getTime() ? atNew : atOld;
  const drop = keep === atOld ? atNew : atOld;
  const adoptConsent =
    keep.consentAt === null && drop.consentAt !== null
      ? { consentAt: drop.consentAt, consentNoticeVersion: drop.consentNoticeVersion }
      : null;
  return { keepId: keep.id, deleteId: drop.id, adoptConsent };
}
