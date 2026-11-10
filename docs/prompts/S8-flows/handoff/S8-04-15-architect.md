# S8-04 to S8-15 — architect decisions (2026-11-10)

Read after the spec (`../S8-NN-*.md`) and the planner's reconciliation (`S8-NN-tasks.md`, task ids T1..Tn
are the planner's). Where this file differs from either, this file wins.

Scope rule for this round: build everything that needs no answer from Kim or from the owner. Where the
spec gives a default for a Kim question, build the default and leave the named TODO the planner lists.
Never run SQL, migrations or seeds. PRs are drafts; nothing merges.

## Base, order and numbering

- Batch 1 is stacked: `claude/s8-03-guest-guard-email-impl` contains S8-01, S8-02 and S8-03. Planner notes
  saying "the base lacks S8-01" are obsolete.
- Three chains build in parallel, each strictly in order; each spec branches from the previous one's tip:
  - X: 04 → 05 → 09
  - Y: 06 → 07 → 08 → 15
  - Z: 10 → 11 → 13 → 14
  - 12 alone, from the batch-1 tip.
- Final merge order (the branches get chained in this order afterwards): 04, 05, 09, 06, 07, 08, 15, 10,
  11, 13, 14, 12.
- Fixed numbers (do not pick your own):

| Spec | Migration folder | SQL phase | Runbook § |
|---|---|---|---|
| 04 | none | PHASE 23 | §12 |
| 05 | `20261111090000_close_lifecycle` | none | §13 |
| 09 | none | none | §14 |
| 06 | none | none | §15 |
| 07 | none | none | §16 |
| 08 | `20261111100000_waitlist_consent` | none | §17 |
| 15 | none | none | none |
| 10 | none | none | none |
| 11 | `20261111110000_invite_active_entries_locked` | none | §18 |
| 13 | none | none | none |
| 14 | `20261111120000_digest_run_status` | none | §19 |
| 12 | `20261111130000_exclusion_audit_extrinsic_edited` | none | §20 |

- Message catalogs: add new keys at the END of the object they belong to, es and en together, so the
  later chaining merges stay mechanical.

## One owner per shared piece

| Piece | Owner | Everyone else |
|---|---|---|
| `hooks/useForegroundResume.ts` + `lib/platform/resume.ts`, `useConnectivity.recheck()` | 15 | 09 builds its own small `hooks/useResume.ts` ONLY if 15's is not in its base; chaining will collapse them |
| `navigator.storage.persist()` + stale-draft age warning (`lib/platform/storage.ts`) | 15 | 09 skips that half of its T7 |
| In-app-browser hint on the login form (`lib/platform/inAppBrowser.ts`) | 15 | 06 skips its T10 |
| `signInWithGoogle` → `trustedRequestOrigin()` | 06 | 14 skips that part of its T1 |
| `signOut(locale)` | 06 | 07 adds the `scope` argument on top |
| Sign-out guard for unsynced drafts (`countDeviceOnly`) | 09 | 07's T6 does the guest-loss warning only |
| `closed` replay outcome + `closed_unsent` status | 05 | 09 extends the status machine, never redefines it |
| `invalid_warmup` copy in the wizard and edit form | 10 | 13 skips its T7 |
| Owner invite page + `getLatestInvite` | 10 | 11 moves it to `lib/invites.ts` and adds `active` |
| Synced warm-up resume + wake-lock note in the player | 13 | 15 skips its T7 |
| `assertSessionStarted` on write paths (S8-11 step 4) | S8-01 (done) | 11 skips step 4 |

## Per spec

### S8-04 (all of T1–T10)
1. `CupToggleGrid`: do NOT hide the boxes. The existing "not scored" note stays; only the scoring changes.
   `// TODO(A1)` beside the note.
2. T6 uses design (b): after the upsert, `updateMany({ where: { id, isDraft: false }, data: { isDraft: false } })`
   so only an already-submitted row re-fires the trigger. No pre-read on the hot path.
3. T7 is built (refire at close through `lib/aggregates.ts`, `import "server-only"`); `refreshAggregateScores`
   becomes a thin owner-gated wrapper.
