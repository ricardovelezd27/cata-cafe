# 03 · Invitado QR y reclamar cuenta

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 266–390 · **Domain briefs applied:** `auth-identity` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-auth-identity (claude-sonnet) · **Verification:** done 2026-11-06 (auth-identity verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A walk-up opens `/join/[token]`, types a name, and `GuestJoinForm` calls `signInAnonymously`, then `completeGuestOnboarding`, then `joinViaToken` (`components/join/GuestJoinForm.tsx:41-53`); no email is ever asked. The guest cups under an anonymous Supabase user; `proxy.ts:64-67` bounces typed gated URLs and `GuestGateLink` handles clicks. On results, `GuestSaveCta`, the profile button or the gate modal call `startGuestClaim`, which mints a 7-day HMAC token (`lib/guestClaim.ts:40-44`) and routes through the normal login with `next=/auth/claim?token=…`. `/auth/claim` shows a confirmation card and only the `confirmGuestClaim` server action calls `mergeGuestData`, which moves every user-FK row in one transaction and deletes the anonymous user (`lib/guestClaim.ts:157-336`). Spec and code agree on all of this, except that the spec's claim that the WelcomeModal "cannot be closed" is only half true (see F-guest-7).

## 2. Expert bar applied

- **P14/P15 a guest is a fragile account; link when new, migrate when existing.** Is loss warned? Is there a same-id upgrade path? (grep: no `linkIdentity` or `updateUser({email})` anywhere; `updateUser` only sets display_name.)
- **P16/P18 merge is confirmed, authorized, transactional, idempotent; anonymity enforced server-side.** Never on GET? Every user FK? Do server actions, not only the proxy, read `is_anonymous`?
- **P17 guest creation is bounded.** Rate limit at a 50-person event behind one IP; stale-guest cleanup.
- **P10/P26 `next` survives and onboarding never strands it.**
- **Lens offline-native:** are local drafts keyed to an identity that the claim destroys? **Lens cupping:** does a shared device break blind, one-cupper-one-sheet evaluation?

## 3. Findings

### F-guest-1 · Un invitado puede crear grupos, sesiones y enviar correos llamando a la acción · severity: P1 · status: confirms-board(Un invitado puede crear grupos y enviar correos llamando a la acción)

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — The only guest gate is the proxy (pages) and link components. `requireUser()` (`lib/auth.ts:4-18`) accepts anonymous users and even upserts a Profile for them. Only `createExpressSession` checks it: `if (user.is_anonymous) throw new Error("not_found_or_forbidden")` (`app/actions/sessions.ts:405`). `createGroupWithMembers` (`app/actions/groups.ts:343-353`), `sendGroupEmail` (`groups.ts:648-656`), `addMemberByEmail`, `createSession`, `createGroupSession`, `createCoffee`, `createInviteToken` and `createCoffeeInvite` have no guest check, and `proxy.ts` excludes `/api` from its matcher (line 88).
- **Implication** — Security and trust. Anonymous accounts need no email and cost one sign-in, so a script can mint accounts and send Café Sensible-branded invitations to arbitrary addresses (sender reputation, Resend quota), and a guest can own assets that the claim then has to drag along.
- **Fix** — One shared "registered users only" check in `lib/auth.ts`, applied to every action that creates or shares an asset or sends email, returning the localized not-allowed copy. **Acceptance:** with a guest session, a direct POST to each listed action fails with `not_found_or_forbidden`; registered users are unaffected; the pure predicate is unit-tested next to `guestScope`. **Size:** M.
- **Native** — n/a (server-side).
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Extends the guest-scope rule from proxy to actions; no authz rule in `lib/sessionAuth.ts` is bent.

### F-guest-2 · El aforo de invitados no está planificado: límite por IP sin paso en el runbook · severity: P1 · status: confirms-board(Capacidad de acceso anónimo para eventos grandes)

**Partly fixed in S8-07: the form reuses one anonymous user across retries and names the rate-limit error. The capacity step (raise the per-IP limit, verify with 40 sequential joins) is in runbook §16 and is for the owner.**

- **Problem** — `signInAnonymously` is a plain client call with no captcha token (`GuestJoinForm.tsx:41-43`) and any failure becomes the same "No se pudo entrar como invitado. Intenta con tu correo." (`GuestJoinForm.tsx:44-47`, copy at `messages/es.json:528`). `docs/LAUNCH-RUNBOOK.md` has no step that raises Supabase's anonymous sign-in limit (the expert brief cites 30 per hour per IP as the default); its guest check (smoke test step 11) joins one guest.
- **Implication** — Blocked flow in the exact scenario the product exists for: about 50 people on one venue Wi-Fi share an IP, so roughly the 31st guest hits the limit and is told to "use your email", the opposite of the zero-friction promise.
- **Fix** — Add a pre-event runbook step (raise the per-IP limit to at least 2× expected guests per hour, verify with two devices on one network), and give the rate-limit failure its own localized message with a retry hint. Turning on captcha is a separate decision because it touches every auth call. **Acceptance:** runbook has the step and a verification line; a simulated limit error shows a distinct message; 40 sequential guest joins from one IP succeed after the change. **Size:** S.
- **Native** — A native wrapper shares the venue IP too; captcha, if enabled, must work inside a WebView.
- **Confidence** — needs-runtime-check (join 35 anonymous sessions from one IP in staging).
- **Kim?** — yes, see K-guest-2.
- **Invariant check** — none touched.

### F-guest-3 · La unión de invitado falla con un mensaje genérico, deja usuarios anónimos huérfanos y no ve el cierre de la sesión · severity: P2 · status: confirms-board(Unión de invitado: errores genéricos y usuarios anónimos huérfanos); board rates P1, we rate P2

**Fixed in S8-07: `checkJoinable` runs before `signInAnonymously`; a closed link shows its own state with no sign-in; an existing anonymous session is reused on retry; every failure has localized copy and the rate limit its own message (`lib/joinability.ts`).**

- **Problem** — The page validates only expiry and seats (`app/[locale]/join/[token]/page.tsx:33-36`) and never the session status, so a closed session's link shows the name form. The form signs in anonymously first, then `joinViaToken` throws `session_closed` or `token_exhausted` (`app/actions/community.ts:365-368`, line corrected in verification); the catch rethrows only redirects and shows the generic error (`GuestJoinForm.tsx:54-61`). Each retry creates another anonymous auth user.
- **Implication** — Robustness and trust: a latecomer on a closed or just-filled link is told to use email with no reason, and orphans accumulate in Supabase and in the Usuarios directory. Registered members get specific copy (`components/join/JoinSessionForm.tsx:36`); guests do not.
- **Fix** — Check invite and session state before creating the anonymous user (a `run()`-wrapped check returning `ActionResult`), show a closed-session state on the page, map each code to its localized copy, and reuse an existing anonymous user on retry. **Acceptance:** closed link renders its own state with no sign-in; exhausted link names the reason; five failed retries create no extra anonymous users. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Uses the ActionResult contract; closed = read-only respected.

### F-guest-4 · Los controles que destruyen la identidad del invitado no avisan (salir, cambiar de cuenta, «Cancelar», teléfono compartido) · severity: P2 · status: confirms-board(Dispositivo compartido: el segundo invitado entra como el primero; «Cancelar» en el reclamo deja huérfanos los datos del invitado)

**Partly fixed in S8-07: the claim card trades "Cancelar" for "Usar otra cuenta" and "No vincular" (with a warning), and sign-out/switch-account warn a guest. NOT built: the "¿Eres X?" choice on `/join` for a signed-in guest (`TODO(E1-Kim)`).**

- **Problem** — `SignOutButton` clears device state then signs out with no guest check (`components/layout/SignOutButton.tsx:31-35`); the sidebar offers "Cambiar de cuenta" and "Salir" to guests identically (`components/layout/Sidebar.tsx:64-79`). The claim card's "Cancelar" is a plain link home (`app/[locale]/auth/claim/page.tsx:99-101`) after the guest cookie was already replaced by the sign-in. A signed-in anonymous visitor reopening a QR link sees only the generic join button (`join/[token]/page.tsx:99-121`), with no "enter as <name>" or "I'm not <name>".
- **Implication** — Data loss and cupping integrity. One tap loses a guest's cupping (the data notice at `messages/es.json:527` appears only on the join form). On a shared phone the second person joins as the first, sees and can overwrite that cupper's sheet, breaking one-cupper-one-sheet blind evaluation.
- **Fix** — For anonymous users, sign-out and switch-account show a loss warning with "Guardar mis resultados" as the primary action; the join page shows the current guest name with "Entrar como X" and "No soy X" (warning first if that identity has evaluations); the claim card offers "Usar otra cuenta" and "No vincular" (with warning) instead of a silent "Cancelar". **Acceptance:** a guest with evaluations cannot sign out without seeing the warning; a second guest on the same browser can start a fresh identity; cancelling a claim never leaves data unreachable without a message. **Size:** M.
- **Native** — In a Capacitor shell the session lives in the app container and shared tablets are likelier; keep the warning inside the app, not a browser `confirm`.
- **Confidence** — verified-in-code; what the replaced cookie does after sign-in is needs-runtime-check.
- **Kim?** — yes, see K-guest-1.
- **Invariant check** — none touched; `clearLocalDeviceState` keeps user-keyed drafts, which must stay.

### F-guest-5 · Borradores sin sincronizar se pierden al reclamar · severity: P2 · status: confirms-board(Borradores sin sincronizar del invitado se pierden al reclamar)

**Fixed in S8-09** (draft PR, branch `claude/s8-09-offline-impl`): the claim asks first when the guest holds unsynced work, and stores the anonymous id (`cata_claim_anon`); on the next app mount under the new account the drafts are re-keyed (`rekeyUserBlobs`) and replay there. Drafts in another browser are covered only by the pre-claim question.

- **Problem** — `useGuestClaim.start` only checks `online` (`hooks/useGuestClaim.ts:21-43`). Drafts live under `cata_session_<sid>_user_<anonId>` (`lib/offline/store.ts:73-74`) and `useOfflineSync` replays only `listUserKeys(userId)` (`hooks/useOfflineSync.ts:110-137`), so once the merge deletes the anonymous id nothing ever replays them.
- **Implication** — Data loss. A guest who cupped with weak signal sees the amber "pendiente de sincronizar" state, taps "Guarda tus resultados", and the unsynced modules are gone while the claim card reports success.
- **Fix** — Before minting the token, count pending modules for the anonymous id, trigger a sync and wait; if some stay pending, offer "Seguir y perder estos" or "Esperar". **Acceptance:** with one pending module and connectivity restored, the claim proceeds only after it syncs; with persistent failure the user is told how many sheets are at risk. **Size:** M.
- **Native** — IndexedDB in a WebView can be evicted, so syncing first matters more there.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Offline store stays client-only; replay authorization unchanged.

### F-guest-6 · Reclamar siempre fusiona y re-dispara los agregados de toda la sesión dentro de la transacción por defecto · severity: P2 · status: new

**Fixed in S8-07: the merge re-fires the trigger only for conflicted samples and sessions whose exclusion flag was merged, and the transaction has a 30 s timeout.**

- **Problem** — `mergeGuestData` opens `prisma.$transaction(async (tx) => …)` with no timeout option (`lib/guestClaim.ts:157`; Prisma's interactive default is a few seconds). For each touched session it runs `UPDATE evaluations … SET "isDraft" = e."isDraft"` over every submitted evaluation of the session, other cuppers' included (`lib/guestClaim.ts:310-319`), and the aggregate trigger fires per row. Moving `cupperId` does not change a community score; only a conflict deletion does. For a new email, the common case, no row needs merging at all (the board already lists the same-id upgrade as a to-be).
- **Implication** — Robustness at event scale: when many guests of one 50-cupper session claim around the same time, each claim rewrites every evaluation of that session, contending on the same rows and risking timeouts or deadlocks. The failure surfaces as an opaque error (see F-guest-8) with the guest still unlinked.
- **Fix** — Upgrade the anonymous user in place (`updateUser` or `linkIdentity`, same id, no merge) when the email or Google identity is new, and run the merge only when the account already exists. In the merge, refire only samples that had a conflict and set an explicit transaction timeout. **Acceptance:** 20 concurrent claims on one 50-cupper session finish without timeout; a new-email claim keeps the user id and moves no rows. **Size:** L.
- **Native** — Identity linking via OAuth must run in the system browser (Google blocks WebViews) and return by app link.
- **Confidence** — needs-runtime-check (staging: seed 50 cuppers, claim 20 guests in parallel, time each).
- **Kim?** — no.
- **Invariant check** — Aggregates stay trigger-authoritative and scoring is untouched. The same-id path must keep "never merge on GET".

### F-guest-7 · El WelcomeModal compite con el destino (resultados o cata) del recién llegado · severity: P3 · status: confirms-board(El WelcomeModal tapa los resultados recién vinculados), sharpened

**Fixed in S8-06: no welcome dialog for guests; mergeGuestData sets onboardingCompleted when the guest's name carries over.**

- **Problem** — A new account (via claim, or via login with `next=/join/<token>`) has `onboardingCompleted=false`, and the app layout renders the modal over whatever page it lands on (`app/[locale]/app/layout.tsx:41,135-140`). Step 1 has a one-tap "Omitir" that stays on the page (`components/onboarding/WelcomeModal.tsx:68-79,123-127`), contrary to the board's "cannot be closed", but finishing steps 2–3 pushes to `/app/sessions/new` or similar (`WelcomeModal.tsx:82-90`), dropping the original destination. Skipping also stamps role `enthusiast` (`WelcomeModal.tsx:72`).
- **Implication** — Friction for a latecomer to a live cupping, and a silent role guess that skews analytics for professionals.
- **Fix** — When the merge carries the guest's name into a new account, mark onboarding complete; otherwise never replace the pending destination, and leave role empty on skip. **Acceptance:** claim with a new email lands on results with no modal; finishing the modal from `/cup` stays on `/cup`. **Size:** S.
- **Native** — Modal must respect safe areas and the keyboard in a WebView.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-guest-8 · Un fallo del reclamo es opaco o mal explicado, y el token y la fusión no tienen pruebas · severity: P3 · status: confirms-board(Tabla nueva con FK de usuario sin añadir al merge), sharpened

**Fixed in S8-07: pure `lib/guestClaimToken.ts` with tamper/expiry/replay/eval-wins tests; `confirmGuestClaim` returns an ActionResult with a retry card; `lookup_failed` apart from `not_anonymous`; AiChatUsage, OutboundEmailEvent and CloseEmailDelivery handled in the merge, guarded by `tests/profileRelations.test.ts`; the card shows the evaluation count.**

- **Problem** — `confirmGuestClaim` awaits `mergeGuestData` with no try/catch (`app/actions/guestClaim.ts:70`), so an FK or timeout error reaches the boundary as a digest. Any `not_anonymous` result, including a transient admin-API lookup error (`lib/guestClaim.ts:149-152`), is reported as "ya vinculado" (`guestClaim.ts:71`). `CloseEmailDelivery.userId` and `AiChatUsage.userId` have no FK (`prisma/schema.prisma:346, 522`), so the `profile.delete` safety net cannot see them and the merge leaves them behind. `tests/` has only `guestScope.test.ts`; token sign/verify and the conflict rule `anonEvalWins` are untested.
- **Implication** — A guest whose claim fails sees a crash screen or a false "already linked" and has no retry path.
- **Fix** — Wrap in `run()`, redirect to the card with `error=failed` and log, separate "lookup failed" from "already claimed", move the token functions into a pure module with vitest cases (tamper, expiry, replay), and test the conflict rule. **Acceptance:** a forced FK error shows a retry card; forged and expired tokens are rejected in tests. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Keeps the "profile.delete rolls back on a forgotten FK" mechanism and the ActionResult contract.

### F-guest-9 · El token de reclamo es un portador de 7 días en URL y en el correo · severity: P3 · status: confirms-board(Token de reclamo: portador de 7 días en URLs)

**Documented in S8-07: the TTL stays 7 days; the risk and its mitigations (confirmation card, still-anonymous check, never a merge on GET) are written in `lib/guestClaimToken.ts` and `docs/flows.md`.**

- **Problem** — The token is bound to the anonymous id but not to the claimant; `confirmGuestClaim` needs only any registered session plus a valid token (`app/actions/guestClaim.ts:54-71`). It travels inside `emailRedirectTo` (`app/actions/auth.ts:42`), so it lands in the email body and mail logs. TTL is 7 days (`lib/guestClaim.ts:26`).
- **Implication** — A forwarded or leaked link lets another registered user absorb the guest's results; the exposure window is long for an event-day action. The confirmation card (name, session count) is the real mitigation.
- **Fix** — Add the evaluation count to the card, record the accepted risk in `docs/flows.md`, and shorten the TTL (about 72 h) once the same-id upgrade handles new emails. **Acceptance:** card shows name, sessions, evaluations; the flows doc states TTL and reason. **Size:** S.
- **Native** — A universal link must carry the token intact into the app.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

## 4. Keep — works well

- The confirmation page never merges on GET; the mutation is a server action with a double-tap guard (`app/[locale]/auth/claim/page.tsx`, `components/auth/ClaimConfirmButton.tsx`).
- HMAC token with `timingSafeEqual`, expiry, and the source re-checked as still anonymous server-side (`lib/guestClaim.ts:49-66,149-152`).
- Merge in one transaction with the `profile.delete` safety net, per-table conflict rules, and new-account name carry-over (`lib/guestClaim.ts:124-300`).
- Zero-friction join with a data-loss notice (`components/join/GuestJoinForm.tsx`, `messages/es.json:527`).
- One guest-scope predicate shared by proxy and links (`lib/guestScope.ts`, tested), and `createExpressSession` rejecting guests (`app/actions/sessions.ts:405`).
- `startGuestClaim` disabled offline and `not_anonymous` handled by refresh (`hooks/useGuestClaim.ts`).
- Sign-out clears per-user SW caches while keeping drafts (`lib/offline/deviceState.ts`).

## 5. Not verified

- Whether the Supabase anonymous-sign-in rate limit and captcha are set in production: check Dashboard, Authentication, Rate limits.
- The claim `next` carries a query string; confirm the Supabase redirect allowlist is a wildcard (`https://cafesensible.ai/**`, runbook line 236) so the token survives the magic-link hop; run one real claim on production.
- What happens to the original device's cookie and offline blobs when the claim completes in a different browser (mail-app browser): test with two browsers.
- Cross-flow (belongs to flow 01): `next` is validated three different ways, `safeNext` on the login page, `resolveNext` in the callback, and not at all in `signInWithMagicLink` (`app/actions/auth.ts:42`, raw `origin + next`); the claim chain depends on all three.
- A link scanner prefetching the callback GET (`app/auth/callback/route.ts:42-44`) could consume the one-time token before the guest clicks; test with a security-gateway mailbox.

## 6. Questions for Kim (collected)

- **K-guest-1.** En una cata con muchas personas, ¿cada catador usa su propio teléfono, o a veces comparten un teléfono o una tableta en la mesa? Si comparten, ¿prefieres que al abrir el QR la pantalla pregunte «¿Eres Pepe?» antes de entrar, o que cada persona entre siempre como alguien nuevo?
- **K-guest-2.** Para la próxima cata grande: ¿cuántas personas esperas y desde qué lugar (misma Wi-Fi)? Hay dos opciones: avisarnos con tiempo para ampliar el límite de entradas, o repartir un código corto en la sala. Además, ¿te sirve tener el correo de los asistentes al final (para enviarles resultados) o prefieres que sigan siendo anónimos hasta que decidan guardarlos?

## 7. Verification log

F-guest-1 — CONFIRMED — `requireUser()` accepts anonymous users (`lib/auth.ts:4-18`); the only action-level guest check is `sessions.ts:405` (createExpressSession); `createGroupWithMembers` (`groups.ts:343-353`) and `sendGroupEmail` (`groups.ts:648-656`) only call `requireUser()`; the proxy matcher excludes `api` (`proxy.ts:88`). — severity: keep. Duplicate/overlap of F-grupos-1 (13-grupos.md, email abuse, P1), F-04-1 and F-crear-sesion-4 (guest creates sessions): this file should own the shared guest guard, 13-grupos the email throttle.
F-guest-2 — PLAUSIBLE — Code facts hold (no captcha, one generic error: `GuestJoinForm.tsx:41-47`, `es.json:528`; the runbook has no anonymous-limit step, only a one-guest smoke test at line 346; BACKLOG T27 deliberately declined captcha). Whether the per-IP limit was already raised is a Supabase dashboard setting; settle by reading Auth rate limits. — severity: → P2 (runbook gap, not a code defect; becomes P1 only if the limit is confirmed at default before an event).
F-guest-3 — CONFIRMED — the join page selects only `{id,name}` and never checks status (`join/[token]/page.tsx:25-36`); `joinViaToken` throws `session_closed` after the anonymous sign-in (`community.ts:365-368`; the cited `:292-300` was stale); the guest catch shows the generic error (`GuestJoinForm.tsx:54-61`). Caveat: an exhausted link is already caught by the page's `isValid` check, so only the closed-session and seat-race cases are real. — severity: keep (P2 agrees with the board downgrade).
F-guest-4 — CONFIRMED — `SignOutButton.tsx:31-35` has no guest check; the claim "Cancelar" is a plain `ButtonLink` home (`claim/page.tsx:99-101`); a signed-in guest reopening a link sees the generic join form and `joinViaToken` simply redirects an existing participant (`community.ts:359-363`). Cookie behaviour after the claim sign-in is runtime. — severity: keep. Owner of the guest sign-out half (duplicated by F-cuenta-6).
F-guest-5 — CONFIRMED — `useGuestClaim.start` checks only `online` (`useGuestClaim.ts:21-43`); drafts are keyed by the anonymous id and replay lists only the signed-in user's keys (`useOfflineSync.ts:110-137`). Narrower than stated: normal sync usually drains before the tap, so loss needs a module that is still pending. — severity: keep. Overlaps F-offline-5 (15-offline-sync.md), which owns the offline-store side.
F-guest-6 — PLAUSIBLE — `$transaction` has no timeout option (no timeout/maxWait anywhere in `lib/guestClaim.ts`) and the per-touched-session `UPDATE evaluations ... SET isDraft = isDraft` hits every submitted evaluation (`:310-319`), firing the row trigger. A timeout or deadlock at 20 concurrent claims is unmeasured; settle with the staging load test in the finding. — severity: → P3 until measured. Invariant note: the proposed in-place upgrade (`updateUser`/`linkIdentity`) bends CLAUDE.md's guest-claim design (login, then `confirmGuestClaim` merge, never on GET) and must be written into that section and `docs/flows.md`.
