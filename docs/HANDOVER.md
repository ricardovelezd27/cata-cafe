# Launch-readiness work — handover ledger

> **Resuming work?** If `status` is `in-progress`, read this file first and continue
> from **Next action**. Do not re-plan. The approved plan lives at
> `~/.claude/plans/i-want-you-to-graceful-wreath.md` (summarised in the WP table below).

- **status:** in-progress
- **last updated:** 2026-09-08
- **worktree:** `C:\projects\cata-cafe\.claude\worktrees\app-cohesion-menu-overhaul-00a088`
- **base:** `main` @ 172aa0b
- **current branch:** `claude/launch-wp2-state-machine` (stacked: wp1 → wp3a → wp2; merge PRs in order)
- **current WP / step:** WP2 — state machine + delete redesign, step 1 (schema + lib/closeSession)

## Work packages (one branch/PR each, off `main`)

| WP | Branch | Status |
|---|---|---|
| WP1 Security (S1–S5) | `claude/launch-wp1-security` | done — needs runbook §1 applied |
| WP3a Boundaries + login + proxy (E1, F4, F6) | `claude/launch-wp3a-boundaries` | done (browser-verified 404 + login banner) |
| WP2 State machine + delete redesign (D1–D3, F1–F3, F11, cron) | `claude/launch-wp2-state-machine` | in progress |
| WP3b Action contract + feedback + validation (E2–E5, F8) | `claude/launch-wp3b-actions` | pending |
| WP4 Observability + honest save status | `claude/launch-wp4-observability` | pending |
| WP5 Deploy hygiene + tests + guest scope | `claude/launch-wp5-deploy` | pending |
| Wrap-up docs + plain-language summary | `claude/launch-docs` | pending |

## Done

- [x] Review + plan approved (2026-09-08)
- [x] Ledger created, WP1 branch created
- [x] WP1: PHASE 18 SQL written, revealSample coffeeId validated, physical/extrinsic owner-only (actions + cup page + PDF + tabs), co-cupper scoping for user-id adds, coffee read helpers moved to lib/coffees/queries.ts, CLAUDE.md rules, runbook §1 (tsc + lint clean)
- [x] WP3a: ErrorPanel, global-error, [locale]/error, [locale]/app/error, localized not-found + [...rest] catch-all, root not-found, 2 loading skeletons, `errors` messages, login ?error banner + change-email + Google error, proxy try/catch, cup/error → unstable_retry with 2-attempt budget (tsc + lint clean, browser-verified)

## Next action

WP2 step 1 (Fable): schema migration (CuppingSession.closedAt, CloseEmailDelivery, UserCoffeeHistory nullable session/evaluation + snapshot/detachedAt) written by hand as an additive migration — DO NOT run `prisma migrate dev` against the prod DB without the user; `assertSessionWritable` in lib/sessionAuth.ts; `lib/closeSession.ts` (idempotent close + reveal + history + emails via after() with per-recipient delivery rows); deleteSession redesign + getDeleteImpact; joinViaToken owner/rejoin/closed fixes; startSession idempotent; cron route close-expired-sessions + vercel.json.
WP2 step 2 (Sonnet): MasterControls start button, waiting room fixes, cup closed-redirect + zero-sample EmptyState, history readers accept session null, DeleteSessionButton impact dialog, ResultsClient back-link only when active, close ConfirmDialog + emailSummary render.

## How to verify the current WP

See plan Part E → WP1. Runbook for the manual Supabase step: `docs/LAUNCH-RUNBOOK.md` §1.

## Open questions

- none

## Manual steps still owed by the user

- [ ] `docs/LAUNCH-RUNBOOK.md` §1 — apply PHASE 18 in the Supabase SQL editor (WP1)
