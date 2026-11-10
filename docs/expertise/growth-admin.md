---
domain: growth-admin
researched: 2026-11-06
model: claude-sonnet
flows: [Landing, Insights y administración]
---

# Growth and admin: landing conversion, admin access, PII, analytics, AI, crons

Evidence note: most sources were reached through search summaries; primary texts (AEPD PDFs, AI Act OJ text, final EDPB guideline) were not all opened. Items marked [verify] need a primary check. Not legal advice.

## 1. Scope
Covers the public landing and its email-first magic-link CTA, the waitlist and "founding 100" offer, store-listing readiness, and the Insights admin area: access levels, "view as", the Usuarios directory and CSV export, product analytics, the Gemini chat, the digest cron and imports. Auth mechanics (OTP, guest claim) belong to `auth-identity.md`; offline and Capacitor behaviour to `offline-native.md`.

## 2. Principles

1. **One field, one promise, one confirmation state.** An email-only CTA should say what happens next ("te enviamos un enlace; no hay contraseña"), disable on submit, show a "revisa tu correo" state with the address, resend and "cambiar correo", and explain rate-limit errors in words. Extra fields and a second email box add friction; inline format/typo validation is the cheap fix. No primary Baymard/NN/g page was reachable; circulating percentages are unverified [verify]. Auth email rate limits and CAPTCHA: Supabase production checklist, https://github.com/orgs/supabase/discussions/41618 (2025).
2. **Magic links must survive email scanners.** Corporate and university scanners GET the link and burn single-use tokens; the documented mitigation is an intermediate page on your own domain with an explicit "Entrar" click that then calls the real link. Matters for labs and schools. Source: Supabase discussion #41618 (2025).
3. **Waitlist and sign-in are different consents.** Sending a login link is transactional; storing a waitlist entry and later emailing founding-100 news is a commercial relationship needing its own lawful basis and a visible statement at the form. Sources: AEPD on LSSI arts. 21-22, https://www.aepd.es/documento/e-03060-2017.pdf (2017); EDPB Guidelines 1/2024 (draft) say direct marketing is not automatically a legitimate interest and ePrivacy may require consent, https://www.morganlewis.com/blogs/sourcingatmorganlewis/2024/10/gdpr-when-can-data-controllers-rely-on-legitimate-interests-for-data-processing-new-guidelines-from-the-edpb (2024).
4. **Commercial email carries an opt-out in every message, with no hurdles.** LSSI art. 21 forbids unsolicited commercial communications except to existing customers about similar own products, and requires a valid route to object; withdrawal cannot depend on needless steps (art. 22). This applies to promotional digests and owner blasts. Source: https://www.aepd.es/es/documento/reposicion-ps-00361-2016.pdf (2016); art. 21 was amended in 2014, check the BOE text [verify].
5. **Do not promise what the offer cannot deliver.** A founding-100 offer needs a stated cap, what founders get, and what happens at 101; public counts must come from the server. (Practice inference; no primary source found.)
6. **Measure with the least data that answers the question.** AEPD's audience-measurement guide (Jan 2024) treats first-party, statistics-only measurement as potentially exempt from consent when the provider does not reuse data, users are informed, and cookie life is limited (about 13 months per summaries); third-party cross-site trackers fall outside. Server-side counting from your own DB needs no cookie. Sources: https://www.aepd.es/guias/guia-cookies-analiticas-externas.pdf (2024); https://finreg360.com/alerta/la-aepd-publica-la-guia-uso-de-cookies-para-herramientas-de-medicion-de-audiencias/ (2024). Store UTM/source on the waitlist row instead of loading a tracker.
7. **Few metrics, defined once.** Activation (first evaluation submitted), sessions run, participants per session, return rate (second session within 30 days), and cohort by signup source or event ("Chile"). Store the cohort tag at signup, not inferred later. (Founder-practice inference; no primary source.)
8. **Authorisation is deny-by-default and enforced server-side on every request.** Function-level and data-level checks at the trusted layer, least privilege, administrative interfaces documented separately. Source: OWASP ASVS 5.0 V8, https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x17-V8-Authorization.md (2025). Hiding a menu item is not a control.
9. **Env allowlists are acceptable at this size if bounded.** Pros: no table to attack, versioned with deploys. Cons: rotation needs a redeploy, no per-grant audit trail, case/whitespace mismatches, email as identity. Require normalised comparison, verified non-anonymous users only, a short list, and a log line per privileged action. Move to DB roles when grants change often or need an audit trail. (Synthesis from ASVS V8.)
10. **Impersonation is read-only, visible, attributed and limited.** Log both the acting admin and the target, show a persistent banner, limit who may impersonate and who may be impersonated (not other admins), consider notifying the user, expire sessions. Auth0 community guidance steers away from classic impersonation toward delegated short-lived sessions. Sources: https://www.ory.com/docs/guides/user-impersonation (2025); https://workos.com/blog/support-impersonation-delegated-sessions (2026); https://oneuptime.com/blog/post/2026-01-30-impersonation-implementation/markdown (2026). Read-only must be enforced at the data layer, not by hiding buttons.
11. **Directories of people expose the minimum.** Mask emails by default with a logged reveal, distinguish guests from accounts, gate CSV export to the top tier with an audit entry. An exported file is an uncontrolled copy, and emailing from it still needs a basis (P3). Source: ASVS V8 data-specific access (2025); GDPR Art. 5 minimisation [verify with EDPB].
12. **Retention is a decision.** Anonymous guest accounts, stale waitlist rows and logs need a stated period and a job that enforces it. Account deletion must remove personal data and be reachable from the app. Sources: Apple 5.1.1(v), https://developer.apple.com/news/?id=mdkbobfo (2022); Google Play, https://support.google.com/googleplay/android-developer/answer/13327111 (2023-24).
13. **AI over user data: aggregates only, cached, capped, admin-only, labelled.** Send counts and labels, never emails or free text; cache by data hash; cap requests per admin; tell users they are dealing with AI. AI Act Art. 50 became applicable 2 Aug 2026, Commission guidelines 20 Jul 2026, marking of synthetic output deferred to 2 Dec 2026 for existing systems [verify]. Source: https://www.bakerbotts.com/thought-leadership/publications/2026/september/eu-ai-act-article-50-transparency-obligations-go-live (2026). For an admin-only chat, a visible "generado por IA" label on answers and digest text is the cheap compliance.
14. **Cron endpoints fail closed, are idempotent and bounded.** Vercel documents a `CRON_SECRET` bearer check and that failed runs are not retried; so missed or doubled runs are your problem: dedupe on a (job, period) key, cap batch size, expose a last-success signal. Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs (2025). No source found on silent-stop alerting; a heartbeat row read by the admin page is the pragmatic answer [verify].
15. **Store listing needs hosted legal pages.** Privacy policy URL, support contact, a deletion path, accurate data-safety answers, screenshots matching the app. Sources: Apple and Google deletion policies above. The privacy-URL requirement itself was not re-verified [verify in App Store Connect / Play Console].