4. PHASE 23 follows the PHASE 21 shape: header (why, pre-flight, how to verify), statements, commented
   rollback with the previous function body verbatim. The recompute statement is a separate, clearly
   marked second step, because it changes stored scores of past sessions under five cups. Add a fail-safe
   dry run as ONE `DO` statement ending in `RAISE EXCEPTION` with before/after counts, in
   `prisma/sql/dry-runs/phase23_dry_run.sql` (see `phase21_dry_run.sql` for the pattern).
5. The PR body states plainly: past community scores of sessions under five cups change once the
   recompute runs; Kim should be told before it runs.

### S8-05 (T1–T10, defaults)
1. Design A: `closeFinalizedAt` column + repair pass. The reminder ledger has NO Profile FK.
2. Offline replay: keep `syncEvaluation` returning `"discarded"` exactly as today (service-worker-cached
   bundles call it). Add NEW actions `replayEvaluation` / `replayPhysical` / `replayExtrinsic` in
   `app/actions/offline.ts` that return a status and never throw for closed/expired (`"closed"`), and move
   the hook to them.
3. `finishSoloSession`: submit only COMPLETE drafts (`lib/completeness.ts`); partial ones stay drafts
   without a score. Prune logic lives in a `lib/` function, not in a call to the `removeSessionSample` action.
