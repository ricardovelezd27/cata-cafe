# Launch-readiness work — handover ledger

> **Resuming work?** If `status` is `in-progress`, read this file first and continue
> from **Next action**. Do not re-plan. The approved plan lives at
> `~/.claude/plans/i-want-you-to-graceful-wreath.md` (summarised in the WP table below).

- **status:** in-progress
- **last updated:** 2026-09-08
- **worktree:** `C:\projects\cata-cafe\.claude\worktrees\app-cohesion-menu-overhaul-00a088`
- **base:** `main` @ 172aa0b
- **current branch:** `claude/launch-wp3b-actions` (stacked: wp3a(+wp1) → wp2 → wp3b; merge PRs in order)
- **current WP / step:** WP3b — action contract + feedback + validation, step 1

## Work packages (one branch/PR each, off `main`)

| WP | Branch | Status |
|---|---|---|
| WP1 Security (S1–S5) | folded into `claude/launch-wp3a-boundaries` (one commit) | done — needs runbook §1 applied |
| WP3a Boundaries + login + proxy (E1, F4, F6) | `claude/launch-wp3a-boundaries` | done (browser-verified 404 + login banner) |
| WP2 State machine + delete redesign (D1–D3, F1–F3, F11, cron) | `claude/launch-wp2-state-machine` | done — NOT browser-verified yet: needs runbook §2 (migration) applied first |
| WP3b Action contract + feedback + validation (E2–E5, F8) | `claude/launch-wp3b-actions` | in progress |
| WP4 Observability + honest save status | `claude/launch-wp4-observability` | pending |
| WP5 Deploy hygiene + tests + guest scope | `claude/launch-wp5-deploy` | pending |
| Wrap-up docs + plain-language summary | `claude/launch-docs` | pending |

## Done

- [x] Review + plan approved (2026-09-08)
- [x] Ledger created, WP1 branch created
- [x] WP1: PHASE 18 SQL written, revealSample coffeeId validated, physical/extrinsic owner-only (actions + cup page + PDF + tabs), co-cupper scoping for user-id adds, coffee read helpers moved to lib/coffees/queries.ts, CLAUDE.md rules, runbook §1 (tsc + lint clean)
- [x] WP3a: ErrorPanel, global-error, [locale]/error, [locale]/app/error, localized not-found + [...rest] catch-all, root not-found, 2 loading skeletons, `errors` messages, login ?error banner + change-email + Google error, proxy try/catch, cup/error → unstable_retry with 2-attempt budget (tsc + lint clean, browser-verified)
- [x] WP2: schema migration file (closedAt, close_email_deliveries, nullable history FKs + snapshot), assertSessionWritable everywhere, lib/closeSession.ts (idempotent, reveal, history, after() emails), delivery-ledgered + chunked close emails, resendCloseEmails, deleteSession detach+snapshot + getDeleteImpact + impact dialog, joinViaToken owner/rejoin/closed/maxUses-in-tx, startSession idempotent + master-panel button, waiting room (no date heuristic, closed redirect, i18n, polling fallback, exit link), cup closed-redirect + zero-sample EmptyState, results closed notice + email delivery line + resend, history readers accept detached rows, cron close-expired-sessions + vercel.json, runbook §2–§3, CLAUDE.md + flows.md updated (tsc + lint clean)

## Next action

WP3b step 1 (Fable): lib/actionResult.ts, lib/safeAction.ts (run() with unstable_rethrow + Prisma code mapping), lib/log.ts, lib/validate.ts; apply validation to createSession/createGroupSession/createInviteToken/completeGuestOnboarding/completeOnboarding; upsertEvaluation + syncEvaluation derive cupsPerSample/moduleKey from the session row.
WP3b step 2 (Sonnet): Toast + ActionFeedbackProvider + useActionFeedback (mounted in both layouts), convert the 12 bare startTransition call sites, join pages → useActionState JoinForm, ConfirmDialog accepts ActionResult, `errors` copy per ActionErrorCode.

BLOCKER for browser verification of WP2: the user must run runbook §2 (`npx prisma migrate deploy`) — the dev server points at the production DB and the new columns do not exist yet.

## How to verify the current WP

See plan Part E → WP1. Runbook for the manual Supabase step: `docs/LAUNCH-RUNBOOK.md` §1.

## Open questions

- none

## Manual steps still owed by the user

- [ ] `docs/LAUNCH-RUNBOOK.md` §1 — apply PHASE 18 in the Supabase SQL editor (WP1)
- [ ] `docs/LAUNCH-RUNBOOK.md` §2 — `npx prisma migrate deploy` for launch_state_machine (WP2) — ALSO unblocks local browser verification
- [ ] `docs/LAUNCH-RUNBOOK.md` §3 — Vercel env vars + confirm the close-expired-sessions cron