## 3. Audit checklist
1. Does the landing CTA state near the button that a sign-in link will be emailed and no password exists? (P1)
2. After submit, is there a confirmation state with the address, resend with cooldown, and change-email? (P1)
3. Are provider rate-limit and failure errors mapped to localized messages? (P1)
4. Is the magic link built so a prefetching scanner cannot consume it (intermediate page or equivalent)? (P2)
5. Is waitlist storage separate from the sign-in send, with consent or lawful-basis text at the form? (P3)
6. Does the waitlist row record source/cohort and a consent timestamp? (P3, P7)
7. Does every non-transactional email include a working unsubscribe route that is honoured before the next send? (P4)
8. Are the founding-100 cap and benefits stated, and is any count server-derived? (P5)
9. Does analytics rely on server-side DB counts or a cookieless first-party method, with no third-party tracker? (P6)
10. Are activation, return rate and participants-per-session defined in one place? (P7)
11. Does every admin page, action and API route check access on the server, deny by default? (P8)
12. Is the allowlist compared after trim/lowercase and only for verified, non-anonymous users? (P9)
13. Is every privileged action (export, view-as, grant change) logged with actor and target? (P9, P10)
14. Does "view as" refuse all writes at the server and show a persistent banner? (P10)
15. Can view-as target another admin, and does a view-as session expire? (P10)
16. Are emails masked by default in Usuarios, with guests visually distinct? (P11)
17. Is the CSV export gated to the top tier, logged, and limited to needed fields? (P11)
18. Is there a retention rule and job for anonymous users and stale waitlist entries? (P12)
19. Is there a user-reachable account-deletion path that removes personal data? (P12, P15)
20. Do AI prompts contain only aggregates, with no emails, names or free text? (P13)
21. Are AI calls cached, capped per admin, and server-only? (P13)
22. Are AI outputs labelled as AI-generated in chat and digest? (P13)
23. Does each cron reject missing or wrong bearer, including when the secret is unset? (P14)
24. Is each cron idempotent by period key and bounded in batch size? (P14)
25. Is there a recorded last-success timestamp or alert per cron? (P14)

