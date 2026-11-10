# S8-11 — Live group sessions that hold up

> **When:** after S8-10 (reuses its latest-invite lookup and `ActionResult` conversions) and S8-01 (RLS); before S8-13 · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** one Prisma `migrate deploy` BEFORE the deploy, one SQL PHASE block (only if step 9 ships) applied in the Supabase editor; answers C4, C5, C8 (defaults built)
> **Findings:** 9 (0 P1 · 3 P2 · 6 P3) from `docs/audits/flows-2026-11/08-grupal-en-vivo.md, 09-grupal-asincrona.md, 13-grupos.md` · **Gated on Kim:** C4, C5, C8

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change you
make must map to a finding id and respect that audit's "Keep — works well" list. Theme: the live group
session from invite to "Iniciar cata": what /join decides, what the owner's counter says, how a waiting phone
recovers, what the server refuses before the start, how invites are controlled, and where group emails send
people. Invariants in play: authz only via lib/sessionAuth.ts, `joinViaToken` stays pure Prisma and
transactional on maxUses, `checkSessionStarted` stays boolean, `ActionResult` for interactive actions, offline
replay answers "pending" (never "discarded") for not-started. Out of scope: close-with-drafts (S8-05), RLS (S8-01), guest orphans (S8-07), results visibility C5.
Delegation: Sonnet may do the pure helpers + tests (steps 1, 2, 7) and copy; the lead keeps steps 4-6, 9. Work the plan in order, one commit per step, `npx tsc --noEmit && npm run lint && npm test`
before each commit, update docs/flows.md in the same PR, and finish with the Definition of done checklist in
the PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-grupal-3 | P2 | CONFIRMED | `/join` ignores status and membership; closed link creates a guest then fails (`join/[token]/page.tsx:33-36`, `GuestJoinForm.tsx:41,59`) | `08-grupal-en-vivo.md` |
| F-grupal-4 | P2 | CONFIRMED | "Enviados" counts events, seeded once (`CupClient.tsx:391,822`, `cup/page.tsx:98-106,168`) | same |
| F-grupos-6 | P2 | CONFIRMED | Group-email link sends all to guest-first `/join` (`groups.ts:678-684,742,904-908`) | `13-grupos.md` |
| F-grupal-5 | P3 | PLAUSIBLE | Waiting room never refetches on resume (`WaitingRoomClient.tsx:277-296`) | `08-grupal-en-vivo.md` |
| F-grupal-7 | P3 | CONFIRMED | Start not enforced server-side (`sessions.ts:561-593`). README also lists it under S8-01: skip if landed | same |
| F-grupal-9 | P3 | CONFIRMED | Invites cannot be revoked; each "Invitar" mints one (`CupClient.tsx:1307`) | same |
| F-grupal-10 | P3 | CONFIRMED | No late-joiner rule or "cerrar entradas" (`community.ts:324-388`) | same |
| F-grupal-asincrona-5 | P3 | CONFIRMED | `sessionHref` sends unstarted async sessions to `/waiting` (`lib/sessionRouting.ts:24`) | `09-grupal-asincrona.md` |
| F-grupos-4 | P3 | CONFIRMED | Added by email = member without consent (`lib/groupMembership.ts:16-19`) | `13-grupos.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| C4 | Late joiner: cups everything, only what is missing, or cannot enter? Close entries? | (a) cups everything + owner can close entries | Build (a): `entriesLocked` toggle + one-line rule; no per-sample cut-off |
| C5 | When do participants see the group score? | (a) only at close | No step: the matching finding (F-grupal-asincrona-6) was REJECTED; do not touch `canViewGroupResults`. Flag to Ricardo |
| C8 | Group email: at creation or at start? | (b) at start | Live sessions notify from `startSession`; async (never started) still at creation |

## 4. Plan

1. **`/join` applies the join rules** — extract a pure `evaluateJoin({ invite, session, viewer })` (`lib/joinRules.ts`) returning `redirect(dest) | closed | expired | exhausted | entries_closed | invalid`, mirroring `joinViaToken`: owner or existing member goes straight to `/cup` or `/waiting` (via `sessionHref`) even when the link is exhausted; a newcomer to a closed session sees a closed message and NO anonymous sign-in is attempted; each state has its own es/en copy. `joinViaToken` also refuses non-group sessions (`invalid_input`). Guest form posts through an `ActionResult` wrapper like `joinSessionForm`. Invariant: guest scope, `run()` contract. Covers: F-grupal-3.
2. **Honest "enviados"** — numerator = distinct non-excluded cuppers with a submitted evaluation for EVERY sample; denominator = joined non-excluded participants including the owner; label says which ("3 de 5 enviaron todo"). Pure `lib/submitProgress.ts`; `CupClient` holds a `Map<cupperId, sampleIds>` from realtime payloads (no `+1`), re-seeds from props on each 30 s `router.refresh()`, on every `SUBSCRIBED` and on `visibilitychange`. Autosave of an already-submitted row never moves it. Covers: F-grupal-4.
3. **Waiting-room resume** — one `refetchState()` calling `getWaitingState` (keeps `checkSessionStarted` boolean) on every `SUBSCRIBED`, `visibilitychange` to visible, `pageshow` and `online`; the 15 s poll gets ±3 s jitter; act on `startedAt`/`warmupStartedAt` exactly as the live handler does. Invariant: realtime edge-detection stays. Covers: F-grupal-5.
4. **Server-side start check** — new `ActionErrorCode` `session_not_started` (es/en under `errors.codes`). `upsertEvaluation`, `submitAllEvaluations` and offline `syncEvaluation` throw it for a NON-owner on a live (`isGroup && !isAsync`) session with `startedAt` null, reading `startedAt` from `requireSessionMember`/`requireSample*`. Offline replay maps it to "pending". Test in `tests/actionsAndState.test.ts`. Covers: F-grupal-7.
5. **Invite control (migration)** — `SessionInvite.active Boolean @default(true)`. `createInviteToken` returns the latest active, unexpired token (reuse `getLatestInvite` from S8-10; create it if absent) unless `regenerate: true`, which deactivates earlier tokens in one transaction. `joinViaToken`, `/join` and print page ignore inactive tokens (`token_expired` copy). Master panel "Invitar" shows the existing link and a confirm-guarded "Regenerar enlace". Files: `schema.prisma` + migration, `community.ts`, `CupClient.tsx`, `print/page.tsx`. Covers: F-grupal-9.
6. **Late joiners (C4 default)** — `CuppingSession.entriesLocked Boolean @default(false)` in the same migration; `setEntriesLocked(sessionId, locked)` owner-only (`requireSessionOwner` + `assertSessionWritable`, `run()`); `joinViaToken` refuses NEWCOMERS with `entries_closed` (members re-enter); `/join` shows the rule to a latecomer on a started session ("Puedes catar todas las muestras"). Toggle in the master panel. Covers: F-grupal-10.
7. **Async routing** — add `isAsync` to `SessionRouteInfo`; unstarted async goes to `/cup`, live unstarted to `/waiting`. Update the five callers. Test: matrix in `tests/sessionRouting.test.ts`. Invariant: every list link via `sessionHref`. Covers: F-grupal-asincrona-5.
8. **Group email link target** — pure `groupSessionInviteUrl({ linked, token, locale, origin })` (extend `lib/inviteUrl.ts`): linked or signed-in members go direct, unlinked go through login with the join as `next`. Use it in both `sendGroupEmail` (`groups.ts:742`) and `notifyGroupOfSession` (`:904-908`); both reject sessions that are not active group sessions owned by the caller with `invalid_input`. C8 default: live sessions notify from `startSession`, async at creation (move the call at `sessions.ts:536`). Covers: F-grupos-6.
9. **Consent for group membership (cut line: split to a follow-up PR if the migration grows)** — `TastingGroupMember.status` (`pending | accepted | declined`, default `accepted` for existing rows). The claim at `lib/groupMembership.ts:16-19` and the `handle_new_user` link set `pending`; the group page shows Aceptar/Rechazar and withholds roster and join links until accepted; the owner sees "pendiente"; `declined` survives re-add and `duplicateGroup`. Changes the rule "being added is membership": confirm with Ricardo first. SQL for `handle_new_user` goes in a PHASE block plus runbook section. Covers: F-grupos-4.

## 5. Acceptance (tests to write or checks to run)

- F-grupal-3: a closed link as visitor creates no anonymous user; a member with an exhausted link lands in `/cup` or `/waiting`; each state has distinct copy in es and en.
- F-grupal-4: one participant submitting 6 samples moves the counter by 1; autosaves do not move it; after reconnect it equals the server value.
- F-grupal-5: start while a phone is locked, unlock, reaches `/cup` within 3 s untouched; start during the subscribe gap still moves the participant.
- F-grupal-7: pre-start participant call returns `session_not_started`; owner and async unaffected; offline replay stays pending.
- F-grupal-9/10: opening "Invitar" twice shows one token; after "Regenerar" the old link shows expired; with entries closed a new scan is refused, members re-enter, toggle is owner-only.
- F-grupal-asincrona-5: matrix test; async lands on `/cup` from list, dashboard, profile and group page.
- F-grupos-6: unlinked recipient's email opens login with the join as `next`; a closed or solo `sessionId` returns `invalid_input`.
- F-grupos-4: existing-account invitee sees no roster or links until accepting; a rejection survives re-add.
- Keep list: owner re-opening own link is a no-op, `maxUses` still race-proof.

## 6. Manual steps for Ricardo

- Run `prisma migrate deploy` from the right checkout BEFORE deploying (columns `active`, `entriesLocked`, member `status`). Apply the PHASE block for `handle_new_user` only if step 9 ships; runbook section in the same PR.

## 7. Risks and rollback

- C8 email moves to start: async still emails at creation. New columns have safe defaults, so rollback is a code revert.

## 8. Native-readiness clause

- `/join` decides identically for a universal link and `next=` after OAuth; counter and waiting room also refetch on Capacitor `appStateChange`; the printed QR stays valid until "Regenerar"; the accept screen opens from the invitation deep link.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/joinRules.test.ts`, `submitProgress.test.ts`, `sessionRouting.test.ts`, `actionsAndState.test.ts`)
- [ ] docs/flows.md updated; audit files get `Fixed in S8-11 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for /join states, master panel, waiting room
- [ ] gated items either done or left as named TODOs (C5, step 9 if split) in the PR description
