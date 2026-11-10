# 13 · Grupos

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1217–1305 · **Domain briefs applied:** `asset-admin` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-asset-admin (claude-sonnet-5-5) · **Verification:** done 2026-11-06 (asset-admin verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

A teacher or lab lead (the owner) creates a standing roster of cuppers by email or from their co-cupper network (`createGroupWithMembers`, `addMemberByEmail`, `addMemberByUserId` in `app/actions/groups.ts`), posts announcements (optionally emailed), emails the whole group, and creates sessions linked to the group. A row can exist before the person has an account. It is linked by the `handle_new_user` trigger or by `claimGroupMembershipsByEmail` on every groups page load (`lib/groupMembership.ts:10-23`). Members only read the feed, see the roster and sessions, and can leave (`leaveGroup`). Every owner action authorizes with an inline `createdBy === user.id` check. Mutations other than `sendGroupEmail` throw, and the client collapses every failure into one generic string. The board's spec and the code agree. The one exception is that the member view also lists group sessions the member has not joined (page.tsx:168-176), which is intended. The board's open-questions list is empty, but it carries six requirements; this audit re-verified each one.

## 2. Expert bar applied

- **P8/P9 authorization on the object, deny by default** (asset-admin). Q: does every mutation check ownership server-side, and is a user id ever resolved to an email without the co-cupper gate? Q: can an anonymous account call it?
- **P11 idempotent create/invite.** Q: does a double tap create two groups or two email blasts?
- **P16/P17 invite state, uniform responses, masked roster.** Q: is a linked member's email shown or returned to anyone?
- **P2/P3/P6 specific, impact-aware confirmations; P1 confirm or undo.** Q: do irreversible sends (emails) get any confirmation or recipient count?
- **P26/P27 trace and surfaced failures.** Q: can the owner see who actually received a broadcast, and is every failure shown?
- **offline-native §3.** Q: what does an owner action do offline, and do links and `window.confirm` survive a WebView shell?
- **cupping-protocol lens.** A group is a class or lab cohort. Q: who may see who, and when are people told about a cupping?

## 3. Findings

### F-grupos-1 · Any account, including an anonymous QR guest, can send unlimited branded email · severity: P1 · status: confirms-board(Invitados y cualquier cuenta pueden enviar correos masivos sin límite)

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `requireUser()` only checks that a Supabase user exists (`lib/auth.ts:9` `if (!user) throw`). It never checks `is_anonymous`. `createGroupWithMembers` (`app/actions/groups.ts:353` `const user = await requireUser();`), `addMemberByEmail` (:491), `resendInvitation` (:1182), `sendGroupEmail` (:656), `notifyGroupOfSession` (:836) and `createGroupPost` with `notifyByEmail` (:963, :985) all stop there. Nothing counts or caps volume. A group holds up to 200 members (:21), the subject is up to 200 characters and the body up to 5 000 (:667-670), and the group name and description are interpolated into the invitation subject and HTML (:221, :249). `proxy.ts` only gates guests by page path (`guestRedirect`), which does not stop a direct action POST. Guest page-gating is therefore not an authorization control for these actions.
- **Implication** — Anyone can create a QR walk-up identity and then send arbitrary text to arbitrary addresses from the brand's Resend domain, over and over. That means spam or phishing under the brand and a burned sender reputation, which would also break the close emails and magic links that share the domain. Security and trust.
- **Fix** — Group and broadcast actions reject anonymous users with `not_found_or_forbidden` and send nothing. Outbound user-triggered email is rate-limited per sender (recipients per day, broadcasts per hour, a lower cap for accounts under 24 h), counted in a table, and returns a localized `rate_limited` code. The limits are named constants in one module. **Acceptance:** an anonymous caller of each of the six actions gets a refusal and zero sends; the 4th broadcast in an hour is refused with copy in `errors.codes`; a unit test pins the constants. **Size:** M.
- **Native** — The limit lives on the server, so a shell cannot bypass it. The refusal copy must be visible in the app's small error area, not only a toast.
- **Confidence** — verified-in-code for the missing check; needs-runtime-check that a direct action POST from an anonymous session succeeds (one anonymous session, one `curl` with the `Next-Action` header).
- **Kim?** — no.
- **Invariant check** — brushes the guest-scope rule (guests never create assets). The fix enforces it in the action layer as well, and `lib/guestScope.ts` stays the page-level rule. The `ActionResult` contract is respected by converting these actions to `run()`.

### F-grupos-2 · Announcements email the whole roster by default, and the owner never sees the outcome · severity: P2 · status: new

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `PostComposer` initialises `notifyByEmail` to `true` (`components/groups/PostComposer.tsx:29` `useState(true)`). The action's result carries `emailSummary` (`app/actions/groups.ts:1012`), but the composer ignores it and just clears the form (`PostComposer.tsx:51-57`). If the blast fails, `createGroupPost` only does `console.warn` (`groups.ts:1001`) and leaves `emailSent` false. There is no recipient count before sending, and an email cannot be recalled.
- **Implication** — A quick "bring a cup tomorrow" note becomes an irreversible email to up to 200 people, including invitees who have not accepted. A failed or skipped send is invisible, so the teacher believes the class was told when only the in-app feed was updated. Trust and robustness.
- **Fix** — Make the email an explicit choice. Show "se enviará a N personas" beside the checkbox, default it off for groups with unlinked members (or always, which is the safer option), and after publishing show the sent/skipped/failed result with a retry for the failed ones (see F-grupos-7). **Acceptance:** a new post does not email unless the box is ticked; the owner sees counts after publish; a skipped send shows the "not configured" notice. **Size:** S.
- **Native** — A shell shows the same result text; no push substitute is assumed.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-grupos-3 · Send results return linked members' live email addresses · severity: P2 · status: confirms-board(El resumen de envío muestra el correo completo de miembros enlazados)

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `sendGroupEmail` resolves the current address through the admin client (`groups.ts:730-732` `email = liveEmail`) and returns it in `results` (:754, :764). `GroupEmailComposer` prints it (`components/groups/GroupEmailComposer.tsx:165` `{r.email}`). `notifyGroupOfSession` does the same (:889-894, :925-944) and its summary reaches the browser through `createGroupSession`'s `emailSummary` payload (`app/actions/sessions.ts:559`). The group page masks the stored address (`page.tsx:472`), so the invariant "linked members' emails render masked" is bypassed. A smaller leak of the same kind is in the owner's activity feed, which falls back to the raw stored email when a linked member has no display name (`page.tsx:299` `m.displayName ?? m.email`).
- **Implication** — An owner learns the new address of someone who changed it (security and privacy). I rate this P2 rather than the board's P1, because only the owner of a group the person belongs to sees it, and the person has cupped with them. Raise it if guests can own groups (see F-grupos-1).
- **Fix** — Results are keyed by `memberId` with a display label (name, or masked email), and the live address is used only for the Resend call. One shared mask helper replaces the private one in the page file. **Acceptance:** the action JSON has no `@` for members with `userId`; both components render name or `j***@dominio`; the helper has a unit test. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — keeps the "user-id → email resolution is co-cupper-scoped" rule; no change to `lib/coCuppers.ts`.

### F-grupos-4 · Adding someone by email makes them a member without their consent · severity: P2 · status: new

**Not fixed in S8-11** (owner decision): changes the rule "being added is membership"; left for Ricardo.

- **Problem** — A row created by `addMemberByEmail` or `createGroupWithMembers` is linked to the account that owns that address on its next page visit. `claimGroupMembershipsByEmail` runs `updateMany({ where: { userId: null, email }, data: { userId } })` (`lib/groupMembership.ts:16-19`) with no accept step. The person then sees the group name, description, roster and any session join links (`page.tsx:130-155`). The only exit is `leaveGroup` (:1115), which does not stop the owner re-adding them. `duplicateGroup` (:1071-1105) also copies members into a new group without telling them.
- **Implication** — Anyone can attach another person to a group with an arbitrary name and description, a harassment and phishing surface that rides on the same email list as F-grupos-1. Legitimate use is also affected, because a teacher's students who left cannot stay out. Trust and security.
- **Fix** — Treat a first link as an invitation. The group appears for the invitee with "Aceptar / Rechazar", and rejecting hides it. The owner sees "pendiente" and cannot see a rejected invitee's account state. A person who rejected is not silently re-linked by a later add or by `duplicateGroup`. **Acceptance:** an existing-account invitee does not see roster or join links until they accept; a rejection survives a re-add; the owner roster shows pending versus joined. **Size:** M (needs a status column; the spec states "being added is membership", so this changes that rule).
- **Native** — The accept screen must be reachable from the invitation deep link, and an offline accept should be queued or refused clearly, never shown as done.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — brushes the "Linking is by trigger or claim on every page load" invariant. The fix changes what linking means. The `handle_new_user` trigger must still link at signup, with the pending state set there.

### F-grupos-5 · A double click on "Crear e invitar" can create two groups and send two blasts · severity: P2 · status: new

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — After a successful create with emails, `CreateGroupDialog` shows a summary and delays the redirect by 1.4 s (`components/groups/CreateGroupDialog.tsx:132-136` `setTimeout(... 1400)`). The transition has already ended, so `pending` is false and the submit button is enabled again (`disabled={pending || !name.trim()}`). The server has no idempotency key and no unique name (`groups.ts:416-430`), so a second click creates another group and sends every invitation again.
- **Implication** — Recipients get duplicate invitations, and the owner has two groups to clean up. It is likely on a slow connection, where people tap twice. Trust and robustness.
- **Fix** — Keep the form locked from submit until navigation, and add a client-generated key per create so a replay returns the stored group instead of making a new one. **Acceptance:** two submits within 2 s produce one group and one email per recipient; the button stays disabled until the redirect. **Size:** S.
- **Native** — In a WebView a slow cellular request makes this more likely; the key must survive an app resume mid-request.
- **Confidence** — verified-in-code for the enabled button; needs-runtime-check for the duplicate (submit twice with Resend unset and count groups).
- **Kim?** — no.
- **Invariant check** — none touched.

### F-grupos-6 · The session invite in a group email sends people to the guest path, and its target is unchecked · severity: P2 · status: new

**Fixed in S8-11** (PR pending): `groupSessionInviteUrl` sends linked members straight to `/join/[token]` and unlinked recipients through login with the join as `next`; `sendGroupEmail` and `notifyGroupOfSession` reject sessions that are not active group sessions of the caller with `invalid_input` (T7). The C8 timing question stays open: `TODO(C8)`.

- **Problem** — `notifyGroupOfSession` deliberately routes unlinked members through login "so handle_new_user links them" (comments at :782-786; URL at :904-908). `sendGroupEmail` with a session sends every member, linked or not, straight to `/join/<token>` (:742). That page offers "continue as guest" as the primary action and login as a "subtle fallback" (`app/[locale]/join/[token]/page.tsx:59-90`). The server also accepts any owned session: it checks only `createdBy` (:678-684), not `isGroup` or `status`. `joinViaToken` has no `isGroup` check either (`app/actions/community.ts:324-388`). The composer filters to draft/active group sessions only in the UI (`page.tsx:277`).
- **Implication** — A student with no account who follows the group email cups as an anonymous guest, so the session does not show in their account until they run the claim flow, and the group page cannot attribute the work to them. An owner who targets a closed or solo session sends a link that fails or enrolls people in a solo session.
- **Fix** — Use the same per-recipient URL rule in both senders (login with `next=` for unlinked, direct for linked and signed in). Reject sessions that are not active group sessions in both actions. **Acceptance:** an email for an unlinked member opens login with the join as `next`; a closed or solo `sessionId` returns `invalid_input`. **Size:** S.
- **Native** — The universal link must open the app, and `next=` must survive the OAuth/magic-link round trip in a WebView.
- **Confidence** — verified-in-code; needs-runtime-check for how the guest-first page reads on a phone.
- **Kim?** — yes, see K-grupos-2.
- **Invariant check** — respects guest scope; does not touch the one close routine.

### F-grupos-7 · No rate-limit handling, retry, delivery record or clean logs for group email · severity: P2 · status: confirms-board(Resend rechaza ráfagas (429) y no hay reintento ni registro) + confirms-board(Los logs guardan las direcciones de correo de los destinatarios)

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `runChunked(prepared, 20, …)` fires 20 parallel Resend calls per batch (`groups.ts:309`, :749, :921). `sendEmail` makes one attempt and maps a non-2xx to `failed` (`lib/email.ts:87-93`), with no retry, backoff or idempotency key. Nothing is stored per recipient. The close email has a ledger (`lib/closeEmail.ts`, `close_email_deliveries`); group email has none. Failures log the full address and the Resend body through `console.warn` (`groups.ts:316-323`, :755-762, :927-934), against the log rule in CLAUDE.md and `lib/log.ts:7-10`.
- **Implication** — A 50-person invite can end with a block of "failed" rows the owner can only fix by resending to everyone (duplicates) or one by one. Addresses sit in Vercel Logs. Robustness and privacy.
- **Fix** — One shared sender with low concurrency, backoff on 429/5xx and a per-message/recipient idempotency key. Outcomes recorded like the close-email ledger, with "reintentar fallidos". Logs go through `lib/log` with ids and codes only. **Acceptance:** retry resends only failed rows; no recipient gets the same broadcast twice; no email string appears in logs. **Size:** L (ledger table, migration, and the owner-visible trace in P26).
- **Native** — n/a.
- **Confidence** — verified-in-code; needs-runtime-check for Resend's real limit.
- **Kim?** — no.
- **Invariant check** — mirrors the close-email ledger pattern; it does not touch `closeSessionInternal`. A new table needs a migration and RLS (documented as manual steps).

### F-grupos-8 · Email links come from request headers, carry the address in the URL, and have no unsubscribe · severity: P3 · status: confirms-board(Enlaces del correo salen de cabeceras y llevan el correo en la URL) + confirms-board(Correos de grupo sin baja ni cabecera List-Unsubscribe)

**Fixed in S8-14 (links half): no outbound URL carries the recipient address (`groups.ts` invitation + `groupSessionInviteUrl`), and every origin comes from `trustedRequestOrigin()` since S8-03/S8-06. Fixed in S8-20 (unsubscribe half): signed one-click unsubscribe per group (`/api/groups/unsubscribe`), `List-Unsubscribe` headers + footer on every group mail, opt-out honoured in the plan step. F-grupos-8 fully fixed.**

- **Problem** — `getOrigin()` takes `Origin` or `Host` from the request (`groups.ts:26-32`; same in `app/actions/auth.ts:7-13`), so an invite sent from a preview deployment links to the preview. The invitation URL embeds `?email=<address>` (`groups.ts:293-295`, and :906-908). No group email has an unsubscribe link or `List-Unsubscribe` header (`lib/email.ts:64-69` builds no headers). `lib/insightsDigestEmail.ts:286` already uses `NEXT_PUBLIC_SITE_URL`, which is the model to follow.
- **Implication** — Wrong-host links on previews, addresses in browser history and referrers, and complaints that reach the sender's reputation because recipients cannot opt out. Trust.
- **Fix** — One `siteUrl()` helper from `NEXT_PUBLIC_SITE_URL` (required in production by `lib/env.ts`), no address in outbound URLs (prefill from a short-lived signed token or drop it), and a one-click unsubscribe per group with the headers on all three templates. **Acceptance:** a preview send links to the configured site; no outbound URL contains the recipient; unsubscribing stops later sends for that group. **Size:** M.
- **Native** — Links must be universal/app links; the unsubscribe page must work outside the app.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

### F-grupos-9 · Group actions break the error contract, so failures read as one generic message · severity: P3 · status: new

**Fixed in S8-14: `updateGroup`, `addMemberByEmail`, `addMemberByUserId`, `removeMember`, `updateMemberDisplayName`, `resendInvitation` and `createGroupPost` return `ActionResult` via `run()`; `group_full`, `invalid_email` and `offline` are new `errors.codes`; the clients use `useActionFeedback`; member removal uses `ConfirmDialog` naming the person (no `window.confirm` left under `components/groups`, tested). `deleteGroup`/`leaveGroup` keep throwing (wrapped by `ConfirmDialog`)**

- **Problem** — `updateGroup`, `deleteGroup`, `addMemberByEmail`, `addMemberByUserId`, `removeMember`, `updateMemberDisplayName`, `resendInvitation`, `leaveGroup`, `createGroupPost` and `notifyGroupOfSession` throw plain errors, while CLAUDE.md requires interactive actions to return `ActionResult` via `run()`. Callers catch everything and show `errorGeneric` (e.g. `components/groups/MemberList.tsx:49-53`, `AddByEmailForm.tsx:56-58`, `QuickAddCoCuppers.tsx:33-35`). A full group (`group_full`), a bad address (`invalid_email`) and an offline phone all show the same text. Member removal uses a blocking `window.confirm` with no name (`MemberList.tsx:44`, copy "¿Quitar a esta persona del grupo?"), while delete-group and leave use the shared `ConfirmDialog`.
- **Implication** — The owner cannot tell whether to retry, fix the address or wait for signal, and an offline cupping room is the normal case. Friction and native-readiness.
- **Fix** — Convert these actions to `run()` and surface the localized `errors.codes` copy through `useActionFeedback`, including an "estás sin conexión" case. Replace `window.confirm` with the shared `ConfirmDialog` naming the person. **Acceptance:** `group_full` and `invalid_email` each show their own message; remove names the person; no blocking native confirm. **Size:** M.
- **Native** — `window.confirm` behaves differently in a WebView shell, so the shared dialog also removes that risk.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — this restores the ActionResult contract; `leaveGroup`/`deleteGroup` may stay throwing only if wrapped by `ConfirmDialog` as the contract allows.

### F-grupos-10 · Every member sees the full roster, with a partly readable email · severity: P3 · status: new

**Partly addressed in S8-14: the D7 default (a) stays; the member view already uses `memberLabel` (name, else `j***` for a linked member, else `j***@domain`) since S8-03, now covered by `tests/maskEmail.test.ts`. `// TODO(D7)` marks the member view for the roster-visibility setting if Kim answers (b) or (c)**

- **Problem** — The member view lists every member by display name, else `maskEmail(m.email)` (`page.tsx:220-223`), and `maskEmail` keeps the first letter and the whole domain (:32-38). Members also see the owner name and every group session with a join link (:130-155, :173-175).
- **Implication** — In a small group on a company or school domain the mask still identifies people; for a class, students may not want peers to see each other. Privacy, with a cupping-practice angle.
- **Fix** — Decide the rule first (K-grupos-1). Then either show members only names the owner chose, or let the owner switch roster visibility off. **Acceptance:** per the answer; at minimum the mask hides most of the local part. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — yes, see K-grupos-1.
- **Invariant check** — none touched; the results anonymity rule is separate and unchanged.

## 4. Keep — works well

- Every owner action re-checks `createdBy` against the database row, and post actions check through the group (`app/actions/groups.ts:92-98`, :1021-1027). Keep this as the pattern; do not rely on hidden buttons.
- Co-cupper ids are resolved to an email only after `isCoCupper` / `coCupperIdsAmong` (`groups.ts:167`, :376); stale ids are dropped silently.
- `addMemberByEmail` never nulls an existing `userId` on re-add (:523-525), and re-adds are upserts on `(groupId, email)`; the 200-member cap is checked before insert (:511-512).
- `sendGroupEmail` and `notifyGroupOfSession` independently verify the session belongs to the caller (`groups.ts:678-684`, :849-855), and invite tokens are reused through one rule (`resolveOrCreateSessionInvite`, :55-77), mirrored on the page (`page.tsx:148-154`).
- `leaveGroup` is member-only, self-scoped and refuses the owner (`groups.ts:1115-1135`); `deleteGroup` copy states what is lost and what survives (messages `groups.confirmDelete`).
- Group page is `force-dynamic` with the owner-or-linked-member gate and 404 otherwise (`page.tsx:28`, :70-81). The auth callback rejects other origins for `next` (`app/auth/callback/route.ts:13-22`).
- `duplicateGroup` copies the roster without sending invitations (`groups.ts:1071`); linked members' emails are masked on the owner roster (`page.tsx:472`); list pages use `generateStaticParams` only where `[locale]` is the sole segment.

## 5. Not verified

- Whether an anonymous session can call these actions by direct POST: needs one anonymous session and a `curl` with the `Next-Action` header against a preview.
- Real Resend rate-limit behaviour at 20 parallel sends: send to a 50-address test list on a preview with a real key.
- That `handle_new_user` Phase 8b is applied in the live database (the code path in `claimGroupMembershipsByEmail` covers existing accounts only): ask Ricardo or read the function in the Supabase SQL editor.
- How `window.confirm`, `mailto`-free copy and app-link opening behave in a Capacitor shell: needs a device build.
- Whether `Origin`/`Host` headers can be forged to point email links elsewhere: Next's action origin check should block it, which is untested here.
- Whether the member view is cached by the service worker and shows a stale roster after a removal: open it offline after a removal.

## 6. Questions for Kim (collected)

- **K-grupos-1** — En un grupo (una clase o un laboratorio), ¿los participantes deben poder ver quién más está en el grupo? Opciones: (a) sí, todos ven nombres; (b) sí, pero solo los nombres que el maestro decide mostrar; (c) no, solo el maestro ve la lista. Hoy todos ven la lista con el correo parcialmente tapado.
- **K-grupos-2** — Cuando el maestro crea una cata para su grupo, ¿prefiere que el aviso por correo salga de inmediato, o solo cuando él inicia la cata? Hoy sale al crearla, y la cata puede empezar horas o días después. Opciones: (a) al crear; (b) al iniciar; (c) que el maestro elija cada vez.

## 7. Verification log

F-grupos-1 — CONFIRMED — `requireUser` (`lib/auth.ts:5-10`) never checks `is_anonymous`; all six actions stop there (`groups.ts:353,491,656,836,963,1182`); recipients are free-text addresses from the caller; grep finds no rate or limit logic in `groups.ts` or `lib/email.ts`. That a direct action POST from a guest passes `proxy.ts` is not proven here (one anonymous session plus a `Next-Action` curl settles it). Any registered account has the same unlimited reach, so the guest check alone is not enough. Related, not duplicate: F-entrar-6 and F-landing-2 (unauthenticated sends, same shared Resend quota). The fix respects guest scope. — severity: keep (P1; sender-reputation damage would also break magic links)
F-grupos-2 — CONFIRMED — `PostComposer.tsx:29` defaults to true; the result is ignored (:51-57); failures only `console.warn` (`groups.ts:1001`). — severity: keep
F-grupos-3 — CONFIRMED — the live address is resolved via the admin client and returned in `results` (`groups.ts:722-764`, 880-945) and rendered raw at `GroupEmailComposer.tsx:165`, while the group page masks (`page.tsx:472`). It bypasses the co-cupper masking invariant; only the group owner sees it. — severity: keep
F-grupos-4 — CONFIRMED — `claimGroupMembershipsByEmail` links with no accept step (`groupMembership.ts:16-19`); `duplicateGroup` copies members (`groups.ts:1071-1105`). The board spec states "being added is membership", so this is a product decision that changes a rule, and the harm (unsolicited group name/roster) overlaps the email abuse of F-grupos-1. — severity: → P3
F-grupos-5 — CONFIRMED (premise corrected) — the button is re-enabled during the 1.4 s redirect delay (`CreateGroupDialog.tsx:132-136,265`) and the server has no idempotency (`groups.ts:416-430`). But taps during the in-flight request are blocked by `pending`, so the "double tap on a slow connection" scenario does not occur; it needs a deliberate second click after the success summary, and only when emails were sent. — severity: → P3
F-grupos-6 — CONFIRMED — `sendGroupEmail` sends `/join/<token>` to everyone (`groups.ts:742`) while `notifyGroupOfSession` routes unlinked members via login (:904-908); the join page leads with guest (`join/[token]/page.tsx:59-90`); the session check is `createdBy` only (:678-684) and the composer filters closed/solo sessions only in the UI (`page.tsx:277`). How the guest-first page reads on a phone is not code-provable. — severity: keep
F-grupos-7 — PLAUSIBLE — verified: 20-way parallel sends (`runChunked`, `groups.ts:35-48,309,749,921`), a single attempt without retry (`lib/email.ts:87-93`), no ledger, addresses in `console.warn` (:316-323,755-762,927-934) against `lib/log.ts:7-10`. Whether Resend returns 429 at 20 parallel requests depends on the account's rate limit; check the Resend plan limit or send a 50-address test to a sandbox domain. — severity: keep
P3 notes: F-grupos-8 to F-grupos-10 were not re-verified in detail; no wrong citations or duplicates spotted.
