# 02 · Cuenta: perfil, idioma, cambiar de cuenta, salir

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 169–265 · **Domain briefs applied:** `auth-identity` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-auth-identity (Sonnet) · **Verification:** done 2026-11-06 (auth-identity verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A registered user or QR guest opens `/app/profile` (page; "Cuenta" card at `app/[locale]/app/profile/page.tsx:392-425`), edits name/role/country/language/bio through `ProfileForm` → `updateProfile`, switches the interface language with the ES/EN link (Sidebar lg+, TopBar mobile), or leaves with "Cambiar de cuenta" / "Salir" (`SignOutButton`). Both buttons wipe the `cata-pages-*`/`cata-rsc-*` caches, the last-user pointer and the warm-up seen-set (`lib/offline/deviceState.ts:53-81`), keep user-keyed drafts, then call a server action that runs `supabase.auth.signOut()`. The email is plain text; there is no email change, deletion or export. The spec matches the code. Two board claims need sharpening: the language-link bug is real (F-cuenta-3), and the `email_change` OTP type already passes through `/auth/callback` today (F-cuenta-5).

## 2. Expert bar applied

- **P21 complete sign-out on shared devices** (checklist 24; offline 18): server session ended, caches and pointers cleared, correct locale on exit.
- **P24/P25 in-app deletion for every account type, server-side, with an owned-vs-shared rule** (27, 28).
- **P14 a guest is a fragile account** (15): the loss is said at the moment of loss.
- **P20 locale is stored data** (23): captured at sign-up, used for out-of-request mail and the sign-out redirect.
- **P23 email change re-verifies the new address; lost-mailbox path stated** (26).
- **P8 labels tied to fields, status announced**, plus the ActionResult contract.
- Lenses: offline (no silent loss of unsynced work; sign-out must work or say why when offline); cupping (a lab tablet is shared, an organizer may run two devices).

## 3. Findings

### F-cuenta-1 · No way to delete the account, and the data model cannot do it today · severity: P1 · status: confirms-board(No se puede eliminar la cuenta)

- **Problem** — The "Cuenta" card holds only the identity line and two buttons (`page.tsx:394-425`); no deletion or export action exists (a search for `deleteUser` finds only `lib/guestClaim.ts:331`, the best-effort cleanup of a merged guest). `lib/supabase/admin.ts` exists, so the mechanism is available. The schema blocks a naive delete: `Coffee.creator`, `CoffeeInvite.creator`, `CuppingSession.createdByUser`, `Evaluation.cupper`, `PhysicalEvaluation.evaluator`, `ExtrinsicData.revealedByUser` and `SessionInvite.creator` are relations to `Profile` with no `onDelete`, so restrict by default (`prisma/schema.prisma:53,118,136,212,249,264,366`), while others cascade (`:101,:275,:311,:379,:467,:489`) and `UserCoffeeHistory` sets null.
- **Implication** — Store-readiness blocker (Apple 5.1.1(v), Google Play) and an erasure-request exposure. A careless fix hits restrict errors, or cascades away an organizer's session and with it other cuppers' evaluations and community scores. Guests are covered by the same rule; today they can only leave by being orphaned.
- **Fix** — Write the owned-versus-shared rule first, then one `deleteAccount` action (`run()` → `ActionResult`) behind a typed confirmation. Shared or closed sessions, coffees and groups that others rely on are anonymized (the coffee soft-delete pattern already exists); personal rows (own evaluations, history snapshots, notes) are erased; then the auth user is removed with the admin client and device state is cleared. **Acceptance:** a test lists every `Profile` relation and fails on an unhandled one (same checklist as `mergeGuestData`); other participants' results of a deleted organizer's closed session still render; the same email can sign up afterwards; a guest sees the control; no row keeps the user's name or email. **Size:** L.
- **Native** — In-app, no bounce to a browser; after deletion also clear IndexedDB drafts and SW caches for that user (not only the pointers); must work from inside the WebView.
- **Confidence** — verified-in-code.
- **Kim?** — yes: K-cuenta-1.
- **Invariant check** — closed = read-only (deletion is a new sanctioned write and must be added to `docs/flows.md` §1); "delete keeps history" and coffee anonymize-not-delete stay intact; the participant-tier anonymity invariant must hold for anonymized names.

### F-cuenta-2 · "Salir" ends the session on every device, and lands English users on the Spanish landing · severity: P2 · status: new

- **Problem** — `signOut()` calls `supabase.auth.signOut()` with no options (`app/actions/auth.ts:56` (line corrected in verification)). In the installed auth-js the default is `scope: 'global'` (`GoTrueClient.ts:3720`), which revokes the user's refresh tokens on all devices, not only this one. `switchAccount` does the same (`:66`). `signOut` then does `redirect("/")` (`:57`), ignoring the user's locale, although `switchAccount` receives one.
- **Implication** — An organizer who signs out of a shared lab tablet also kills the session on the laptop where she runs the master panel; that device is bounced to login at its next token refresh, mid-cupping, with drafts waiting. English users land on a Spanish page. Robustness, trust.
- **Fix** — "Salir" and "Cambiar de cuenta" end only this device's session; an explicit "cerrar en todos los dispositivos" may live in the Cuenta card. Sign-out redirects to the landing in the current locale. **Acceptance:** sign out on device A, device B stays signed in after a token refresh; from `/en/app/profile`, Salir lands on `/en`; global sign-out, if offered, ends B. **Size:** S.
- **Native** — The WebView session storage must be cleared locally even if the network call fails; the redirect target must resolve inside the shell.
- **Confidence** — needs-runtime-check (two browsers, one account; the library default is verified in source).
- **Kim?** — yes: K-cuenta-2.
- **Invariant check** — none touched.

### F-cuenta-3 · The ES/EN link does nothing from Spanish routes · severity: P2 · status: confirms-board(El selector de idioma no funciona desde rutas en español)

- **Problem** — `otherPath = pathname.replace(`/${locale}/`, `/${otherLocale}/`)` in `components/layout/Sidebar.tsx:22` and `components/layout/TopBar.tsx:16`. With `localePrefix: "as-needed"` (`i18n/routing.ts:7`) the Spanish URL is `/app/profile` and contains no `/es/`, so the link points at the current page; from `/en/...` it works. Query and hash are dropped. The repo already has the right helper (`stripLocale`, `lib/guestScope.ts:23`).
- **Implication** — The default-locale majority cannot reach English from the shell; a visible control looks broken. Trust, friction.
- **Fix** — Build the target from the locale-stripped path, keep search and hash, prefix `/en` for English only. **Acceptance:** `/app/profile` → EN opens `/en/app/profile`; `/en/app/profile` → ES opens `/app/profile`; a `?gate=1` query survives. **Size:** S.
- **Native** — Use router navigation, not a full reload, so the shell keeps its state.
- **Confidence** — verified-in-code (not click-tested).
- **Kim?** — no.
- **Invariant check** — none touched.

### F-cuenta-4 · "Idioma preferido" is never captured at sign-up and does not change the interface · severity: P2 · status: new (extends board "«Idioma preferido» no cambia la interfaz")

- **Problem** — The board says the initial value comes from the signup locale. It does not: nothing writes `preferred_lang` into auth metadata (no match in `app/`, `lib/`, `components/`; `signInWithOtp` sends only `emailRedirectTo`, `app/actions/auth.ts:45-48` (line corrected in verification)), so `handle_new_user` always falls back to `'es'` (`prisma/sql/rls_and_triggers.sql:73`). Group emails and invitations read that column (`app/actions/groups.ts:285,450,538,704`). The profile field (`ProfileForm.tsx:120-133`) reads as the interface language, but saving only revalidates `/${preferredLang}/app/profile` (`app/actions/profile.ts:119`) and the UI stays put.
- **Implication** — Every English-speaking user receives Spanish group emails until they find and set the field, and then sees no effect, so they think it failed. Trust.
- **Fix** — Capture the locale of the sign-up page into the account (auth metadata or first profile write) and use it as the default; relabel the field "Idioma de los correos" or make the save navigate to that locale's profile. **Acceptance:** a new user who signs up from `/en` gets `preferredLang = en`; saving a different value either moves the user to that locale or the label says it only affects emails. **Size:** S–M.
- **Native** — Locale comes from the stored profile, not `navigator.language`, so emails and shell agree.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-cuenta-5 · Changing mailbox means a new account and lost history · severity: P2 · status: confirms-board(No se puede cambiar el correo)

- **Problem** — The email is plain text (`page.tsx:116,395`). `/auth/callback` already forwards any `type` to `verifyOtp` (`app/auth/callback/route.ts:34,43`), so an `email_change` confirmation would be accepted, but no action calls `updateUser({ email })`.
- **Implication** — A school or lab address that disappears strands years of tastings; the only recourse is a second account. Data loss in practice, and the lost-mailbox policy is undefined.
- **Fix** — Registered users request a change from Cuenta; the new address is confirmed by link or code, the card shows the pending address, magic links keep going to the old one until confirmation, an address already in use returns a localized error; document the lost-mailbox path. **Acceptance:** as the board lists, plus the confirmation returns to `/app/profile` and no second `Profile` row appears. **Size:** M.
- **Native** — The confirmation link opens in the mail app's browser; offer the code path as well.
- **Confidence** — verified-in-code for the gap; needs-runtime-check for the Supabase `email_change` template and redirect allowlist.
- **Kim?** — yes: K-cuenta-3.
- **Invariant check** — none touched.

### F-cuenta-6 · Guests and users with unsynced drafts leave with one tap and no warning · severity: P2 · status: confirms-board(Un invitado pierde su identidad al salir)

- **Problem** — `SignOutButton` runs `clearLocalDeviceState()` then the action with no confirmation (`components/layout/SignOutButton.tsx:29-35`). The only guest warning is a paragraph on the page (`messages/es.json:1539`), not at the button. Drafts are kept on purpose, keyed `_user_<id>` (`lib/offline/store.ts:73-74`), but an anonymous id can never sign back in, so those drafts are unreachable forever; a registered user's pending drafts are not mentioned either. In the sidebar "Salir" sits right under "Cambiar de cuenta" (`Sidebar.tsx:64-79`).
- **Implication** — A walk-up cupper loses their cupping and results with one mistap; a registered cupper may leave with unsynced scores and not know they must return. Data loss, trust.
- **Fix** — For guests, confirm with the loss stated and "Crear cuenta y guardar" beside "Salir de todos modos"; for anyone, show the count of pending drafts in that confirmation. Registered users with nothing pending keep the single tap. **Acceptance:** nothing is signed out until the user chooses; the count matches `PendingDraftsBadge`; the claim button starts the normal claim flow. **Size:** M.
- **Native** — Hardware/gesture back must dismiss the dialog without signing out.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — guest scope (the claim flow stays the only conversion path); offline store stays client-only.

### F-cuenta-7 · "Salir" offline wipes caches, then fails silently · severity: P3 · status: new

- **Problem** — `await clearLocalDeviceState()` runs first, then `await signOut()` inside `startTransition` with no try/catch (`SignOutButton.tsx:31-33`). Offline, the server action rejects and the button just re-enables.
- **Implication** — The user stays signed in, cached pages are gone, and nothing says why. Robustness on a patchy lab network.
- **Fix** — Order the work so a failed sign-out does not destroy offline pages, and show a localized "Necesitas conexión para cerrar sesión" via `useActionFeedback`. **Acceptance:** with the network off, tapping Salir shows the message and cached pages still load. **Size:** S.
- **Native** — Same behaviour with no connectivity in the shell.
- **Confidence** — needs-runtime-check (airplane mode).
- **Kim?** — no.
- **Invariant check** — ActionResult contract (wrap `signOut`); offline store stays client-only.

### F-cuenta-8 · Profile save: throws, loses the cause, labels not tied to fields · severity: P3 · status: confirms-board(updateProfile lanza en vez de devolver un resultado; Sesión caducada a mitad de uso)

- **Problem** — `updateProfile` throws and is not wrapped by `run()` (`app/actions/profile.ts:75-86`); `ProfileForm` collapses every failure to one string (`ProfileForm.tsx:73-75`). It also does not sync `display_name` to auth metadata, unlike `completeOnboarding` (`profile.ts:58-60`), so the magic-link greeting keeps the old name. Labels have no `htmlFor`/`id` (`ProfileForm.tsx:81-89`) and the status text is not a live region. The app layout sends expired sessions to login without `next` (`app/[locale]/app/layout.tsx:30`).
- **Implication** — An opaque digest in production, a stale greeting, screen-reader users cannot name the fields, and an expired session loses the page the user was on.
- **Fix** — Convert to `run("updateProfile")` + `useActionFeedback`, sync the name, associate labels, announce status, add a login link carrying `next` for `not_authenticated`. **Acceptance:** as the board lists, plus clicking a label focuses its input. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Server Action Contract (this finding is the compliance).

## 4. Keep — works well

- Cache and pointer wipe on sign-out with drafts preserved: `lib/offline/deviceState.ts`, `components/layout/SignOutButton.tsx`.
- `switchAccount` lands on login so Google's chooser appears (`prompt=select_account`): `app/actions/auth.ts:105,145-149`.
- Callback `next` validation rejects other origins and `//host`, returns path+query only: `app/auth/callback/route.ts:13-22`.
- Same profile page and nav for guests, with the claim button and the gate: `app/[locale]/app/profile/page.tsx:116,400`.
- Server-side validation of name/role/country/language/bio: `app/actions/profile.ts:88-98`.
- Guest scope enforced in `proxy.ts` and `lib/guestScope.ts`.

## 5. Not verified

- Global sign-out effect on a second device: two browsers, one account.
- Whether the Supabase `email_change` template and redirect allowlist are configured: Supabase dashboard.
- Salir with the network off: airplane mode in the browser.
- That the language link really stays on the page in Spanish: click test (code reading only).
- Profile page for a guest after a claim lands on a merged account.

## 6. Questions for Kim (collected)

- **K-cuenta-1.** Si quien organizó una cata borra su cuenta, ¿los resultados de esa cata deben seguir viéndose para quienes la catearon? Opciones: (a) sí, se conservan sin el nombre del organizador; (b) se pasan a otro participante; (c) se borran para todos.
- **K-cuenta-2.** En tus catas de laboratorio, ¿cada catador entra desde su propio teléfono o se comparte una tableta? ¿El organizador suele estar conectado en dos aparatos a la vez? Esto decide si "Salir" cierra solo este aparato o todos.
- **K-cuenta-3.** Cuando un profesor pierde su correo de la escuela o del laboratorio, ¿qué esperas que pase con su historial? Opciones: (a) puede cambiar el correo él mismo; (b) lo vinculamos a su cuenta de Google; (c) lo resolvemos a mano contigo.

## 7. Verification log

F-cuenta-1 — CONFIRMED — The Account card has only identity plus two buttons (`page.tsx:394-425`); no `deleteUser` outside `lib/guestClaim.ts:331`; the seven Profile relations cited in `schema.prisma` (53,118,136,212,249,264,366) have no `onDelete`, so they restrict. Compliance, not scoring, is the P1 basis. — severity: keep (store-submission blocker and erasure exposure; the fix bends closed = read-only, as the finding already says).
F-cuenta-2 — CONFIRMED — `signOut()` passes no options (`auth.ts:56`) and auth-js defaults to `scope: 'global'` (`GoTrueClient.ts:3720`); `redirect("/")` ignores locale (`auth.ts:57`). Cited lines `:137/:138/:147` were stale (file has 68 lines); corrected to 56/57/66. Other devices only drop at their next token refresh. — severity: → P3 (needs two devices plus a sign-out; the locale half is friction).
F-cuenta-3 — CONFIRMED — `Sidebar.tsx:22` and `TopBar.tsx:16` use `pathname.replace` over `next/navigation` `usePathname`; with `localePrefix: "as-needed"` (`i18n/routing.ts:7`) the Spanish pathname has no `/es/`, so the link is a no-op. Not click-tested. — severity: keep.
F-cuenta-4 — CONFIRMED — no `preferred_lang` is written anywhere (trigger default `es`, `rls_and_triggers.sql:73`); profile save only calls `revalidatePath` (`profile.ts:119`). `auth.ts:126-129` was stale, corrected to 45-48. — severity: keep. Overlaps F-entrar-5 (capture at sign-in belongs to 01-entrar).
F-cuenta-5 — CONFIRMED — the email is plain text (`page.tsx:395`); the only `updateUser` is the display-name call (`profile.ts:59`). Supabase email_change template and redirect allowlist unverified. — severity: keep.
F-cuenta-6 — CONFIRMED — `SignOutButton.tsx:29-35` clears device state then signs out with no confirmation; the guest note exists only as a page paragraph (`es.json:1539`); drafts are keyed `_user_<id>` (`store.ts:73-74`). — severity: keep. Duplicate (guest half) of F-guest-4 (03-invitado-qr-claim.md), which should own it; the registered-user pending-drafts half overlaps F-offline-5 (15-offline-sync.md). Fix touches guest scope and the client-only offline store as the finding states.
