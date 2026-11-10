# 06 · Crear sesión (asistente completo)

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 568–658 · **Domain briefs applied:** `session-setup` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-session-setup / Sonnet 5.5 · **Verification:** done 2026-11-06 (session-setup verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

An owner opens `/sessions/new` and fills one long form in `NewSessionForm.tsx` (name, date, cups, objective, format, optional warm-up, coffee cards, sample chips, optional reference, group switch). Solo calls `createSession`, which redirects to `/cup`. Group calls `createGroupSession`, which returns `{sessionId, inviteToken}` and the form flips to an in-memory step 2 (`step` is `useState`). Step 2 already differs from the spec: the primary button is "Ir al panel" (no start) and a secondary "Iniciar cata ahora" calls `startSession` inside try/catch (`NewSessionForm.tsx:616-640`), so the board's "startSession lanza" requirement is already fixed in code. The lobby route the board proposes does not exist (`sessions/[id]/` holds only cup, edit, loading, print, results, waiting).

## 2. Expert bar applied

- **Fewer fields, defaults, optional marked (P7–P9):** only names are required; checked required/optional marking and the defaults for format, cups and date.
- **Inline validation, message beside the field, in both languages (P10):** checked error-copy coverage, placement, focus.
- **Never lose entered data / Back (P5):** checked failed create, reload on step 2, no draft.
- **Phone ergonomics (P12, P13):** `inputmode`, `enterkeyhint`, 44 px targets.
- **Cupping lens (P7, P10):** cups-per-sample default and what it silently switches off; sample codes.
- **Native lens (P14, P15):** background/resume while sharing the invite; clipboard.

## 3. Findings

### F-crear-sesion-1 · A failed create throws away the whole form · severity: P2 · status: confirms-board(La acción lanza (BD caída, sesión expirada))
**Fixed in S8-10** (PR pending): see F-04-2; locale whitelisted with `safeLocale` (T1).

- **Problem** — `createSession` and `createGroupSession` are not wrapped in `run()` (`app/actions/sessions.ts:320`, `:438`; both start with `await requireUser()`, which throws `not_authenticated`). `onSubmit` calls them in `start(async () => { ... })` with no try/catch (`NewSessionForm.tsx:495-533`), so any throw (expired session, DB down, a non-collision error rethrown by `resolveCoffees`) reaches the route error boundary.
- **Implication** — A host who typed 6 coffees and 6 samples before a tasting loses all of it on one flaky request. Data loss of typed input; trust.
- **Fix** — Convert both actions to `ActionResult` via `run()` (solo keeps its redirect), let the client error map accept both the wizard codes and `errors.codes.*`, and catch in the transition so the form stays mounted with the error strip. **Acceptance:** a rejected create leaves every field intact; the strip shows; the button re-enables; a solo success still lands on `/cup`; a session-expired error tells the user to sign in again without clearing state. **Size:** M.
- **Native** — A resumed WebView often has an expired cookie; the error must be recoverable in place.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — ActionResult contract (this applies it); authz unchanged.

### F-crear-sesion-2 · Step 2 (invite link and QR) lives only in memory · severity: P2 · status: confirms-board(Recargar o cerrar la pestaña en el paso 2)

- **Problem** — `step`, `inviteToken` and `sessionId` are `useState` in `NewSessionForm.tsx`. The session is already created and `active`. The only way back to a link is the master panel, whose "Invitar" mints a new token on every click (`CupClient.tsx:1304-1308` calls `createInviteToken`, which inserts a row each time, `community.ts:405-417`), while the print page already finds the existing valid invite (`print/page.tsx:61-72`).
- **Implication** — The natural host move is leaving the app to paste the link into a chat. On a phone that can reload the WebView and the QR and link vanish; the host then mints extra tokens and ends with several live links on one session.
- **Fix** — Make the post-create screen a real owner-only route that reads the latest valid invite (print's lookup) and shows link, QR, joined count and the panel/start buttons; "Regenerar" is explicit. **Acceptance:** reload shows the same token; panel "Invitar" shows the existing link first; two clicks never create two tokens unprompted; participants and guests get 404. **Size:** M.
- **Native** — Must survive app pause/resume and a WebView reload; the invite stays a plain HTTPS URL (universal-link ready); use the share sheet with a clipboard fallback.
- **Confidence** — verified-in-code; iOS reload behaviour needs-runtime-check.
- **Kim?** — no.
- **Invariant check** — authz via `requireSessionOwner`; no new close path.

### F-crear-sesion-3 · Most specific error messages never reach the user · severity: P2 · status: confirms-board(invalid_name · date · objective · format · cups · too_many_samples · invalid_closes_at · invalid_warmup)
**Fixed in S8-10** (PR pending): the wizard receives the whole `errors` table; `invalid_warmup`, `not_found_or_forbidden`, `not_authenticated`, `unknown` added; `tests/sessionErrorsCopy.test.ts` enumerates the validator codes (T2).

- **Problem** — `new/page.tsx:103-` passes 8 error keys while `messages/es.json` and `en.json` define 15 under `session.newForm.errors`. Anything else falls back to generic in the form (`errorText`, `NewSessionForm.tsx`). Two codes have no copy at all: `invalid_warmup` (`sessions.ts:227`) and `not_found_or_forbidden` (`:475`).
- **Implication** — An emptied date field (not `required`) or a past closing date shows "No se pudo crear la sesión" with nothing to fix. Repeated identical generic error calls for redesign (P17).
- **Fix** — Pass the whole `errors` object, add the two missing codes in es/en, and add a vitest that fails when a code returned by the validators has no copy. **Acceptance:** each code shows its own sentence in es and en; the test enumerates the codes. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-crear-sesion-4 · Create actions are public endpoints with thin validation and no guest guard · severity: P2 · status: new

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `createExpressSession` rejects anonymous users because "this closes the direct-POST path" (`sessions.ts:405`), but `createSession` and `createGroupSession` only call `requireUser()`; `proxy.ts` is the sole barrier (`lib/guestScope.ts` excludes `sessions/new`). Also unchecked: the `coffees` array length (only samples are capped, `MAX_SAMPLES = 100`), every coffee text field, `notes`, `certifications`, and `s.label` length/type (`validateSessionInput`, `sessions.ts:119-148`).
- **Implication** — A QR walk-up guest could create sessions and coffees under a throwaway identity that the claim flow must later merge; a malformed payload can flood the library or throw inside Prisma. Security/robustness; no other user's data is exposed.
- **Fix** — Reject `is_anonymous` in both actions with `not_found_or_forbidden`; cap coffees (for example 100) and bound string lengths and the label type via `lib/validate`. **Acceptance:** an anonymous direct call writes nothing and returns forbidden; 101 coffees or a 5 000-character label returns a field error. **Size:** S.
- **Native** — n/a.
- **Confidence** — guard absence verified-in-code; exploitability needs-runtime-check (POST the action as a guest).
- **Kim?** — no.
- **Invariant check** — guest scope (this enforces it).

### F-crear-sesion-5 · Two cups by default, and the consequence is never shown · severity: P2 · status: new

- **Problem** — The wizard starts at `useState(2)` cups with format combinado (`NewSessionForm.tsx:274`); the label is only "Tazas por café" (`es.json` `session.cups`), and uniformity/defect deductions apply only at 5 cups or more (`lib/scoring.ts:209`). Express is fixed at 1 cup.
- **Implication** — A teacher running a normal five-cup session who skims past the pre-filled 2 gets scores with no deductions and no warning; sessions with different cups are not comparable and nobody learns why. A silent default becomes data (P9; cupping P7).
- **Fix** — Show a one-line hint under the field when cups is 1–4 ("con menos de 5 tazas no se descuentan uniformidad ni defectos"), and set the default per Kim. **Acceptance:** hint appears for 1–4 and disappears at 5, in es and en; default as decided. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — yes. En una cata de verdad, ¿cuántas tazas por muestra usan casi siempre? Opciones: (a) 5 siempre por defecto, (b) 5 para afectiva/combinada y libre para descriptiva, (c) dejar 2 y solo avisar.
- **Invariant check** — scoring formula untouched; cups stay server-derived.

### F-crear-sesion-6 · Unfinished form is not saved and errors sit far from the field · severity: P3 · status: new
**Partly fixed in S8-10** (PR pending): every code has copy and the invite step survives a reload via `sessions/[id]/invite`. Draft persistence and field-level focus NOT built.

- **Problem** — No draft persistence and no unload guard in `NewSessionForm.tsx`; server errors render in one strip above the submit at the bottom of a long form (`:1262-1264`); only coffee-card errors get a red border and scroll.
- **Implication** — A back-swipe or app switch discards the form; a bad name or date error appears screens away from its field.
- **Fix** — Keep a local draft cleared on success, and show name/date/cups errors beside the field with focus on the first invalid one. **Acceptance:** reload restores values; the error appears next to the field and takes focus. **Size:** M.
- **Native** — Do not rely only on IndexedDB (eviction); flush the draft on app `pause`.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — offline store stays client-only.

### F-crear-sesion-7 · Phone ergonomics and UTC date defaults · severity: P3 · status: new

- **Problem** — Cups is `type="number"` without `inputMode` (`NewSessionForm.tsx:676`); no `enterKeyHint` anywhere; pills and inputs use `py-2.5` at a 14 px root, roughly 37 px high. The default date is `new Date().toISOString().slice(0, 10)` (`:271`), the UTC date, and the closing-date `min` uses the same expression.
- **Implication** — Spinner arrows and a wrong keyboard on phones; after about 20:00 in Chile the session is dated tomorrow and "today" is refused as closing date.
- **Fix** — `inputMode="numeric"`, `enterKeyHint` next/done, 44 px targets, local-date defaults. **Acceptance:** numeric keypad for cups; computed height at least 44 px; at 21:00 local the default date is today. **Size:** S.
- **Native** — Verify the keyboard does not cover the submit button in WKWebView.
- **Confidence** — verified-in-code; target sizes need-runtime-check.
- **Kim?** — no.
- **Invariant check** — closesAt semantics unchanged (end of day UTC).

### F-crear-sesion-8 · Group step-1 button says "Iniciar cata" but only creates · severity: P3 · status: confirms-board(Paso 1 «Iniciar cata» sólo crea; paso 2 «Siguiente» sí inicia)
**NOT fixed in S8-10**: the group submit label is unchanged (T4 copy half not built).

- **Problem** — The step-1 submit always renders `t.start` (`NewSessionForm.tsx:1272`), solo and group alike. The step-2 half of the board item is already fixed.
- **Implication** — Downgraded from the board's P2: step 2 now states clearly that the room has not started, so the residual is a misleading label.
- **Fix** — In group mode label it "Crear cata y obtener enlace". **Acceptance:** toggling the group switch changes the label in es and en. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-crear-sesion-9 · Unused coffee cards become orphans; coffees outlive a failed session insert · severity: P3 · status: confirms-board(Cafés creados fuera de la transacción de la sesión (huérfanos))

- **Problem** — `resolveCoffees` creates every non-linked card (`sessions.ts:271`, `toCreate = coffees.filter((c) => !c.existingCoffeeId)`) in its own transaction before the session transaction (`:350`, `:487`).
- **Implication** — Orphan private coffees in the library; a failed session insert leaves its coffees behind.
- **Fix** — Create only cards referenced by a sample, inside the session transaction, retrying the whole transaction on a code collision. **Acceptance:** 2 cards with 1 used gives 1 row; a forced session failure gives 0 rows; `coffeeIdx` mapping holds. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — coffee short codes: pre-generate and retry the whole transaction (CLAUDE.md rule).

### F-crear-sesion-10 · Sample labels are sequential letters in owner order · severity: P3 · status: new

- **Problem** — Defaults are "Muestra A, B, C…" by list position (`NewSessionForm.tsx:165-197`); server fallback is `Muestra ${i + 1}` (`sessions.ts:366`). Blind cupping practice uses random codes unrelated to name or order.
- **Implication** — Letters match the order the host typed the coffees, so the blinding is only as good as the host's discipline.
- **Fix** — Offer an optional "códigos al azar" setting (for example 3 digits), keeping letters as default. **Acceptance:** codes unique per session and unrelated to entry order. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — yes. ¿Los códigos de las tazas en una cata a ciegas son letras en orden o números al azar? Opciones: (a) letras en orden está bien, (b) números al azar por defecto, (c) elegir al crear.
- **Invariant check** — none touched.

## 4. Keep — works well

- Server-side validation of name, date, format, cups 1–5, samples, closing date and warm-up before any DB write (`validateSessionMeta`, `sessions.ts`).
- Coffee ids re-validated with `usableCoffeeWhere`; foreign `groupId` rejected; `?groupId=` honoured only for owned groups (`new/page.tsx`).
- Group create is one transaction (session, samples, owner participant, invite, reference); closing date is end of day UTC via `v.dateOnlyEndOfDay`.
- Step 2 "Ir al panel" primary plus "Iniciar cata ahora" secondary with try/catch and idempotent `startSession` (`community.ts:137`).
- Reference stamped by position in the same transaction (`applyReferenceByPosition`); duplicate prefixes "Copia de" and omits participants, status and close date.
- Double submit blocked by `pending`; only the name is required.

## 5. Not verified

- Guest direct POST to `createSession` (needs one anonymous session and the action id).
- WebView reload on step 2 after sharing the link on iOS/Android (device).
- Rendered heights of pills and inputs (device or browser pane).
- `duplicateSession` copies only the active reference as rank 1 (`sessions.ts:105`, `:745`), dropping ranks 2 and 3; whether templates should keep them is a product call.
- The lobby route is a board to-be, not code; `sessionHref` still sends owners to `/cup` (`lib/sessionRouting.ts:24`).

## 6. Questions for Kim (collected)

- **K-crear-sesion-1** — En una cata de verdad, ¿cuántas tazas por muestra usan casi siempre? (a) 5 siempre por defecto, (b) 5 para afectiva/combinada y libre para descriptiva, (c) dejar 2 y solo avisar.
- **K-crear-sesion-2** — ¿Los códigos de las tazas en una cata a ciegas son letras en orden o números al azar? (a) letras en orden está bien, (b) números al azar por defecto, (c) elegir al crear.

## 7. Verification log

F-crear-sesion-1 — CONFIRMED — `createSession` (sessions.ts:320) and `createGroupSession` (:438) are outside `run()` and start with `requireUser()` (throws `not_authenticated`); NewSessionForm.tsx:495-533 has no try/catch in the transition. Validation failures are returned, so only throws lose the form. — severity: keep (P2). Owner of the duplicate F-04-2.
F-crear-sesion-2 — CONFIRMED — `step`/`inviteToken` are `useState` (set at NewSessionForm.tsx:522-526); `createInviteToken` inserts a new row per call (community.ts:405-413); print page reuses the latest valid invite (print/page.tsx:61-72). The link is recoverable from the master panel and extra live tokens are harmless, so impact is annoyance. — severity: → P3.
F-crear-sesion-3 — CONFIRMED — new/page.tsx passes 8 error keys (:103-113) while es.json:183-199 defines 15; `errorText` falls back to `generic` (NewSessionForm.tsx:537-538). Weak example: the closing-date input has `min=today` (:1220), so a past date needs typing; the emptied-date case is real (date input has no `required`, :667). Wizard users rarely hit these. — severity: → P3.
F-crear-sesion-4 — CONFIRMED — no `is_anonymous` check in either creator; `validateSessionInput` (sessions.ts:119-148) caps neither coffees nor field lengths (only samples, `MAX_SAMPLES` :151). Exploit unrun. — severity: keep (P2). duplicate of F-04-1 for the guard part: F-04-1 owns it; this finding keeps the input-bounds part.
F-crear-sesion-5 — CONFIRMED — default 2 at NewSessionForm.tsx:274, penalties gated at lib/scoring.ts:209, no hint. — severity: keep (P2). Owner of the duplicate F-04-4. Scoring stays server-derived; the Kim question stands.
F-crear-sesion-6 (P3) — duplicate of F-crear-sesion-1 / F-04-2 for the draft/unload part.
