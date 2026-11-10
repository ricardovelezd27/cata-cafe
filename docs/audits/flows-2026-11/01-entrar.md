# 01 · Entrar o crear cuenta

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 28–168 · **Domain briefs applied:** `auth-identity` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-auth-identity (claude-sonnet) · **Verification:** done 2026-11-06 (auth-identity verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A person arrives at `/auth/login` from the landing, an invite page, the claim banner or a group-invite email, and picks Google or an email field (`LoginForm.tsx`). The email path calls `signInWithMagicLink`, which sends one OTP link; the screen then shows "Revisa tu correo" with one button, "Usar otro correo" (`LoginForm.tsx:75-89`). The link hits `GET /auth/callback`, which verifies the `token_hash` immediately (`app/auth/callback/route.ts:42-45`) or exchanges the Google code, then redirects to a same-origin `next` (default `/es/app`). `app/[locale]/app/layout.tsx` guards the shell with `getUser()` and mounts a non-closable `WelcomeModal` until `onboardingCompleted` is true. The spec matches the code. None of its 13 requirements is implemented yet: no code entry, no resend, no `next` on guard redirects, no locale threading. The email template lives only in the Supabase dashboard; the repo has no `docs/auth/`.

## 2. Expert bar applied

- **P1/P3 link plus code, never a bare GET that consumes the token.** Checklist 1–5, 7: code entry, `token_hash` own endpoint, scanner safety, sent-state content, resend.
- **P8 announced states.** Checklist 8.
- **P9/P10 `next` validated and surviving the whole chain.** Checklist 9–12.
- **P12/P13 Google never in an embedded view.** Checklist 14, plus offline-native 22 and 31.
- **P20 locale is stored data.** Checklist 23.
- **P26 onboarding never strands a deep link.** Checklist 29.
- **Offline lens.** A cupper must never be thrown out of a live cupping by a transient failure (offline-native P8, P14).

## 3. Findings

### F-entrar-1 · Link-only login: no code, no resend, token consumed by a plain GET · severity: P1 · status: confirms-board(Código de 6 dígitos como alternativa al enlace; El enlace no se consume al abrirse; Revisa tu correo: sin dirección visible, sin reenvío ni cuenta atrás)

**Fixed in S8-06: /auth/confirm (button press consumes the token), 6-digit code entry, resend countdown, address shown.**

- **Problem** — The sent state is a sentence, a spam hint and "Usar otro correo" (`LoginForm.tsx:78-86`). There is no code field, no resend, no address shown, no countdown. The callback verifies on the first GET: `if (tokenHash && type) { … verifyOtp({ type, token_hash: tokenHash }) … }` (`route.ts:42-43`). A mail scanner (Outlook SafeLinks, school or roastery filters) that opens the URL burns the one-time token before the person clicks. They then see "El enlace ya no es válido" (`messages/es.json:55`) and a second send is scanned the same way.
- **Implication** — Trust and a blocked flow for anyone behind a scanning mail gateway; their only exit is Google. In a Capacitor shell the link opens in the system browser, not the WebView, so the session lands in the wrong container. Teachers and labs are the target users and often use institutional mail.
- **Fix** — After sending, show the address used, link-or-code wording, expiry in plain words, a "Reenviar" button with a 60 s visible countdown, and "Usar otro correo". Add one paste-friendly numeric code field that signs in through a server action and lands on the validated `next`. Make a bare GET of the link create no session: the link goes to a confirm page whose button verifies. **Acceptance:** (1) a GET with `token_hash` alone creates no session and leaves the token valid; (2) the code from the same email signs in after the link was prefetched; (3) the code field accepts a pasted code and has `inputmode=numeric`, `autocomplete=one-time-code`; (4) resend is disabled with a counting-down label for 60 s; (5) a wrong or expired code shows its own copy and keeps the field editable. **Size:** M.
- **Native** — The code is the dependable native path; the confirm page must work when opened in the system browser and the code path must complete inside the WebView.
- **Confidence** — verified-in-code; scanner behaviour and the actual template are `needs-runtime-check` (§5).
- **Kim?** — no
- **Invariant check** — none touched (auth only; the new code action follows the ActionResult contract).

### F-entrar-2 · A transient auth failure is treated as "signed out" and bounces a cupper to login · severity: P2 · status: new

**Fixed in S8-06: lib/authState.ts classifier; an unreachable auth service shows the retry panel, never login.**

- **Problem** — The shell and every page do `const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/{locale}/auth/login")` and ignore `error` (`app/[locale]/app/layout.tsx:27-30`, `app/[locale]/app/sessions/[id]/cup/page.tsx:26-29`, and 11 more pages). `proxy.ts:32-37` says that when auth is unreachable "the page's own `getUser()` decide[s]". A timeout or 5xx from the auth service on venue wifi therefore returns `user: null` and the person lands on a login form, with no `next` (F-entrar-3).
- **Implication** — Robustness during a live cupping: a flaky moment sends the cupper to an email login in the middle of the tasting and they lose their place. Drafts survive in IndexedDB, but the person does not know that.
- **Fix** — Tell "no session" apart from "could not reach the auth service". Only the first redirects. The second renders the existing retry panel (or the cached page) with a short message and automatic retry. **Acceptance:** with the auth endpoint blocked in devtools, reloading `/cup` shows a retry state and not the login page; with a genuinely missing cookie it still redirects to login; a unit test covers the classifier on the supabase error shape. **Size:** M (one helper replacing 14 call sites).
- **Native** — Same behaviour on cold start with no network inside the shell; a network error must not clear the stored session.
- **Confidence** — needs-runtime-check (block `/auth/v1/user` and reload `/cup`).
- **Kim?** — no
- **Invariant check** — none touched; authz still goes through `lib/sessionAuth.ts` after the check.

### F-entrar-3 · Signed-out deep links lose their destination · severity: P2 · status: confirms-board(Enlace profundo sin sesión pierde el destino)

**Fixed in S8-06: proxy.ts redirects signed-out /app requests to login with next; page backstops carry their own next.**

- **Problem** — 14 redirects go to `/${locale}/auth/login` without `next` (`layout.tsx:30`, `results/page.tsx:33`, `cup/page.tsx:29`, `coffees/[id]/page.tsx:63` and others). The login page and callback already honour `next`; `proxy.ts` never adds it. The board rates this P1; nothing is blocked, so P2.
- **Implication** — A cupper or teacher who opens a results, cup or group link from a chat with an expired session logs in and lands on the dashboard, then must hunt for the session. This is the normal re-entry case.
- **Fix** — One place (the proxy) redirects an unauthenticated request under `/{locale}/app` to login with `next=<path+search>` after `safeNext`; keep the page redirects as backstops. **Acceptance:** signed out, open `/app/sessions/<id>/results`, log in, land on it; an external or `//host` path is dropped; works for `en`. **Size:** S.
- **Native** — A universal-link cold start must reach the same destination after auth.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — guest scope: guests are redirected by `guestRedirect` in the same proxy; keep that branch first.

### F-entrar-4 · WelcomeModal covers deep links and the claim return, cannot be closed, and "Omitir" stamps a role · severity: P2 · status: confirms-board(El modal bloquea enlaces profundos y el regreso del reclamo)

**Fixed in S8-06: welcome dialog only on /app, never for guests, rebuilt on ResponsiveDialog with a visible close; dismissOnboarding writes only onboardingCompleted.**

- **Problem** — The layout mounts the modal on any `/app/*` route for a profile without `onboardingCompleted` (`layout.tsx:41`, `:136-141`). It is `fixed inset-0 z-50` with no close control (`WelcomeModal.tsx:95`). Step 2 requires name, role and country (`:197`). The only shortcut, "Omitir introducción", saves role `enthusiast` the user never chose (`:71-75`). A new invitee who logs in by email from `/join/<token>` therefore lands on the waiting room or cup page under the modal. A guest who claims an account returns to results under it.
- **Implication** — Wrong behaviour at the start of a cupping, and wrong data: Q-graders who skip are recorded as "Aficionado/a", which feeds insights.
- **Fix** — Do not mount the modal on `/app/sessions/[id]/*` or on the claim return; make it a real dialog with a visible close on every step. Closing completes onboarding without writing a role. **Acceptance:** a new account arriving via invite sees the session page unobstructed; closing never sets a role; the modal appears on the next plain `/app` visit. **Size:** S–M.
- **Native** — The dialog needs a focus trap and Android back-button close.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — none touched (guest onboarding in `completeGuestOnboarding` is separate and already sets the flag).

### F-entrar-5 · English users are silently switched to Spanish, and so are their emails · severity: P2 · status: confirms-board(Idioma perdido: /es/app fijo, «Salir» a «/» y preferredLang siempre «es»)

**Fixed in S8-06: locale threaded through sign-in (preferred_lang for new accounts, default next /{locale}/app) and signOut(locale).**

- **Problem** — The default destination is hardcoded `${origin}/es/app` (`app/actions/auth.ts:42`), the callback default is `/es/app` (`route.ts:5`), and `signOut` redirects to `/` (`auth.ts:57`). No code passes `options.data.preferred_lang`, although the trigger reads it (`prisma/sql/rls_and_triggers.sql:1008-1011`), so every new profile gets `es`. Close and group emails pick the language from that column (`lib/closeEmail.ts:114-118`, `app/actions/groups.ts:285`).
- **Implication** — An English teacher who logs in without `next` sees a Spanish app, and their students' reports and invites go out in Spanish. Trust damage in the second market.
- **Fix** — Thread the page locale into both actions: default `next` `/{locale}/app`, `preferred_lang` in the sign-in options, callback derives the locale from `next`, sign-out lands on the locale's landing. **Acceptance:** from `/en/auth/login`, a new account lands on `/en/app` with `preferredLang=en`; sign-out lands on `/en`; Spanish behaviour is unchanged. **Size:** S.
- **Native** — n/a (the locale source must not depend on cookies the shell may drop).
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — none touched.

### F-entrar-6 · Unauthenticated email send is open to abuse and shares one project-wide mail quota · severity: P2 · status: new

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `signInWithMagicLink` is an exported `"use server"` action (`auth.ts:31`) with no throttle of its own; `reserveFoundingSeat` adds only a honeypot field (`waitlist.ts:23`) and calls it for any address. Abuse is limited only by Supabase's per-address window and the project-wide email cap. `getOrigin()` also builds the link host from the request's `Origin`/`Host` headers (`auth.ts:7-13`).
- **Implication** — A script can exhaust the hourly mail cap and block email login for everyone, including organisers on the morning of an event, and can mail-bomb third parties from our sender.
- **Fix** — Per-IP and per-email throttle in front of the send (and a bot check on the landing form), base URL from `NEXT_PUBLIC_SITE_URL`, and a runbook line with the configured custom-SMTP limit. **Acceptance:** 10 rapid sends from one IP are refused locally with the rate-limit copy; the link host never comes from request headers. **Size:** M.
- **Native** — A throttle must not key on a cookie alone.
- **Confidence** — needs-runtime-check (project email limit and SMTP settings in Supabase).
- **Kim?** — no
- **Invariant check** — none touched.

### F-entrar-7 · Two different `next` validators and an unvalidated build of the link · severity: P3 · status: confirms-board(next sin validar en signInWithMagicLink y signInWithGoogle)

**Fixed in S8-06: one safeNext in lib/safeNext.ts; resolveNext removed, safeNextPath delegates.**

- **Problem** — The actions concatenate `origin + next` unchecked (`auth.ts:17-19`, `:42`; `next=@evil.example` yields a userinfo host). `safeNext` (`lib/safeNext.ts:4-9`) guards the login page; `resolveNext` (`route.ts:13-22`) guards the callback with different rules. The callback does hold, so no live open redirect was found; only the Supabase allow-list backs the first hop.
- **Implication** — Security hygiene; a future template or allow-list change could expose a hop.
- **Fix** — Run `next` through one shared validator in both actions with fallback `/{locale}/app`, and add tests for `//x`, `/\x`, `@x`, encoded and absolute forms. **Acceptance:** those inputs all fall back; `route.ts` behaviour for same-origin absolute URLs is unchanged (the magic-link template relies on it). **Size:** S.
- **Native** — Custom-scheme or app-link return URLs must be allow-listed explicitly.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — none touched.

### F-entrar-8 · Google button is a dead end in in-app browsers and has no system-browser route · severity: P3 · status: new

**NOT fixed in S8-06: the in-app-browser hint is owned by S8-15 (lib/platform/inAppBrowser.ts).**

- **Problem** — `signInWithGoogle` redirects the current view (`auth.ts:22-28`); the app has no user-agent or platform detection (grep found none outside `robots.ts`). Invites travel by WhatsApp and Instagram, whose in-app browsers Google refuses (`disallowed_useragent`); the failure happens on Google's page, so our `googleError` copy never shows.
- **Implication** — Native-readiness, and a small share of web users abandon at the button.
- **Fix** — Detect known in-app browsers in one helper, replace the Google button with an "ábrelo en tu navegador" hint, keep email first. For the shell, open OAuth in the system browser and return via app link. **Acceptance:** in an Instagram/WhatsApp user agent the page shows the hint and the email form; the helper is the only place that sniffs. **Size:** S (web), L (native).
- **Native** — This is the finding itself: `skipBrowserRedirect`, Custom Tabs or SFSafariViewController, `appUrlOpen`.
- **Confidence** — inferred-from-spec (Google's behaviour is not reproducible from code).
- **Kim?** — no
- **Invariant check** — none touched.

### F-entrar-9 · Errors and states are silent or mislabeled · severity: P3 · status: confirms-board(Acceso: errores y estado «enviado» no se anuncian al lector; Cancelar en Google muestra «enlace caducado»; Límite de envío de correos)

**Fixed in S8-06: lib/authErrors.ts one map, role=alert + aria-describedby, Google cancel gets its own copy.**

- **Problem** — Error divs have no `role=alert`, the email input is not tied to the error, and focus is not moved to the sent state (`LoginForm.tsx:107`, `:143-144`). The callback collapses every failure, including a cancelled Google consent, into `error=exchange_failed` (`route.ts:54-59`). The login form maps two rate-limit forms; `reserveFoundingSeat` maps only one (`waitlist.ts:49`).
- **Implication** — Screen-reader users get no feedback; people who cancel Google read "el enlace ya no es válido".
- **Fix** — `role=alert` and `aria-describedby`, focus to the sent heading, forward Supabase's `error_code` and show cancel, invalid-address, expired and wait copy from one shared map. **Acceptance:** each error is announced once; cancel shows neutral copy; both forms share the map. **Size:** S.
- **Native** — TalkBack/VoiceOver check inside the shell.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — ActionResult contract: `signInWithMagicLink` returns a plain object; fold it into `ActionResult` when touched.

### F-entrar-10 · No way out when the mailbox is lost, and the email template is not versioned · severity: P3 · status: confirms-board(Sin acceso al correo (buzón perdido o cambiado); Versionar las plantillas de correo de Supabase en el repo)

**Partly fixed in S8-06: support link on the login screen and sent state, templates versioned in docs/auth/email-templates/. Lost-mailbox recovery is not built.**

- **Problem** — Login offers no contact or recovery line (`login/page.tsx:34-69`); the only mailto is on the landing footer (`LandingFooter.tsx:33-35`). The redirect allow-list is documented (`docs/LAUNCH-RUNBOOK.md:236`); the Magic Link template that makes the callback work is not in the repo.
- **Implication** — A teacher whose school address vanished has no path; a dashboard edit can silently break login.
- **Fix** — Support link in the idle, sent and failed states; a runbook section with the manual re-point; the template text stored in the repo. **Acceptance:** link visible in all three states in es and en; repo template equals production once. **Size:** S.
- **Native** — The support link opens the mail app.
- **Confidence** — verified-in-code.
- **Kim?** — no
- **Invariant check** — none touched.

## 4. Keep — works well

- Callback `resolveNext` rejects every other origin, falls back safely and preserves `next` and `intent=claim` on failure (`app/auth/callback/route.ts:13-22,54-59`).
- Stateless `token_hash` verification for email, so a different browser works (`route.ts:42-45`); `/auth/*` is never cached by the service worker (`public/sw.js:85`) and the callback is outside the proxy matcher (`proxy.ts:88`).
- The login page skips the form only for a registered user with a safe `next`; guests still reach the claim login (`app/[locale]/auth/login/page.tsx:21-28`).
- The claim page never merges on GET (`app/[locale]/auth/claim/page.tsx`).
- `SignOutButton` clears device caches before server sign-out (`components/layout/SignOutButton.tsx:29-35`).
- Anonymous-safe profile trigger and `completeGuestOnboarding` (`prisma/sql/rls_and_triggers.sql:1004-1017`, `app/actions/community.ts:301-312`).
- No account enumeration: one outward response whether or not the email exists.

## 5. Not verified

- Real Magic Link template and subject: view in Supabase Dashboard, Authentication, Email Templates.
- Scanner prefetch effect: send a link to an Outlook/SafeLinks mailbox and watch for a consumed token.
- Auth-unreachable behaviour (F-entrar-2): block `/auth/v1/user` in devtools while on `/cup`.
- Project email cap and custom SMTP (F-entrar-6): Supabase Dashboard, Auth, Rate limits.
- Whether `/es/app` redirects to `/app` and resets the locale cookie to `es`: log in from `/en/auth/login` on a preview.
- Session lifetime on lab tablets (P22): not decided in code or runbook; ask Ricardo.
- Google inside WhatsApp/Instagram browsers: test on a phone.

## 6. Questions for Kim (collected)

None. Every open question here is engineering or product policy (lost-mailbox policy, session lifetime on lab tablets), not cupping practice.

## 7. Verification log

F-entrar-1 — PLAUSIBLE — `route.ts:42-43` verifies the token on a bare GET and the login form has no code/resend (`LoginForm.tsx:78-86`), so a prefetching scanner would burn it. Whether scanners do, and what the Supabase template links to, is not in the repo; settle with a mail-gateway test. — severity: → P2 (unproven runtime effect; Google is an exit; same defect is rated P2 as F-landing-3). Duplicate of F-landing-3 (18-landing.md); this file should own it.
F-entrar-2 — PLAUSIBLE — Code is as described: 14 page/layout redirects ignore `error` from `getUser()`. But `getUser()` runs on the Vercel server, not on venue wifi, so only a Supabase auth outage or timeout triggers it; a cupper who is offline is served from the SW cache. Settle by blocking `/auth/v1/user` server-side. — severity: → P3 (rare, and the "venue wifi" premise is wrong).
F-entrar-3 — CONFIRMED — 14 redirects omit `next` (`layout.tsx:30`, `cup/page.tsx:29`, `results/page.tsx:33`); `proxy.ts` never adds it; the login page honours `next` (`login/page.tsx:15-21`). — severity: keep.
F-entrar-4 — CONFIRMED — `layout.tsx` mounts `OnboardingWrapper` on every `/app/*` route when `!onboardingCompleted`; the modal is `fixed inset-0 z-50` with no close control (`WelcomeModal.tsx:97`); `handleSkip` writes `role || "enthusiast"` (`:71-75`). — severity: keep.
F-entrar-5 — CONFIRMED — `auth.ts:42` default `/es/app`, `route.ts:5` default, `auth.ts:57` `redirect("/")`; no `preferred_lang` is set anywhere in `app/`, `lib/`, `components/`, so the trigger default `'es'` applies (`rls_and_triggers.sql:1012`). — severity: keep. Overlaps F-cuenta-4 (same root, preferred_lang never captured); this file owns the capture at sign-in, 02-cuenta owns the profile-field UX.
F-entrar-6 — PLAUSIBLE — `signInWithMagicLink` has no local throttle and `reserveFoundingSeat` only a honeypot (`waitlist.ts:23`); `getOrigin()` trusts the `Origin` header (`auth.ts:7-13`), though Supabase's redirect allowlist limits the host abuse. The mail cap and SMTP limit live in Supabase; settle by reading the dashboard. — severity: keep. Overlaps F-landing-2 (18-landing.md, public form side); this file owns the action-level throttle.
No CLAUDE.md invariant is bent by the proposed fixes (F-entrar-3 already says the `guestRedirect` branch stays first).
