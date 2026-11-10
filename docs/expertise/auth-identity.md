---
domain: auth-identity
researched: 2026-11-06
model: claude-sonnet
flows: [Entrar o crear cuenta, Cuenta, Invitado QR y reclamar cuenta]
---

# Auth and identity: expert brief

## 1. Scope
Passwordless login (email magic link or code, Google OAuth with PKCE), the `?next=` return path, first-run onboarding, account management (email, locale, sign-out, deletion), anonymous guests joined by QR, and the guest-to-account claim. Out of scope: session authorization rules (session-setup, live-collab) and offline draft storage (offline-native), except where sign-out touches them. NN/g material was not retrievable; points tagged "practitioner" rest on vendor blogs and are weaker than the rest.

## 2. Principles

**P1. Offer a code alongside the link.** In Supabase, link and OTP are one mechanism that differs only by template (`{{ .Token }}`), so shipping both is nearly free; a code survives scanners, cross-device reading and in-app browsers. [Supabase passwordless, 2026]

**P2. Verify through your own endpoint with `token_hash`.** For PKCE the template links to your `/auth/confirm` route, which calls `verifyOtp({token_hash, type})` and sets the session server-side. [Supabase passwordless, 2026]

**P3. Never let a bare GET consume a one-time token.** Scanners prefetch `ConfirmationURL`, producing "Token has expired or is invalid". Supabase's mitigations: send the `{{ .Token }}` code, or link to your own page where a button performs the verify. [Supabase email templates, 2026]

**P4. The "check your email" state shows the address used,** says link and code both work, states expiry in human words (default 1 h), offers "wrong address", and offers resend. [Supabase passwordless, 2026 for expiry; the rest practitioner]

**P5. Resend shows the cooldown.** Default is one request per 60 s; the UI needs a countdown, a disabled button, and localized copy for the rate-limit error rather than a raw message. [Supabase passwordless, 2026]

**P6. The code field is one paste-friendly input:** `type="text" inputmode="numeric" autocomplete="one-time-code" pattern="\d{6}"`, never `type=number`, never split boxes that reject a pasted code. [web.dev OTP form, 2023; WCAG 3.3.8, 2024]

**P7. Auth contains no cognitive test.** Email link is a sufficient technique; OTP must allow paste/autofill; no puzzle CAPTCHA without an alternative. [W3C SC 3.3.8, 2024]

**P8. Status and errors are announced.** "Email sent", resend-ready and errors go in an `aria-live`/`role=alert` region, errors are tied to the field (`aria-describedby`), focus moves to the new state. [WCAG 2.2 SC 4.1.3, 3.3.1, 2024]

**P9. `next` is a validated same-origin path or nothing.** Destination must not come from raw user input; allowlist parsed components, never prefix/suffix matching, reject userinfo and ambiguous forms, redirect to the validated value itself. [OWASP Unvalidated Redirects, 2025]

**P10. `next` survives the whole chain** (form, `emailRedirectTo`, OAuth `redirectTo`, callback, onboarding, claim) and is re-validated at each hop. Dropping it loses invites and QR targets. [Supabase redirect URLs, 2026; OWASP]

**P11. The Supabase redirect allowlist is exact in production;** globs only for previews; native deep-link URIs added explicitly. [Supabase redirect URLs, 2026]

**P12. Google OAuth never runs in an embedded WebView.** Google prohibits embedded user agents (`disallowed_useragent`, enforced since 2021); use the system browser and return via universal/app link. [Google OAuth policies, 2025; Google Developers Blog, 2021]

**P13. In-app browsers (Instagram, WhatsApp) are embedded views too,** so the email path must always be reachable there and the Google button should degrade to an "open in browser" hint instead of a dead error. Inference from P12.

**P14. A guest is a real, fragile account.** `signInAnonymously` gives an `authenticated` JWT with `is_anonymous`; data is lost on sign-out, cleared storage or another device, so say so and offer the claim at the moment of value (results). [Supabase anonymous, 2026]

**P15. Link when the target is new, migrate when it exists.** A new email via `updateUser`/`linkIdentity` keeps the same user id and needs no merge; an existing account means the app must reassign every row and resolve conflicts itself. [Supabase anonymous, 2026]

**P16. A merge is confirmed, authorized, transactional and idempotent.** Show a confirmation before the state change (never merge on GET), bind the claim to the caller with a signed expiring token, run one transaction covering every user FK, and tolerate a retry. [Supabase anonymous, 2026; OWASP on GET-triggered actions, 2025]

**P17. Guest creation is bounded.** CAPTCHA/Turnstile and the IP limit (default 30/h) apply; anonymous users have no email; no automatic cleanup exists, so a stale-guest job is the app's job. [Supabase anonymous, 2026]

**P18. Anonymity is enforced server-side** via the JWT `is_anonymous` claim for every gated route and action, never by a client flag; avoid static caching of per-user pages. [Supabase anonymous, 2026]

**P19. Auto-link by email only when the email is verified;** otherwise pre-account takeover is possible. [Supabase identity linking, 2026]

