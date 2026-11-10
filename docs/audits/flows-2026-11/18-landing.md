# 18 · Landing

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1626–1690 · **Domain briefs applied:** `growth-admin` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-growth-admin (claude-sonnet) · **Verification:** done 2026-11-06 (growth-admin verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A visitor reads the dark marketing page (`app/[locale]/page.tsx`) and types an email into one of two identical `WaitlistForm`s (hero card, founding section). `reserveFoundingSeat` (`app/actions/waitlist.ts:19`) drops bots through a honeypot, validates the address, inserts a `waitlist_entries` row (errors other than a duplicate are logged and ignored, `:33-40`), then calls `signInWithMagicLink(fd, "/app" | "/en/app")` (`:45`). On success the form is replaced by "Plaza reservada" (`WaitlistForm.tsx:53-60`). The flow only completes when the person opens the emailed link, which `/auth/callback` verifies (`app/auth/callback/route.ts:42-44`) before redirecting to `/app`. "Empieza gratis" and the final CTA go to `login?next=/app`; the header and footer "Iniciar sesión" go to login with no `next`. The spec matches the code, except that its `messages/es.json` line numbers (1104/1119) have drifted: the strings are now at 1118 and 1133.

## 2. Expert bar applied

- **P1 One field, one promise, one confirmation state.** Is "no password, link by email" stated near the button? After submit: address shown, resend, change email, localized errors?
- **P2 Magic links must survive email scanners.** Can a prefetching scanner burn the token?
- **P3/P4 Waitlist and sign-in are different consents; commercial email needs a basis and an opt-out.** Is there a notice at the form, a consent record, a way out?
- **P5 Do not promise what the offer cannot deliver.** Is the cap of 100 real, stated and server-derived?
- **P6/P7 Least data, cohort stored at signup.** Is source/cohort captured on the row?
- **P12/P15 Retention and store-listing pages.** Do entries expire; do privacy and terms exist as pages?

## 3. Findings

### F-landing-1 · No privacy notice, no policy pages, no consent record on an email-collecting form · severity: P1 · status: confirms-board(Se recogen correos sin aviso de privacidad ni página de política)

- **Problem** — The form stores the email in a table (`app/actions/waitlist.ts:34`, model at `prisma/schema.prisma:449-458` (line corrected in verification): `email`, `plan`, `locale`, `source`, `createdAt`) and the page copy then promises future contact: "Simplemente te avisaremos cuando se agoten las plazas fundadoras" (`messages/es.json:1126`, rendered under both forms). Neither form links to any policy. The footer's "Privacidad" and "Términos" are `mailto:` links (`components/landing/LandingFooter.tsx:38,41`); no privacy or terms route exists under `app/`. The row has no consent timestamp and nothing deletes it (no retention job; no account-deletion path was found in `app/` or `lib/`, and `mergeGuestData` does not touch the table).
- **Implication** — Trust and legal exposure: a stored email plus a stated promise to email later is a commercial relationship with no visible basis or opt-out (growth-admin P3/P4). It also blocks store submission, which needs a live privacy URL and a deletion path (P15). Every day the form is live adds rows with no retention rule.
- **Fix** — Publish privacy and terms pages (es/en) and link them from the footer, both forms and the login page. Show one line under each form: who stores the email, why (account link plus founding-cohort news), link to the policy. Store a consent timestamp. Decide whether the "te avisaremos" mail is consent-based; if yes, add a tick or reword it as a one-off notice with a baja link. Define retention (for example 12 months for entries with no account) and delete a person's entry when their account is deleted. **Acceptance:** footer links resolve to pages in both locales; the notice is visible without scrolling on a 375 px phone under both forms; a row records when the notice was shown/accepted; deleting an account removes its row; a stale-entry job exists or the retention decision is written down. **Size:** M (legal wording is Ricardo's; the row change is S).
- **Native** — The policy must be reachable from inside the shell as an in-app link, and an in-app account-deletion entry point must exist (store rule). Opening the policy must not drop a signed-in session.
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — none touched.

### F-landing-2 · Public endpoint can burn the project's email quota and fill the waitlist with other people's addresses · severity: P2 · status: confirms-board(Un bot puede agotar el cupo de correos de acceso de todo el proyecto)

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — The only guard is the honeypot (`waitlist.ts:23`, "field not empty"), which a script that posts only `email` passes. There is no per-IP or per-email throttle and no challenge. Order matters: the row is inserted first (`:34`), then the magic link is sent (`:45`), so every typed address is stored and mailed. `signInWithMagicLink` (`app/actions/auth.ts:31`) is itself an exported server action, so the login path is open the same way.
- **Implication** — Robustness and trust: a loop exhausts Supabase's shared email-send limit and blocks real sign-ins (cuppers, guests claiming results, an event with ~50 people). It also lets anyone put a third party's address on a "founding" list and send them a login email, creating an account for them with no verification (`signInWithOtp` creates users by default).
- **Fix** — Add a challenge (for example Turnstile) or a throttle per IP and per email on both the waitlist action and the login action, and run the waitlist insert only after the check passes. Throttled users get the existing localized "demasiados intentos" message. **Acceptance:** 50 scripted posts from one IP in one minute send at most a handful of emails; a normal visitor still gets the link on the first try; the honeypot is not the only protection. **Size:** M.
- **Native** — The challenge must work in a WebView (some CAPTCHA widgets do not); prefer an invisible or server-side throttle for the shell.
- **Confidence** — verified-in-code (no throttle exists); needs-runtime-check for the real Supabase limit in production.
- **Kim?** — no
- **Invariant check** — Server Action contract: this action returns its own state union rather than `ActionResult`, which is acceptable with `useActionState`; a new throttle should be a new state code with copy in `messages/*.json`.

