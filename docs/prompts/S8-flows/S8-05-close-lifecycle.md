# S8-05 — Closing a session safely

> **When:** after S8-04 (it adds `lib/aggregates.ts` and the call inside `closeSessionInternal`) and S8-01 (server-side `closesAt` guard — verify first) · **Where:** new session, worktree off `main`, one PR · **Needs from Ricardo:** answers C1, C2, C3 (C7 optional); `prisma migrate deploy` BEFORE the deploy (runbook §13); no SQL
> **Findings:** 11 (1 P1 · 7 P2 · 3 P3) from `docs/audits/flows-2026-11/` files 05, 07, 08, 09, 11, 15 · **Gated on Kim:** C1, C2, C3, C7

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change
you make must map to a finding id and respect that audit's "Keep — works well" list. Theme: what happens to
unsent work, deadlines and half-finished closes. There is ONE close routine, `closeSessionInternal` in
lib/closeSession.ts, and nothing else may write `status: "closed"`; every repair, promotion or reminder
lives inside it or beside it, never as a second closer. Closed stays read-only. One invariant is bent on
purpose: CLAUDE.md says solo has no manual close; step 6 adds a manual "Terminar cata" because a quick
session with fewer cupped samples than created otherwise never closes (F-express-1) — it prunes unopened
samples and then reuses the same close routine, so the rule "close goes through closeSessionInternal"
holds; record the bend in docs/flows.md §1 and the CLAUDE.md note. Out of scope: reopening a closed session
(C9), the offline store mechanics (S8-09), auto-closing live sessions. The lead (Fable) owns the migration,
closeSession.ts and the draft-policy rule; Sonnet may do the dialogs, notices, emails and i18n; Haiku the
docs lines. Where Kim has not answered, implement her default and keep the alternative behind a named
constant in lib/closeRules.ts. Work the plan in order, one commit per step, `npx tsc --noEmit && npm run
lint && npm test` before each commit, update docs/flows.md in the same PR, and finish with the Definition
of done checklist in the PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-offline-1 | P1 | CONFIRMED | Replay answers `discarded` on a closed session (`app/actions/offline.ts:48`) and the client shows it as synced (`hooks/useOfflineSync.ts:83`) | `15-offline-sync.md` |
| F-grupal-2 | P2 | CONFIRMED (owner of the core) | Close ignores unsent drafts; dialog says nothing (`messages/es.json:501`) | `08-grupal-en-vivo.md` |
| F-grupal-asincrona-1 | P2 (was P1) | CONFIRMED (core dup of F-grupal-2) | Cron close drops complete-but-unsent work; the "discarded shown as green synced" half is unique | `09-grupal-asincrona.md` |
| F-grupal-asincrona-3 | P2 | CONFIRMED | Participants never see `closesAt` (cup, waiting, join, list) | `09-grupal-asincrona.md` |
| F-grupal-asincrona-4 | P2 | CONFIRMED | Closing date is a UTC day (`lib/validate.ts:79`, `NewSessionForm.tsx:271,1220`, `edit/page.tsx:130`) | `09-grupal-asincrona.md` |
| F-grupal-asincrona-7 | P2 | PLAUSIBLE (dup of F-solo-1) | Failed post-flip steps are never retried; cron adds truncation and no alert | `09-grupal-asincrona.md` |
| F-solo-1 | P2 | PLAUSIBLE (owner) | Close that throws after the flip cannot be retried: resubmit hits `session_closed` (`community.ts:25`) | `07-sesion-solo.md` |
| F-express-1 | P2 | CONFIRMED | Solo session with fewer cupped than created samples never closes (`community.ts:77`) | `05-catar-ahora.md` |
| F-solo-3 | P3 (was P2) | CONFIRMED | "Enviar de todos modos" either closes irreversibly or silently does not close | `07-sesion-solo.md` |
| F-grupal-8 | P3 | CONFIRMED | A forgotten live session never closes or warns (`close-expired-sessions/route.ts:29`) | `08-grupal-en-vivo.md` |
| F-sesiones-12 | P3 | needs-runtime-check | Adding a closing date silently makes a live cupping asynchronous | `11-editar-administrar.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| C1 | Close with unsent notes: (a) count them if complete and tell that person · (b) leave them out but warn clearly before (day before for async) and after · (c) block closing until all send or the owner confirms · (d) keep them apart and the owner decides | (b) + (d) | Build (b): exclude, warn, notify. Keep the drafts in the database (they already are); the owner "accept late contribution" action of (d) is a named TODO because it is a post-close write. Policy constant `DRAFT_AT_CLOSE = "exclude"`; (a) is `"promote_complete"`, implemented inside `closeSessionInternal` before the flip, off by default |
| C2 | Solo with samples left unscored: (a) allow closing, those samples stay unscored · (b) allow submit but keep open · (c) require everything. Correct after closing: yes/no | (a), and no | "Terminar cata" prunes unopened samples, keeps partial ones without a score; no post-close editing |
| C3 | Forgotten live session: (a) email reminder at 12 h, never close · (b) 24 h reminder, auto-close at 7 days · (c) as now | (a) | One ledgered reminder at 12 h of inactivity, never a close |
| C7 | Live sessions with a closing date: (a) only self-paced, live closes by hand · (b) both | (a) | Ship the consequence notice only; separating `isAsync` from `closesAt` is a named TODO |

## 4. Plan

1. **Migration (the one for this prompt).** `CuppingSession.closesAtZone String?` (IANA name), `CuppingSession.closeFinalizedAt DateTime? @db.Timestamptz(3)` (backfill `= closedAt` for already-closed rows inside the migration so the repair pass ignores history), and table `session_reminder_deliveries` (`sessionId`, `userId`, `kind` = `"deadline_24h" | "live_idle"`, `sentAt`, `@@id([sessionId, userId, kind])`, FK cascade). Add the new user FK to `mergeGuestData` (guests have no email, so no rows, but the rule is "every user FK"). Files: `prisma/schema.prisma`, `prisma/migrations/…`, `lib/guestClaim.ts`. Runbook §11.

2. **Idempotent two-phase close.** In `lib/closeSession.ts` split into phase 1 (the existing guarded `updateMany` flip) and phase 2 `finalizeClosedSession(sessionId)`: reveal, `refireAggregates` (from S8-04), `syncCoffeeHistoryForSession`, queue emails via the ledger, then stamp `closeFinalizedAt`. `closeSessionInternal` always calls phase 2 when the flip happened OR `closeFinalizedAt` is null (a second call on a finalized session stays a no-op, nothing re-emailed — the ledger already skips sent recipients). Cron: add a bounded repair pass (`BATCH = 25`) for sessions closed over 5 minutes ago with `closeFinalizedAt` null, plus an error-level `logError` line per failure (`lib/log.ts`) that Vercel log search can alert on; log `truncated` when the active batch is full. `submitAllEvaluations`: if the session is closed, not finalized and the caller is the solo owner, run phase 2 and return ok instead of throwing `session_closed`; the client never shows a second submit's `session_closed` as its own failure. Invariant: still the only writer of `closed`. Covers: F-solo-1, F-grupal-asincrona-7.

3. **Unsent work at close.** New pure `lib/closeRules.ts` (`countUnsentComplete(evaluations)`, `DRAFT_AT_CLOSE`), tested in `tests/closeRules.test.ts`. `ConfirmDialog` on the owner "Cerrar" shows "N catadores tienen notas sin enviar" and states the rule in one sentence (also in the close email); a `getCloseImpact(sessionId)` owner-only read, no new action surface. With `promote_complete` the promotion runs inside `closeSessionInternal` before the flip, using the same `computeEvaluationDerived` path; never after. Covers: F-grupal-2, F-grupal-asincrona-1.

4. **Participant notice after close and honest offline replay.** `syncEvaluation` (and the physical/extrinsic replay) return a distinct `"closed"` outcome instead of `discarded` and write nothing. `useOfflineSync` stops mapping it to `synced`: the module becomes `closed_unsent` (new `SyncStatus` in `lib/offline/types.ts`, kept in IndexedDB, read-only, counted by `PendingDraftsBadge`, shown in a persistent notice naming the session and count with view/copy). Nothing is deleted without confirmation. A cupper redirected at close, or resuming a backgrounded phone, sees one explanatory notice on `/results` saying whether their unsent notes counted (`cup/page.tsx` redirect carries `?closed=1`). S8-09 later generalises the store statuses; this step only adds `closed_unsent`. Covers: F-offline-1, F-grupal-asincrona-1.

5. **Deadline: stored zone, shown to everyone.** Store the owner's IANA zone (`closesAtZone`, from `Intl.DateTimeFormat().resolvedOptions().timeZone` posted with the form and whitelist-validated), not a numeric offset: an offset is wrong across daylight-saving changes and a WebView can report a different offset than the OS, while a zone name reproduces "end of the owner's day" at any date. One zone-aware helper `endOfDayInZone(date, zone)` replaces `dateOnlyEndOfDay` in `validate.ts`, `planClosesAtChange`, `NewSessionForm.tsx`, `EditSessionForm.tsx` and `edit/page.tsx` (min date and read-back use the zone; "today" is valid until 23:59 local). Tests for UTC−5, UTC−3, UTC+1 and a DST edge. Show the deadline to participants on the join confirmation, async waiting screen, cup header and list row, in the owner's zone with the viewer's local time beside it when they differ, a stronger state in the last 24 h, no banner without a date; owner edits show on next open. Enforce it: extend `assertSessionWritable` to take `{ status, closesAt }` and throw `session_closed` once `closesAt` has passed (verify against S8-01 first; implement only what is missing). The cron keeps closing at D+1 ~06:00 UTC; writes stop at the local deadline. 24 h before the deadline the cron sends one ledgered reminder to members with unsent work (`deadline_24h`). Update `docs/flows.md` and the CLAUDE.md `closesAt` note. Covers: F-grupal-asincrona-3, F-grupal-asincrona-4.

6. **Manual "Terminar cata" for solo and express (the bent rule).** `finishSoloSession(sessionId)` (`run()`, `requireSessionOwner`, `assertSessionWritable`, solo only): submit the owner's complete drafts, remove only evaluation-less samples (`removeSessionSample` rules), then `closeSessionInternal({ reason: "owner", emails: "skip" })`. Surfaces: the submit-guard dialog ("Terminar con las N que catié") and a button on the results notice. The guard copy states the outcome beforehand ("esto cierra la cata y ya no se podrá editar" versus "quedará abierta"); after a submit that did not close, `ResultsClient` shows "faltan N muestras · seguir catando · Terminar cata". Samples with any evaluation are never removed; group sessions never see it. Covers: F-express-1, F-solo-3.

7. **Forgotten live sessions: remind, never close.** Cron pass finds `isGroup`, `!isAsync`, `closesAt` null, active sessions whose last evaluation or start is older than the C3 window (default 12 h), emails the owner once (`live_idle` ledger row, link to the master panel). A second run sends nothing; closing stops it. Never writes `closed`. Covers: F-grupal-8.

8. **Closing date consequence.** Next to the date field and on save of an unstarted live session: "pasará a cata a tu ritmo, sin sala de espera ni «Iniciar cata»" (es/en). Covers: F-sesiones-12.

## 5. Acceptance (tests to write or checks to run)

- F-offline-1 / F-grupal-asincrona-1: offline draft plus closed session shows the notice after reconnect, survives reload, is counted in the badge, writes nothing to the server, and never turns green.
- F-grupal-2: the dialog shows the unsent count and the rule; a redirected participant sees one notice; closing twice changes nothing.
- F-grupal-asincrona-3 / -4: a Bogotá owner picking today at 20:00 is accepted and closes after 23:59 local; the `/edit` round trip shows the picked day; participants see the date on join and `/cup`; writes after `closesAt` return `session_closed`.
- F-solo-1 / F-grupal-asincrona-7: force `syncCoffeeHistoryForSession` to throw once; the next call or cron repairs it once with no duplicate rows or emails; a healthy repeat close writes nothing.
- F-express-1 / F-solo-3: 6 created, 4 submitted, "Terminar con las 4" lands on results with 4 samples; samples with an evaluation are never removed; group never sees it; close goes through `closeSessionInternal` only.
- F-grupal-8: one owner reminder after the idle window, none on the second run, none after close.
- F-sesiones-12: the notice shows before Guardar.
- Tests: `tests/closeRules.test.ts`, `tests/closesAtZone.test.ts`, `tests/finalizeClose.test.ts` (pure parts).

## 6. Manual steps for Ricardo

- `prisma migrate deploy` BEFORE the deploy (runbook §13), from the right checkout; no Supabase SQL this time.
- Vercel: no new cron entry (extra passes run inside `close-expired-sessions`); confirm `maxDuration` still fits.

## 7. Risks and rollback

- Cron runtime: three bounded passes in one route; each pass has its own batch cap and the response reports `truncated`. Roll back by reverting the passes; the migration is additive.
- Draft policy is a behaviour change for async sessions; ship the 24 h reminder and the warnings together, not separately.
- `assertSessionWritable` signature change touches every caller; grep all and type-check.

## 8. Native-readiness clause

- Deadline times format with the device locale and show the owner's zone name (WebView `Intl` may differ from the OS). The closed notice and `closed_unsent` drafts survive process kill and resume; copy/export of kept drafts uses the shared share seam, not `<a download>`. A push reminder would need its own ledger rows (`kind`).

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (name the test files)
- [ ] docs/flows.md §1 updated (manual solo finish, two-phase close, zone-aware deadline); audit file(s) get a line `Fixed in S8-05 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for the close dialog, deadline banner, notice and "Terminar cata"
- [ ] gated items either done or left as named TODOs listed in the PR description (C1 option d accept-late action; C7 separation of `isAsync`)