**P20. Locale is stored data.** Save it in `user_metadata`/profile at sign-up, expose it to templates via `{{ .Data }}`, and use it for out-of-request emails (cron, close emails) and the post-sign-out redirect. Supabase documents one template per type and no built-in localization, so a bilingual template must branch on `.Data`. [Supabase email templates, 2026]

**P21. Sign-out is complete on shared devices.** The server session row is deleted, cookies cleared, cached pages and last-user pointers removed. Refresh tokens are single-use (10 s reuse window), so a stale tab cannot resurrect the session. [Supabase sessions, 2026]

**P22. Session length is a decision.** Default sessions do not expire; an inactivity timeout or time-box exists (plan-gated, enforced at next refresh) for shared lab tablets. [Supabase sessions, 2026]

**P23. Passwordless recovery means mailbox access plus a stated fallback.** Email change re-verifies the new address; a lost mailbox needs a documented path (second linked identity such as Google, or verified manual recovery). No primary source on policy: product decision, see section 7. [Supabase identity linking, 2026 for second identity]

**P24. Account deletion is in-app, complete and open to guests.** Apple 5.1.1(v): initiate in the app, delete the account and personal data not legally retained, disclose retention, reauth/confirm allowed, no support-only flow, available to all regions, guest accounts included. [Apple, 2026]

**P25. Deletion runs server-side** with the service role (`auth.admin.deleteUser`), with an explicit rule for owned versus shared data, and revocation of Sign in with Apple tokens if that is ever offered. [Supabase deleteUser, 2026; Apple, 2026; GDPR Art. 17, 2016]

**P26. Onboarding never strands a deep link.** A first-run modal is dismissible or resumable, lands on the original `next`, and never blocks a QR guest from joining. Practitioner; derived from P10.

**P27. Responses do not enumerate accounts.** Same outward response whether or not the email exists; Supabase itself obfuscates the OAuth-then-email case. [Supabase identity linking, 2026]

## 3. Audit checklist
1. Does the login flow offer both link and code entry after sending? (P1)
2. Does the email template include `{{ .Token }}` and a `token_hash` link to an own endpoint? (P1, P2)
3. Does the confirm/callback route avoid verifying on a bare GET without a button or code fallback? (P3)
4. Does the sent state show the address, expiry, wrong-address escape and both options? (P4)
5. Does resend show a countdown tied to the 60 s limit and localize the rate-limit error? (P5)
6. Is the code input one field with `autocomplete="one-time-code"`, `inputmode="numeric"`, no `type=number`? (P6)
7. Can the code be pasted and autofilled, and is there no CAPTCHA without an alternative? (P6, P7)
8. Are sent/error/ready messages in an `aria-live` or `role=alert` region, associated with the field? (P8)
9. Is there one shared `next` validator used by login action, callback and claim, accepting only same-origin paths? (P9)
10. Does it reject `//host`, `/\host`, absolute and `javascript:` URLs, encoded variants, `@` userinfo and control characters? (P9)
11. Is `next` validated after decoding and the validated string itself used for the redirect? (P9)
12. Does `next` pass unchanged through email request, verify, OAuth, onboarding and claim? (P10)
13. Are production Supabase redirect URLs exact paths? (P11)
14. Does any code start Google OAuth in a WebView, and is there a fallback in in-app browsers? (P12, P13)
15. Is the anonymous data-loss warning shown to guests with a claim CTA on results? (P14)
16. Does claim use link/update for new emails and row migration for existing accounts? (P15)
17. Does the claim GET only show confirmation, with the mutation behind a POST or server action? (P16)
18. Is the merge one transaction covering every user FK, and safe to run twice? (P16)
19. Is the claim token signed, expiring and bound to the anonymous user id? (P16)
20. Is anonymous sign-in protected by CAPTCHA/rate limits, with a stale-guest cleanup defined? (P17)
21. Do gates read `is_anonymous` server-side instead of client state? (P18)
22. Is OAuth auto-link restricted to verified emails? (P19)
23. Is locale saved at sign-up and used by templates, cron/close emails and sign-out redirect? (P20)
24. Does sign-out call server `signOut`, clear cached pages and user pointers, and redirect with the current locale? (P21)
25. Is a session lifetime or inactivity policy decided and documented? (P22)
26. Is there an email-change flow with re-verification and a documented lost-mailbox path? (P23)
27. Is there an in-app "delete account" reachable by every account type including guests, with confirmation and retention disclosure? (P24)
28. Does deletion use the service role server-side and define the fate of owned versus shared data? (P25)
29. Can the onboarding modal be dismissed or resumed and still reach the original destination? (P26)
30. Do error and success responses avoid revealing whether an email has an account? (P27)

