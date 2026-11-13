// Legal publication switch (S8-08, F-landing-1; text supplied in S10 WP9a).
// The privacy, terms and legal-notice pages carry the final adapted text
// (lib/legal/es/*, en/*) but are NOT published yet. While this is false: the
// pages render for a direct visit (with a "Borrador" banner, noindex), but
// nothing links to them, the footer keeps its mailto links and the waitlist
// notice line is not shown. The consent columns are written null while this is
// false (no notice was shown, so no consent is recorded) and stamped only once
// it is true.
//
// TODO(owner): approve the preview of /es|en/privacidad, /terminos and
// /aviso-legal, then flip this to true in a one-line PR (docs/LAUNCH-RUNBOOK.md
// "Publishing the legal pages").
export const LEGAL_PAGES_PUBLISHED = false;

/** Stored in WaitlistEntry.consentNoticeVersion once the pages are published. */
export const CONSENT_NOTICE_VERSION = "2026-11-v1";

/** An account that was never used (a founding-seat reservation or a sign-in
 *  request whose person never signed in) is deleted, with its reservation,
 *  after this many months (daily cron). Owner decision, 2026-11-14: 12 months,
 *  really deleted. The privacy text states the period through this constant. */
export const WAITLIST_RETENTION_MONTHS = 12;