### F-landing-3 · Magic link is consumed by the first GET, so a mail scanner can burn it · severity: P2 · status: new

**Fixed in S8-06: same /auth/confirm change as F-entrar-1.**

- **Problem** — The email link goes straight to `/auth/callback?token_hash=…`, and the route verifies the token on the GET itself (`app/auth/callback/route.ts:42-44`, `supabase.auth.verifyOtp`). There is no intermediate page that needs a human click. The stateless token-hash flow is deliberate (comment at `app/actions/auth.ts:37-41`: works across browsers and in-app webviews), but any prefetch (corporate or university scanner, link preview) uses the single-use token.
- **Implication** — Blocked flow for exactly the target users: labs, schools and companies with mail scanners. The visitor lands on the login page with "El enlace no funcionó" (`app/[locale]/auth/login/page.tsx:45`) right after being told "Plaza reservada", and must start again.
- **Fix** — Make the email link open a page on our domain with an "Entrar" button; the button performs `verifyOtp`. Keep the stateless token-hash approach. On failure, offer "pedir otro enlace" with the email prefilled. **Acceptance:** a plain GET of the link (curl) does not consume the token; clicking the button signs in and lands on `next`; opening the link in a second browser still works; the failure screen offers a one-tap resend. **Size:** M.
- **Native** — The universal/app link must open the intermediate page in the system browser and the button must hand the session to the app; check on a real device.
- **Confidence** — verified-in-code for the GET-consumes behaviour; needs-runtime-check to see whether real scanners hit users (count `exchange_failed` redirects in logs).
- **Kim?** — no
- **Invariant check** — none touched (the guest-claim `next=/auth/claim?token=` must keep working through the same page).

### F-landing-4 · After "Plaza reservada" the visitor is stuck: no address shown, no resend, no change-email · severity: P2 · status: new

**Fixed in S8-06: the founding-seat form shows the address, the code field and a resend (EmailSentState).**

- **Problem** — On success the form is replaced by a static panel (`components/landing/WaitlistForm.tsx:53-60`). It does not show the address the link went to and offers no resend or typo fix; the only way back is a page reload. The hint says "pide otro enlace en unos minutos" (`messages/es.json:1134`) but gives no control to do so. The login form, by contrast, has a "cambiar correo" button and hint (`app/[locale]/auth/login/LoginForm.tsx:75-89`). The headline "Plaza reservada" also shows even when the waitlist insert failed silently (`waitlist.ts:39`).
- **Implication** — Typos (common on phones) look like success: the person waits for a mail that never comes, believing a seat is held. Repeated reloads then hit the rate limit.
- **Fix** — On success show the address ("Enviado a ana@…"), a "Cambiar correo" action that restores the input with the value kept, and "Reenviar" with a visible 60 s cooldown. Reword the headline so it does not promise a seat that is not enforced (see F-landing-5). **Acceptance:** the panel names the address; change-email restores the input; resend is disabled during cooldown and then works; the same on `/en`. **Size:** S.
- **Native** — Keep the keyboard from covering the input after returning to the field (viewport resize in the WebView).
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — none touched.

### F-landing-5 · "100 plazas" is fixed text; the 101st person gets the same "Plaza reservada" · severity: P3 · status: confirms-board(«Plaza reservada» sin control del cupo de 100)

- **Problem** — `heroCount` is the literal "100" (`messages/es.json:1118`, shown at `components/landing/HeroFoundingCard.tsx:38`) and `offer` repeats "primeros 100" (`components/landing/FoundingSection.tsx:54`). `reserveFoundingSeat` never counts rows (`waitlist.ts:34` is a bare `create`), and nothing implements the promise to warn "cuando se agoten" (`es.json:1126`).
- **Implication** — Trust: the scarcity claim cannot be honoured or corrected, and "Plaza reservada" is a promise to someone who may be 300th. Low frequency now; matters once the page is shared at an event.
- **Fix** — Take the board's default: reword success to "Te enviamos el enlace; quedas en la lista fundadora" and derive the number from one shared constant. Enforcing the cap is Ricardo's product decision. **Acceptance:** one named constant feeds both copy and action; a duplicate email never takes a second place; the link is sent in every case. **Size:** S.
- **Native** — Store screenshots and wording must match this copy.
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — none touched.

### F-landing-6 · Waitlist row carries no cohort, source or consent data, and the founding-section form hides its promise · severity: P3 · status: new