4. Deadline zone: null `closesAtZone` = UTC (today's behaviour). `planClosesAtChange` no-op detection must
   become zone-aware in the same commit.
5. Reminders are system mail: own ledger, never `reserveEmailBudget`. Window `closesAt in (now, now+24h]`.
6. Not built: C1 option (d), C7, C9. Leave the planner's TODOs.

### S8-09 (T1–T8, no T9)
1. Client-only ordering (`ifUpdatedAt`), no migration.
2. Extend S8-05's `replay*` actions with `gone` / `rejected`; `not_found_or_forbidden` → `orphaned`.
3. Rekey on claim: design (a) (`{anonId}` in localStorage at `startGuestClaim`, rekey on next app mount).
4. Module-level lock so two `useOfflineSync` instances never replay at once.
5. T7: service worker cap, version bump and cache purge on user change only. Persist + age warning are 15's.
6. `SW_VERSION` bump is called out in the PR body and runbook §14.

### S8-06 (T1–T9, T11; no T10)
1. One `safeNext` in `lib/safeNext.ts`; `safeNextPath` in `lib/trustedOrigin.ts` delegates to it. Leave
   `safeClaimBack` alone.
2. T3: proxy redirect with `next` AND the per-page backstops carry `next`.
3. Confirm page lives under `[locale]`; the callback keeps accepting old-template links. The email
   templates README uses `/{{ .Data.preferred_lang }}/auth/confirm` with the default-locale fallback noted.
4. Anonymous users stay "user" in `authState`; the guest-claim chain must keep working (trace it in the PR).
5. No expiry number in copy. Support address reuses the one in `LandingFooter`.

### S8-07 (T1–T9 only)
1. `deleteAccount` (T10) is NOT built: it is destructive, needs a tombstone design and owner choices
   (E3/E4). The manifest (T2) is built and marks every relation with its intended rule plus
   `// TODO(E3/E4-owner): deleteAccount`.
2. T9 email change: design A (`/auth/callback`), `TODO(S8-06)` is already satisfied if `/auth/confirm`
   exists in the base; use it then.
3. T6: guest-loss warning only (see owner table).

### S8-08 (T1–T12 with three limits)
1. `ANALYTICS_SUPER_ADMIN_EMAIL`: do NOT make it boot-fatal. Keep the code fallback, log one `logWarn`
   at boot in production when it is unset, add it to runbook §17 as "set this". `// TODO(owner)`.
2. Legal pages: build `privacidad` / `terminos` with draft text and a visible "Borrador" banner,
   `robots: noindex`, behind `LEGAL_PAGES_PUBLISHED = false` in `lib/legal/config.ts`. While false: the
   pages render for a direct visit, nothing links to them, the footer keeps its mailto links, and the
   waitlist notice line is not shown. Consent columns and stamping (`consentNoticeVersion = "draft-0"`)
   are built regardless. The owner flips the constant after pasting the final text.
3. CSV export becomes super-admin only (spec default). Say so in the PR body as a behaviour change.
4. Cupper labels: stable "Catador N" by post-processing in `runPivotQuery` in platform scope; names only
   for the owner's own sessions in user scope. `// TODO(D4)`.

### S8-15 (T1–T6, T8, T9; no T7)
1. Realtime resume: design A (`resumeKey` state re-runs the existing effect). Own commit.
2. Cup "refetch" = `router.refresh()`.
3. `downloadFile` accepts a blob or a URL (data URLs included). No Capacitor dependency.

### S8-10 (T1–T12)
1. Validation errors keep the `{ ok: false, error: string }` shape; `run()` only catches throws
   (design b). No widening of `ActionErrorCode` for wizard codes.
2. `run()` wrapping changes return types: update every consumer in the same commit (grep the export name).
3. T5 is the race half only (count inside the transaction, include physical/extrinsic). The closed guard
   is S8-01's.
4. Not built: A4. B2 and C6 built with defaults and their TODOs.

### S8-11 (T1–T7; no step 4, no step 9)
1. T1 design (a) (client Map, re-seeded on refresh / SUBSCRIBED / visibility).
2. T4 design (a) (pure `evaluateJoin` shared by page and action).
3. C8: nothing moves. `// TODO(C8)` where `notifyGroupOfSession` is called from `createGroupSession`.
4. One migration for `SessionInvite.active` + `CuppingSession.entriesLocked`.
5. `entriesLocked` is display/gating only: never read by scoring, the trigger or `AggregateScore`.

### S8-13 (T1–T6, T8)
1. T2 design (b): await `ctx.resume()` on return, prompt only if still not running after ~300 ms.
2. T3 design (a). T4: build both the 20 s threshold and the one-tap confirm; `onExit` argument optional.
3. Timeline, clock and sound contracts in CLAUDE.md ("one timeline, one clock") are untouched. No new rAF.

### S8-14 (T1–T6; no unsubscribe)
1. Unsubscribe per group is NOT built (new public endpoint + opt-out semantics are an owner decision).
   `// TODO(owner): per-group unsubscribe (F-grupos-8)` in `lib/groupEmail.ts`; F-grupos-8 stays open in
   the audit with the links half marked fixed.
2. No `lib/siteUrl.ts`; the digest uses `siteOrigin()`.
3. Roster masking: accept what batch 1 does, add `tests/maskEmail.test.ts`.
4. T6 never enforces the cap.

### S8-12 (T1–T11)
1. Post-close writes sanctioned by this PR: `upsertExtrinsic` (owner + revealed) and
   `setParticipantExclusion` (owner). Update `docs/flows.md` §1, the CLAUDE.md line and the
   `tests/useServerExports.test.ts` allowlist reasons in the same commit.
2. N for "n de N" is computed from the pre-exclusion submitted set, separately from `submittedCount`.
3. Coffee invite rotation: delete the old invite (old URL reads "invalid"), 30-day expiry on new ones.
4. `RANKING_POLICY` values are constants with `// TODO(Kim-D3)`.
5. Display-only: nothing here is read by scoring, the trigger or `AggregateScore`.

## Every executor

- Work detached in your own worktree; push with `git push origin HEAD:<your branch>`; never force.
- One commit per task (or small group), gate before each: `npx tsc --noEmit && npm test`, and
  `npm run lint` with no errors beyond the 4 existing ones (`app/[locale]/dev/page.tsx`,
  `components/ui/IntensitySlider.tsx`). es/en key parity.
- UI: existing kit only (`components/ui/`), tokens from `DESIGN.md`, no hex, radius tokens
  `rounded-card/input/pill`. No dev server, no screenshots (the database is production); list the screens
  that changed in the PR body so they can be checked later.
- Update `docs/flows.md`, the audit files ("Fixed in S8-NN" under each finding) and CLAUDE.md where the
  spec asks. Open a DRAFT PR against `main` titled "S8-NN: …"; body = what was built, what was NOT built
  and why (gated items with their TODO names), manual steps for the owner, what was not verified. End the
  body with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Commits end with
  `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