## 4. Anti-patterns
- Implied consent: "enter email to sign in" silently also subscribes to marketing.
- Success toast with no state change, so users resubmit and burn the email rate limit.
- Admin check by email string equality on an unverified identity, or by hiding UI only.
- "View as" that reuses the target's session token and can therefore write as them.
- Unmasked full-table CSV for any allowlisted admin, left in Downloads forever.
- Sending the model raw evaluation text or emails "for better answers".
- A cron that returns 200 on error, or runs twice and double-sends the digest.
- A tracker added "just for launch" and never consent-gated.
- A hard-coded waitlist count in copy.

## 5. Native-app considerations
- Store review needs a live privacy policy URL, support contact and an account-deletion path reachable from the app (Apple 5.1.1(v); Google web-link requirement). The landing is linked from the listing, so it must carry these pages in both languages.
- Magic links open in the system browser, not the WebView; the return must land in the app via universal/app link, and the scanner-safe intermediate page must work from that handoff [verify].
- Storage-consent rules also cover a WebView; server-side counting avoids a native consent screen.
- Admin on phones: wide tables need card layout; export and view-as are better desktop-only and hidden in the shell.
- Store screenshots and founding-100 wording must match what the installed app shows.

## 6. Vocabulary
- Doble opt-in · double opt-in · confirmation click before a subscription is active.
- Baja · unsubscribe / opt-out · LSSI art. 22 right to stop commercial email.
- Interés legítimo · legitimate interest · GDPR Art. 6(1)(f) basis, needs a balancing test.
- Suplantación / ver como · impersonation / view-as · acting through another user's view.
- Lista de permitidos · allowlist · fixed list of emails granted a role.
- Mínimo privilegio · least privilege · grant only needed access.
- Enmascarar · mask · hide most of an email or identifier.
- Medición de audiencia · audience measurement · first-party statistics, AEPD-exempt under conditions.
- Cohorte · cohort · users grouped by signup time or source.
- Activación · activation · first real value (first submitted evaluation).
- Idempotente · idempotent · running twice has the effect of once.
- Latido · heartbeat · timestamp proving a job ran.
- Oferta fundadora · founding offer · limited early-access terms.

## 7. Open practice questions
- Is the waitlist email also used for product news, and on what basis do Ricardo and Kim send it (consent, LSSI customer exception, legitimate interest)?
- Should first sign-in also create a waitlist entry, or only when the user ticks it?
- Do digests carry promotion, or are they operational admin reports (then LSSI art. 21 is likely not engaged)? [verify]
- Retention periods for guest accounts and waitlist rows.
- Is a cookieless first-party counter enough for Kim's cohort questions, or is a consent-gated tool wanted?
- Is classic view-as acceptable under their privacy notice, or must users be told?

## 8. Sources
- 2026 Baker Botts, AI Act Art. 50 go-live: https://www.bakerbotts.com/thought-leadership/publications/2026/september/eu-ai-act-article-50-transparency-obligations-go-live
- 2026 WorkOS, support impersonation and delegated sessions: https://workos.com/blog/support-impersonation-delegated-sessions
- 2026 OneUptime, impersonation implementation: https://oneuptime.com/blog/post/2026-01-30-impersonation-implementation/markdown
- 2025 OWASP ASVS 5.0 V8 Authorization: https://raw.githubusercontent.com/OWASP/ASVS/v5.0.0/5.0/en/0x17-V8-Authorization.md
- 2025 Ory, user impersonation guide: https://www.ory.com/docs/guides/user-impersonation
- 2025 Vercel, manage cron jobs: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- 2025 Supabase discussion on scanner-consumed links: https://github.com/orgs/supabase/discussions/41618
- 2024 AEPD, guía cookies medición de audiencia: https://www.aepd.es/guias/guia-cookies-analiticas-externas.pdf
- 2024 Finreg360 summary of that guide: https://finreg360.com/alerta/la-aepd-publica-la-guia-uso-de-cookies-para-herramientas-de-medicion-de-audiencias/
- 2024 EDPB Guidelines 1/2024 (draft), via Morgan Lewis: https://www.morganlewis.com/blogs/sourcingatmorganlewis/2024/10/gdpr-when-can-data-controllers-rely-on-legitimate-interests-for-data-processing-new-guidelines-from-the-edpb
- 2023 Google Play account deletion policy: https://support.google.com/googleplay/android-developer/answer/13327111
- 2022 Apple, in-app account deletion: https://developer.apple.com/news/?id=mdkbobfo
- 2017 AEPD E-03060-2017 (LSSI art. 21): https://www.aepd.es/documento/e-03060-2017.pdf
- 2016 AEPD PS/00361/2016 (LSSI art. 22 withdrawal): https://www.aepd.es/es/documento/reposicion-ps-00361-2016.pdf
