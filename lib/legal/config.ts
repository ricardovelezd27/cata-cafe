// Legal publication switch (S8-08, F-landing-1; text supplied in S10 WP9a).
// PUBLISHED on 2026-11-13: the owner read /privacidad, /terminos and
// /aviso-legal (es and en) and said "Yes, publish". While this is true the
// footer, the login page and both waitlist forms link to the pages, the
// "Borrador" banner is gone, the pages are indexable and listed in the
// sitemap, and every new waitlist row is stamped with consentAt and
// CONSENT_NOTICE_VERSION. Setting it back to false hides all of that again
// (the pages still render for a direct visit, as a draft, noindex).
// If the legal TEXT changes, bump CONSENT_NOTICE_VERSION in the same PR.
export const LEGAL_PAGES_PUBLISHED = true;

/** Stored in WaitlistEntry.consentNoticeVersion once the pages are published. */
export const CONSENT_NOTICE_VERSION = "2026-11-v1";

/** An account that was never used (a founding-seat reservation or a sign-in
 *  request whose person never signed in) is deleted, with its reservation,
 *  after this many months (daily cron). Owner decision, 2026-11-14: 12 months,
 *  really deleted. The privacy text states the period through this constant. */
export const WAITLIST_RETENTION_MONTHS = 12;