## 4. Anti-patterns
1. **Link-only login.** A scanner consumes the token; the user sees "expired" and blames the app (P1, P3).
2. **`next.startsWith("/")` as the validator.** `//evil.com` and `/\evil.com` pass, giving an open redirect on a trusted domain (P9).
3. **Merge on GET.** Prefetchers, forwarded emails or CSRF trigger an irreversible merge (P16).
4. **A forgotten FK in the merge, or per-row retry inside a transaction.** Rollback, or silently lost rows (P16).
5. **Onboarding modal that swallows `next`.** An invitee lands on the dashboard, not the cupping (P10, P26).
6. **Google button inside WhatsApp/Instagram browsers.** `disallowed_useragent`; the user abandons (P12, P13).
7. **Sign-out that only clears the cookie.** The next user on a shared tablet sees cached pages and pending state (P21).
8. **Resend with no feedback.** Repeated taps hit the rate limit and surface a raw English error (P5).
9. **Name-only guest with no loss warning.** Results vanish when storage clears (P14).
10. **"Delete" that deactivates, or says "email support".** App Store rejection and erasure-request exposure (P24, P25).

## 5. Native-app considerations
- Capacitor's WebView is an embedded user agent, so Google sign-in inside it fails (P12). Open the Supabase OAuth URL (`skipBrowserRedirect`) in the system browser (Custom Tabs on Android, SFSafariViewController on iOS) and return by an HTTPS universal/app link, handled with the `appUrlOpen` listener. Supabase supports custom schemes and universal links; universal links need Associated Domains plus an AASA file served without redirects, which Supabase does not host. [Supabase native deep linking, 2026]
- Community reports say the Capacitor Browser plugin cannot reliably intercept custom-scheme redirects and `appUrlOpen` can fire inconsistently (weak source); test on real devices. A native Google Sign-In plugin returning an ID token is the common alternative (vendor-reported).
- Magic links open in the mail app's browser, not the wrapper, unless the domain is an app link; the 6-digit code (P1) is the dependable native path. Allow clipboard paste, because `one-time-code` autofill targets SMS.
- With PKCE, the code exchange must happen where the verifier lives; a callback landing in the system browser while the verifier sits in the WebView is a classic failure. Verify cookies persist across cold starts.
- Add every deep-link URL to the Supabase allowlist (P11).
- App Store: in-app deletion including guests, no bounce to the default browser for sign-in, token revocation for Sign in with Apple if offered. [Apple, 2026] Whether offering Google triggers Apple's equivalent-login rule should be checked against current guidelines (not verified here).

## 6. Vocabulary
- Enlace mágico · magic link · one-time login URL
- Código de 6 dígitos · email OTP · numeric code typed in the app
- Invitado · guest / anonymous user · Supabase anonymous account
- Reclamar cuenta · claim · turn a guest into a real account and move its data
- Fusionar datos · merge · reassign rows from source user to target
- Vincular identidad · identity linking · attach a provider to one user
- Ruta de retorno (`next`) · return path · post-login destination
- Redirección abierta · open redirect · attacker-chosen destination
- Escáner de enlaces · link scanner/prefetcher · mail security bot that opens URLs
- Cierre de sesión · sign-out · ending the session
- Eliminar cuenta · account deletion · removal of account and personal data
- Enlace universal / de aplicación · universal/app link · HTTPS URL that opens the native app

## 7. Open practice questions
1. Is the code a first-class option or a fallback under the link text?
2. What is the lost-mailbox policy for teachers whose school address disappears (second Google identity, manual verification)?
3. What happens to a deleted user's owned sessions, coffees and groups that others rely on (anonymize, transfer, delete)?
4. Is an inactivity timeout acceptable on lab tablets, and who signs the device out?
5. At a 50-person event behind one venue IP, does the guest limit (30/h default) or CAPTCHA block walk-ups?
6. Does App Store review require Sign in with Apple once Google is offered natively?
7. How long are unclaimed guests retained?

## 8. Sources (newest first)
- Supabase, Passwordless email logins, 2026: https://supabase.com/docs/guides/auth/auth-email-passwordless
- Supabase, Email templates, 2026: https://supabase.com/docs/guides/auth/auth-email-templates
- Supabase, Anonymous sign-ins, 2026: https://supabase.com/docs/guides/auth/auth-anonymous
- Supabase, Identity linking, 2026: https://supabase.com/docs/guides/auth/auth-identity-linking
- Supabase, Redirect URLs, 2026: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase, Native mobile deep linking, 2026: https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- Supabase, Sessions, 2026: https://supabase.com/docs/guides/auth/sessions
- Supabase, auth.admin.deleteUser, 2026: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser
- Apple, Offering account deletion in your app (Guideline 5.1.1(v)), 2026: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- OWASP, Unvalidated Redirects and Forwards Cheat Sheet, 2025: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html
- Google, OAuth 2.0 policies, Use secure browsers, 2025: https://developers.google.com/identity/protocols/oauth2/policies#browsers
- W3C, Understanding SC 3.3.8 Accessible Authentication (Minimum), WCAG 2.2, 2024: https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html
- web.dev, SMS OTP form best practices, 2023: https://web.dev/articles/sms-otp-form
- Google Developers Blog, embedded WebView OAuth block, 2021 (page fetch 404; confirmed via search snippet): https://developers.googleblog.com/en/upcoming-security-changes-to-googles-oauth-2-0-authorization-endpoint-in-embedded-webviews/
- GDPR Art. 17 right to erasure, 2016 (cited from general knowledge, not fetched): https://gdpr-info.eu/art-17-gdpr/
