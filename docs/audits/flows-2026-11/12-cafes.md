# 12 · Cafés

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1121–1216 · **Domain briefs applied:** `asset-admin` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-asset-admin (Sonnet) · **Verification:** done 2026-11-06 (asset-admin verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A coffee is a reusable record owned by its creator (`createdBy`), with a 6-character code stamped at every create path (`lib/coffeeCode.ts`), three visibility tiers (private/shared/public) and a Ficha PDF. Owner CRUD lives in `app/actions/coffees.ts`; anyone who passes `usableCoffeeWhere` (`lib/coffeeAccess.ts:30`) can read the profile (`app/[locale]/app/coffees/[id]/page.tsx`), download the Ficha (`app/api/coffees/[id]/ficha/route.ts`), duplicate it, or pick it in the session wizard. "Delete" anonymizes in one transaction (`deleteCoffees`, coffees.ts:35-76): identifying fields wiped, shares and invites removed, tasting data left linked. Sharing is by invite link (`createCoffeeInvite`) that writes a `CoffeeShare` row on redeem. Spec/code differences: the board's "Catar este café" CTA (`/app/sessions/new?coffeeId=`) does not exist yet (`sessions/new/page.tsx:17-21` only reads `groupId`; no `coffeeId=` link in the profile), and several board line numbers are stale.

## 2. Expert bar applied

- **Anonymize must really anonymize, and say what survives** (P4–P6): wiped fields, retained attribute combinations, dialog copy (checklist 4–6).
- **Authorization server-side on the object; never trust foreign ids; codes are identifiers, not secrets** (P8, P9, P20): checklist 8, 9, 24, 30.
- **Link invites are bounded and revocable; show who has access and let the owner change it in one place** (P13–P15): checklist 14–17.
- **Every interactive failure is shown, localized** (P27) and concurrent edits are detected (P10): checklist 10, 29.
- **Lens cupping-protocol:** blind scores of an open session and exclusions chosen by the session owner must not leak through a coffee-level view.
- **Lens offline-native:** destructive and sharing actions need a visible failure (never a lost form); the share link should use the native share sheet.

## 3. Findings

### F-cafes-1 · The community block of profile and Ficha exposes other people's session names, dates and per-evaluation scores · severity: P1 · status: confirms-board(El bloque de comunidad expone sesiones y notas de otros catadores)
**Fixed in S8-02 (PR #67)** — session names/dates only for sessions the viewer owns or joined; recent tastings = own evaluations plus owned sessions.

- **Problem** — `loadCoffeeAggregateSamples` (`lib/coffees/aggregateSamples.ts:11-31`) fetches every `sessionSample` of the coffee with `session: { select: { id, name, date } }`, and its header says "NO AUTHORIZATION HERE". The profile renders `row.sessionName` + date + score (`page.tsx:383-395`) and the "recent tastings" list shows `ev.sessionName` with each `individualScore` (`page.tsx:426-440`); the Ficha route prints the same (`ficha/route.ts:90-94`). The only gate is `showResults = isOwner || coffee.resultsPublished || isAdmin` (`page.tsx:123`, `ficha/route.ts:69`). The coffee owner therefore sees names and scores of sessions run by strangers, including private solo ones, and with `resultsPublished` every shared or public viewer does too.
- **Implication** — privacy/security. Session names often carry a teacher's, school's or client's name; a single cupper's score identifies that person's palate on that coffee. Hits every owner of a coffee used by someone else.
- **Fix** — The coffee-level view shows only anonymous aggregates (count of sessions, community average, attribute averages, descriptor cloud) with no session name, no date and no per-evaluation row. A session name appears only for sessions the viewer owns or took part in. **Acceptance:** (1) a coffee owner who was not in a session sees no name/date of it in page or PDF; (2) own sessions still link to results; (3) "recent tastings" is removed or shows only the viewer's own rows; (4) a test asserts page and PDF share one sanitized model. **Size:** M.
- **Native** — n/a (server data shaping); the PDF must be fixed in the same change because it is downloaded and shared.
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — PDF gating inside the builder and the anonymity invariant (no other cupper's data) are reinforced, not bent.

### F-cafes-2 · The coffee aggregate counts open sessions and excluded cuppers · severity: P2 · status: new
**Fixed in S8-02 (PR #67)** — viewer-aware loader: closed + revealed sessions only, excluded cuppers removed (D6 a).

- **Problem** — the loader filters only `evaluations: { where: { isDraft: false } }` (`aggregateSamples.ts:19-26`). It has no session-status check, no `canViewGroupResults` rule and no `excludedFromResults` check, so `computeCoffeeAggregate` (`lib/coffeeAggregate.ts:224-248`) counts submitted evaluations of a session still in progress, of a group whose results are still hidden, and of cuppers the host excluded. Attribute averages come from `AggregateScore`, which the trigger updates live. The Ficha hardcodes `sd: null` and zero penalties (`ficha/route.ts:80-88`), so its number cannot be reconciled with any session report.
- **Implication** — scoring correctness and blind-tasting integrity: the owner of a coffee (often a roaster, not the host) can read running scores of a live blind cupping, and a cupper the host excluded still moves the shown number. The coffee score can differ from the closed-session score the cuppers saw.
- **Fix** — Only evaluations from closed sessions (or where `canViewGroupResults` is true) and from non-excluded participants enter the coffee aggregate. **Acceptance:** (1) a submitted evaluation in an active session does not change the coffee profile; (2) after the host excludes a cupper and closes, the coffee average equals the session's community score for that sample; (3) the Ficha shows the same average as the profile. **Size:** M.
- **Native** — n/a
- **Confidence** — verified-in-code (loader); needs-runtime-check for the exact divergence (compare a closed session's score with the profile).
- **Kim?** — yes, see K-cafes-1.
- **Invariant check** — scoring never from the client, trigger authoritative: the fix filters inputs and does not reimplement `lib/scoring.ts`.

### F-cafes-3 · Owner's private notes are shown to every viewer and copied by Duplicate · severity: P2 · status: new
**Fixed in S8-02 (PR #67)** — notes render for owner/super-admin only; `duplicableFields` allow-list drops them from duplicates.

- **Problem** — the Ficha route says "Private owner text: never printed for other viewers (the profile page omits it too)" (`ficha/route.ts:122-123`), but the profile prints `coffee.notes` for anyone who can open the coffee (`page.tsx:274-278`, no `isOwner` guard). `duplicateCoffee` also selects and copies `notes` of a foreign coffee (coffees.ts:282, 296-300). Anonymize treats notes as identifying (`coffeeAnonymize.ts:45`).
- **Implication** — trust/privacy: a roaster who puts a buyer, price or lot remark in notes on a public or shared coffee publishes it to all registered users. Code comment and page disagree, so one of them is a bug.
- **Fix** — Make notes owner-only (matching the comment and the Ficha): render only for the owner (and super-admin) and do not copy them in Duplicate. **Acceptance:** (1) a non-owner viewing a public coffee sees no notes; (2) a duplicate of a foreign coffee has empty notes; (3) owner view and edit form unchanged. **Size:** S.
- **Native** — n/a
- **Confidence** — verified-in-code
- **Kim?** — no (a product call for Ricardo: if notes were meant to be shared, rename the field and fix the Ficha comment instead).
- **Invariant check** — none touched.

### F-cafes-4 · Revoking a person does not revoke the link, and links never expire · severity: P2 · status: confirms-board(Revocar un acceso no sirve: el enlace sigue vivo y nunca caduca)

- **Problem** — `revokeCoffeeShare` only runs `coffeeShare.deleteMany` (coffees.ts:427). The invite stays valid: `createCoffeeInvite` reuses the newest invite with no `expiresAt`/`maxUses` (337-349, create at 352-354), `joinCoffeeViaToken` accepts it again (364-401) and the profile shows that same token (`page.tsx:92-105`). There is no "regenerate/disable link" action. The `maxUses` check (382) also runs outside the transaction, unlike session invites in CLAUDE.md.
- **Implication** — security/trust: a revoked person reopens the link and regains access; a link pasted in a chat lives forever.
- **Fix** — Add an owner action "Generar enlace nuevo" that invalidates the previous invite, offer it in the revoke confirmation, give new links a default expiry (e.g. 30 days, visible to the owner) and make the use check transactional. **Acceptance:** (1) after revoke+rotate the old URL shows the invalid-link page; (2) a revoked user cannot rejoin with the old URL; (3) the expiry date is shown next to the link. **Size:** M.
- **Native** — the link is shared as a URL: use the native share sheet and make the universal link open the app, falling back to the existing join page.
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — none touched.
- **Fixed in S8-12** (PR #TBD) — `rotateCoffeeInvite` (old URL reads invalid), offered in the revoke confirmation (default on), 30-day expiry shown next to the link, `maxUses` checked inside the join transaction.

### F-cafes-5 · Going private and back silently reactivates old links and people · severity: P2 · status: confirms-board(Volver a compartir reactiva enlaces y accesos antiguos)

- **Problem** — `setCoffeeVisibility` only updates the column (coffees.ts:493-496); shares are "inert, not deleted" by design (`coffeeAccess.ts:25-27`, `usableCoffeeWhere:36`). Flipping to shared/public again revives every old share row and every old invite (`join/coffee/[token]/page.tsx:34-38` checks only `visibility !== "private"`).
- **Implication** — trust: the owner thinks "private" reset sharing; people removed in spirit regain access with no visible list at the moment of re-sharing.
- **Fix** — Leaving shared/public deletes invites; returning to shared shows the previous people and lets the owner keep or clear them first. **Acceptance:** old links are dead after a private round trip; the owner sees who would regain access before confirming. **Size:** S–M.
- **Native** — n/a
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — none touched (RLS `coffees_select` mirrors `usableCoffeeWhere`; change both if shares are deleted).
- **Fixed in S8-12** (PR #TBD) — `setCoffeeVisibility(private)` deletes the invites; returning to shared/public lists the previous people and lets the owner keep or clear them.

### F-cafes-6 · Create, edit and duplicate throw instead of returning ActionResult · severity: P2 · status: new

- **Problem** — `createCoffee`, `updateCoffee`, `duplicateCoffee` are not wrapped in `run()`; they throw `not_authenticated`/`not_found_or_forbidden` (coffees.ts:159, 225-227, 286) and return an ad-hoc `{ok:false,error:string}`. `CoffeeForm` awaits them inside a transition with no try/catch (`components/coffees/CoffeeForm.tsx:160,169`); a thrown error reaches the browser as an opaque digest and hits the error boundary, discarding the typed form. Contract: CLAUDE.md "Server Action Contract". (`joinCoffeeViaToken` is fine: it is wrapped by `joinCoffeeForm` in `app/actions/join.ts:33-41`.)
- **Implication** — robustness and native-readiness: an expired session, a coffee anonymized in another tab, or a dropped connection on a phone while saving loses a long form with no localized message.
- **Fix** — Convert the three actions to `run()` returning `ActionResult`, show `errors.codes.*` through `useActionFeedback`, keep form values on failure. **Acceptance:** with the network offline, Save shows a localized error and the fields stay; editing an anonymized coffee shows "not found" in place. **Size:** S.
- **Native** — a failed request in the WebView must produce the same inline error; no queued success.
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — implements the ActionResult contract.

### F-cafes-7 · Guests can create coffees by direct call; text is unvalidated · severity: P3 · status: confirms-board(Acciones de café aceptan invitados y textos sin validar)

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `requireUser` (`lib/auth.ts:4-18`) accepts anonymous users and upserts a profile; coffee actions never check `is_anonymous` (compare `createExpressSession`, sessions.ts:405). `createCoffee`/`updateCoffee` only `trim()` and take `certifications` as given (coffees.ts:161-183, 232-248); `lib/validate.ts` is not used.
- **Implication** — robustness/abuse: a throwaway identity can mint coffees (with codes) and share rows; huge strings reach Prisma.
- **Fix** — Reject guests in every coffee mutation and validate with `lib/validate` (name ≤120, fields ≤200, notes ≤2000, certifications a subset of the known list). **Acceptance:** a guest POST returns `not_found_or_forbidden`; over-length input returns `invalid_input`. **Size:** S.
- **Native** — n/a
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — guest scope kept; validation per CLAUDE.md.

### F-cafes-8 · "Anonymized" coffees still reveal farm and producer through sample data, and the dialog over-promises · severity: P3 · status: confirms-board(Anonimizar deja finca y productor en los datos extrínsecos)
**Fixed in S8-02 (PR #67)** — delete dialog now lists what stays on sample origin sheets (no clearing).

- **Problem** — `ANONYMIZED_COFFEE_DATA` clears coffee fields only (`coffeeAnonymize.ts:55-65`); `ExtrinsicData` keys `ext_finca_val`/`ext_productor_val` (`ExtrinsicForm.tsx:123-129`, rendered via `cvaFormData.ts:581-586`) and sample labels stay. Retained region + altitude + harvest + variety + process, plus `createdBy` still pointing at the owner, make the row pseudonymous rather than anonymous. The dialog says data stays "de forma anónima" (`messages/es.json` `coffee.deleteCoffee.body`).
- **Implication** — trust/compliance: the owner asked to erase farm and producer and results, CVA PDF and print can still show them.
- **Fix** — Either clear those keys and name-equal labels at anonymize time, or change the dialog to list which sample-level data remains. **Acceptance:** after delete, results, CVA PDF and print show no farm/producer for that coffee, or the dialog lists them. **Size:** M.
- **Native** — n/a
- **Confidence** — verified-in-code (fields); needs-runtime-check (render after delete).
- **Kim?** — no
- **Invariant check** — closed = read-only: clearing extrinsic data on closed sessions is a new post-close write; it needs a named exception in `docs/flows.md` §1, so the copy-only option is the safe default.

### F-cafes-9 · Editing a coffee rewrites past sessions, and concurrent edits overwrite each other · severity: P3 · status: new

- **Problem** — the edit page promises "Los cambios se reflejan en todas sus sesiones" (`messages/es.json` `coffee.editSubtitle`); history snapshots hold only the cupper's own evaluation and session metadata (`lib/coffeeHistory.ts:157-163`), so closed results and PDFs read the live coffee. `updateCoffee` has no `updatedAt` precondition (coffees.ts:232-249).
- **Implication** — trust: a corrected process or origin changes a report already shared; a two-device edit silently loses a change.
- **Fix** — Add an `updatedAt` check returning a "changed elsewhere" message; settle the past-sessions rule (K-cafes-2). **Acceptance:** a stale save is refused with a reload prompt. **Size:** S (check) / M (snapshot).
- **Native** — a queued or replayed offline edit must not overwrite a newer version.
- **Confidence** — inferred-from-spec for report display; verified-in-code for the missing precondition.
- **Kim?** — yes, see K-cafes-2.
- **Invariant check** — closed = read-only would be bent if reports froze; keep live unless Kim says otherwise.

### F-cafes-10 · "Catar este café" does not exist; the wizard cannot start from a coffee · severity: P3 · status: confirms-board(Catar este café (CTA en el perfil))

- **Problem** — `sessions/new/page.tsx:17-21` takes only `groupId`; the profile has no link with `coffeeId=` (grep finds none).
- **Implication** — friction: the owner of a new lot re-finds it in the picker.
- **Fix** — As in the board requirement; validate with `usableCoffeeWhere` (already the rule at sessions.ts:259). **Acceptance:** the CTA opens the wizard with that coffee as sample 1; a foreign id is ignored. **Size:** S.
- **Native** — the parameter must survive the login redirect and deep links.
- **Confidence** — verified-in-code
- **Kim?** — no
- **Invariant check** — never trust a client coffee id: re-validated server-side.

## 4. Keep — works well

- Owner-only anonymize through the `createdBy` predicate in one transaction (`coffees.ts:44-59`), impact counts scoped to owned ids (`getCoffeeDeleteImpact`, 110-127) and a dialog that says the action cannot be undone.
- `usableCoffeeWhere` as the single read rule, reused by page, Ficha route, wizard and duplicate; guests and anonymized coffees get 404 on the Ficha (`ficha/route.ts:58-64`).
- Short codes: unambiguous alphabet, bare storage / hyphen display, collision retry (`lib/coffeeCode.ts`); duplicate mints its own code.
- Owner opening their own link or a repeat open is a no-op (coffees.ts:388-396); `setCoffeeVisibility` validates the tier and refuses anonymized rows.
- Notes hidden in the Ficha for non-owners (`ficha/route.ts:123`) — keep, and extend to the page (F-cafes-3).

## 5. Not verified

- RLS `coffees_select` / `coffee_shares` parity with `usableCoffeeWhere` (needs the Supabase SQL or a two-user test).
- List and bulk-delete behaviour at phone width and touch-target size (needs a device).
- Real divergence between profile and closed-session scores (F-cafes-2): run one live session with an excluded cupper.
- Whether sample labels or `ExtrinsicData` repeat the coffee name in production data (query `session_samples`).

## 6. Questions for Kim (collected)

- **K-cafes-1** — Cuando un café ya fue catado, ¿el puntaje promedio del café debe incluir una cata que todavía está abierta, o a un catador que el anfitrión sacó de los resultados? Opciones: (a) solo catas cerradas y sin catadores excluidos; (b) también catas abiertas, marcadas como "provisional".
- **K-cafes-2** — Si el tostador corrige después el proceso o el origen de un café, ¿los informes de catas ya cerradas deben mostrar el dato corregido o el que se tenía el día de la cata? Opciones: (a) siempre el dato actual; (b) congelar el dato al cerrar la cata; (c) mostrar el actual con una nota "editado".

## 7. Verification log

F-cafes-1 — CONFIRMED — `aggregateSamples.ts:11-31` has no authorization and selects session name/date; `page.tsx:380-440` renders `sessionName` + date + score and per-evaluation rows gated only by `showResults` (:123); the Ficha prints the same (`ficha/route.ts:69,90-94`). Cupper identity is never shown (page comment "Anonymous") and the page deliberately shows "appearance + community score" to non-owners, so the leak is session names, dates and single scores, not people. — severity: → P2 (privacy leak of session names, gated by owner/`resultsPublished`; no identity, no data loss)
F-cafes-2 — CONFIRMED (partly) — the loader has no status/visibility/exclusion filter (`aggregateSamples.ts:19-26`); `communityAvg` and `attrAverages` come from the trigger-written `AggregateScore`, which already applies exclusions but updates live, so open-session scores do leak. Correction: excluded cuppers do NOT move `communityAvg`; they do move `evaluationsCount`, `individualAvg` and the descriptor cloud (`coffeeAggregate.ts:85-148`). Ficha `sd: null` and zero penalties confirmed (`ficha/route.ts:80-88`). — severity: keep
F-cafes-3 — CONFIRMED — `page.tsx:272-276` prints `coffee.notes` with no `isOwner` guard while `ficha/route.ts:122-123` says it is owner-only; `duplicateCoffee` selects and copies `notes` (`coffees.ts:282,296-300`). — severity: keep
F-cafes-4 — CONFIRMED — `revokeCoffeeShare` only runs `coffeeShare.deleteMany` (`coffees.ts:427`); invite reuse has no expiry (:337-354); `joinCoffeeViaToken` recreates the share row on reopen (:364-401); `maxUses` is read outside the transaction. — severity: keep
F-cafes-5 — CONFIRMED — `setCoffeeVisibility` updates only the column (`coffees.ts:493-496`); `coffeeAccess.ts:25-27` documents inert shares; the join page checks only `visibility !== "private"` (`join/coffee/[token]/page.tsx:34-38`). Same root cause as F-cafes-4 (links and shares are never invalidated); fix together. Needs a deliberate private round trip. — severity: → P3
F-cafes-6 — CONFIRMED — `createCoffee` (:143), `updateCoffee` (:200) and `duplicateCoffee` (:262) are not in `run()` and throw (:159, 225-227, 286); `CoffeeForm.tsx:160,169` has no try/catch. It triggers only on an expired session or a concurrent anonymize and ends at the error boundary. — severity: → P3 (robustness on rare failures, no wrong data stored)
P3 notes: no wrong citations or duplicates spotted.
