// Consent record for a new waitlist row (S8-08 review). Pure; the flag and the
// version are injected so both states are tested. While the legal pages are not
// published the person is shown no notice, so recording consent would be false:
// both columns stay null until the pages go live.

export interface ConsentStamp {
  consentAt: Date | null;
  consentNoticeVersion: string | null;
}

export function consentStamp(published: boolean, noticeVersion: string, now: Date = new Date()): ConsentStamp {
  return published
    ? { consentAt: now, consentNoticeVersion: noticeVersion }
    : { consentAt: null, consentNoticeVersion: null };
}