- **Problem** — `source` defaults to "landing" and `reserveFoundingSeat` never sets it (`waitlist.ts:34`), so the hero card and the founding section are indistinguishable and an event cohort (for example the Chile tasting) cannot be recorded; `plan` defaults to "pro" for everyone (`prisma/schema.prisma:447`). Separately, "Sin tarjeta. Sin contraseña. Solo tu correo." sits only under the hero card (`HeroFoundingCard.tsx:55`); the founding-section form has no such line near its button (`FoundingSection.tsx:59-64`).
- **Implication** — Growth: cohort questions cannot be answered later, and the second form asks for an email without saying what happens next.
- **Fix** — Pass `source` (hero | founding | a campaign tag from the URL) into the row and repeat the one-line promise under both forms. Cookieless: store the tag on the row, no tracker. **Acceptance:** rows from each form differ in `source`; a `?src=chile` visit is stored; both forms show the promise line. **Size:** S.
- **Native** — n/a
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — none touched.

### F-landing-7 · Rate-limit mapping on the landing is narrower than on the login · severity: P3 · status: new

**Fixed in S8-06: landing and login share lib/authErrors.ts and the sendMagicLink result.**

- **Problem** — The landing maps only `over_email_send_rate_limit` to the friendly message (`waitlist.ts:49`); every other failure shows "No pudimos enviar el enlace. Verifica el correo…" (`messages/es.json:1136`). The login form also accepts any message containing "rate limit" (`LoginForm.tsx:54-56`).
- **Implication** — A visitor throttled by a different limit is told their email is wrong and retries, making it worse.
- **Fix** — Share one error-mapping helper between landing and login. **Acceptance:** both forms show the wait message for every rate-limit code. **Size:** S.
- **Native** — n/a
- **Confidence** — inferred-from-spec for the exact provider code names; needs-runtime-check by forcing a limit on staging.
- **Kim?** — no
- **Invariant check** — none touched.

## 4. Keep — works well

- Honeypot silent success, and the waitlist write never blocking the sign-in (`app/actions/waitlist.ts:23,33-40`); duplicate email tolerated (P2002), so repeats are idempotent for the row.
- Magic link uses the stateless token-hash and `next` is guarded against open redirects (`app/auth/callback/route.ts:13-22`, `lib/safeNext.ts`).
- Login skips the form for registered users but keeps it for guests so claim flows still work (`app/[locale]/auth/login/page.tsx:18-28`).
- Single-field form with submitting state, disabled button, `role="status"`/`role="alert"` and localized errors (`components/landing/WaitlistForm.tsx`).
- `waitlist_entries` has RLS enabled with no policies, closing the anon REST surface (`prisma/sql/rls_and_triggers.sql:693`).
- Canvas governor, kill-switch and idle arming, so the page does not fight the hero paint (`components/landing/journey/ConstellationMount.tsx`, `ConstellationCanvas.tsx`).

## 5. Not verified

- Whether production Supabase email templates use `token_hash` as the callback expects, and the real hourly email limit: check the Supabase dashboard (Authentication, rate limits) or send several links in a row on staging.
- Whether `getOrigin()` trusting the `Origin` header (`app/actions/auth.ts:9-12`) lets a crafted request build `emailRedirectTo` for another host; the Supabase redirect allow-list should reject it: test with a foreign Origin on staging.
- Landing behaviour in the installed PWA and a Capacitor shell (service worker serves pages network-first): run on a device.
- Whether any scanner has burned real links: count `exchange_failed` redirects in Vercel logs.
- A signed-in visitor on `/`: `page.tsx` does not redirect, only the header CTA bounces; visual check on the live page.
- Legal wording (LSSI, GDPR) is not legal advice and was not reviewed by counsel.

## 6. Questions for Kim (collected)

None. No cupping-practice question arose from this flow.

## 7. Verification log

- F-landing-1 — CONFIRMED — `waitlist.ts:34` stores email; footer privacy/terms are `mailto:` (`LandingFooter.tsx:38,41`); no privacy/terms/legal route under `app/`; no account-deletion action found (grep). Model is at `schema.prisma:449-458` (line corrected in verification). Legal/store blocker rather than a code defect; Ricardo owns wording. — severity: keep
- F-landing-2 — CONFIRMED — Only guard is the honeypot (`waitlist.ts:23`); insert precedes send; no throttle in `auth.ts` or `proxy.ts`. Supabase's own per-email/project limits still apply, so exhaustion needs distinct addresses; real limit unchecked. — severity: keep
- F-landing-3 — PLAUSIBLE — GET consumes the token (`auth/callback/route.ts:42-44`): verified. Impact depends on the Supabase email template and whether recipients' scanners prefetch links; count `exchange_failed` redirects in logs to settle. — severity: keep
- F-landing-4 — CONFIRMED — Success panel is static (`WaitlistForm.tsx:53-60`), no address/resend; login has "cambiar correo" (`LoginForm.tsx:75-89`). Friction (reload recovers), no loss or blocked flow. — severity: → P3

