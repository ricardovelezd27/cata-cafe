// Legal publication switch (S8-08, F-landing-1). The privacy and terms pages
// ship with DRAFT text. While this is false: the pages render for a direct
// visit (with a "Borrador" banner, noindex), but nothing links to them, the
// footer keeps its mailto links and the waitlist notice line is not shown.
// The consent columns are stamped either way.
//
// TODO(owner): paste the final text into lib/legal/privacy.ts and terms.ts,
// bump CONSENT_NOTICE_VERSION, then flip this to true.
export const LEGAL_PAGES_PUBLISHED = false;

/** Stored in WaitlistEntry.consentNoticeVersion. "draft-0" = no final notice yet. */
export const CONSENT_NOTICE_VERSION = "draft-0";

/** Draft retention proposal for waitlist rows with no account. No job runs it. */
// TODO(owner): confirm the retention period (12 months) and the "te avisaremos" wording.
export const WAITLIST_RETENTION_MONTHS = 12;
