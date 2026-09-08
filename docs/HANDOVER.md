# Launch-readiness work — handover ledger

> **Resuming work?** If `status` is `in-progress`, read this file first and continue
> from **Next action**. Do not re-plan. The approved plan lives at
> `~/.claude/plans/i-want-you-to-graceful-wreath.md` (summarised in the WP table below).

- **status:** done (code) — manual runbook steps §1–§3 and the §5 smoke test are owed by the user; WP2 flows not yet browser-verified (needs §2)
- **last updated:** 2026-09-08
- **worktree:** `C:\projects\cata-cafe\.claude\worktrees\app-cohesion-menu-overhaul-00a088`
- **base:** `main` @ 172aa0b
- **current branch:** `claude/launch-docs` (stacked: wp3a(+wp1) → wp2 → wp3b → wp4 → wp5 → docs; merge PRs in order)
- **current WP / step:** Wrap-up docs (CHANGELOG plain-language summary, README env table, runbook §5 smoke test)

## Work packages (one branch/PR each, off `main`)

| WP | Branch | Status |
|---|---|---|
| WP1 Security (S1–S5) | folded into `claude/launch-wp3a-boundaries` (one commit) | done — needs runbook §1 applied |
| WP3a Boundaries + login + proxy (E1, F4, F6) | `claude/launch-wp3a-boundaries` | done (browser-verified 404 + login banner) |
| WP2 State machine + delete redesign (D1–D3, F1–F3, F11, cron) | `claude/launch-wp2-state-machine` | done — NOT browser-verified yet: needs runbook §2 (migration) applied first |
| WP3b Action contract + feedback + validation (E2–E5, F8) | `claude/launch-wp3b-actions` | done (build green) |
| WP4 Observability + honest save status | `claude/launch-wp4-observability` | done (build green) |
| WP5 Deploy hygiene + tests + guest scope | `claude/launch-wp5-deploy` | done (33 unit tests, build green) |
| Wrap-up docs + plain-language summary | `claude/launch-docs` | done |

## Done

- [x] Review + plan approved (2026-09-08)
- [x] Ledger created, WP1 branch created
- [x] WP1: PHASE 18 SQL written, revealSample coffeeId validated, physical/extrinsic owner-only (actions + cup page + PDF + tabs), co-cupper scoping for user-id adds, coffee read helpers moved to lib/coffees/queries.ts, CLAUDE.md rules, runbook §1 (tsc + lint clean)
- [x] WP3a: ErrorPanel, global-error, [locale]/error, [locale]/app/error, localized not-found + [...rest] catch-all, root not-found, 2 loading skeletons, `errors` messages, login ?error banner + change-email + Google error, proxy try/catch, cup/error → unstable_retry with 2-attempt budget (tsc + lint clean, browser-verified)
- [x] WP2: schema migration file (closedAt, close_email_deliveries, nullable history FKs + snapshot), assertSessionWritable everywhere, lib/closeSession.ts (idempotent, reveal, history, after() emails), delivery-ledgered + chunked close emails, resendCloseEmails, deleteSession detach+snapshot + getDeleteImpact + impact dialog, joinViaToken owner/rejoin/closed/maxUses-in-tx, startSession idempotent + master-panel button, waiting room (no date heuristic, closed redirect, i18n, polling fallback, exit link), cup closed-redirect + zero-sample EmptyState, results closed notice + email delivery line + resend, history readers accept detached rows, cron close-expired-sessions + vercel.json, runbook §2–§3, CLAUDE.md + flows.md updated (tsc + lint clean)
- [x] WP3b: lib/actionResult + safeAction (run) + log + validate; scoring inputs derived server-side (cupsPerSample/format from session, cup arrays clamped); validation on createSession/createGroupSession (specific wizard codes), createInviteToken, completeGuestOnboarding, completeOnboarding, updateProfile; Toast/ActionFeedbackProvider + useActionFeedback mounted in [locale]/layout; 5 coffee/group actions converted to run(); 6 call sites + ResultsClient/CupClient use feedback; join pages via useActionState with links; ConfirmDialog accepts ActionResult; errors.codes copy; CLAUDE.md contract/validation/logging/boundary sections (tsc + lint + `npm run build` green)
- [x] WP4: instrumentation.ts onRequestError + register() env assertions, honest pending save state, store try/catch + storage-unavailable banner, PendingDraftsBadge, runbook §4
- [x] WP5: vitest + 33 tests (scoring, evaluation derivation, validate, session state, action codes, env, log redaction, guest scope), lib/env.ts, security headers, SW v2 auth exclusion, SignOutButton clears SW caches + last user, guest scope gate in proxy, CLAUDE.md sections

## Next action

User: run `docs/LAUNCH-RUNBOOK.md` §1 (Supabase SQL), §2 (`npx prisma migrate deploy`), §3 (Vercel env + cron), then merge the six branches in order and run §5. Claude: once §2 is applied, browser-verify the WP2 group flow locally (plan Part E → WP2) before the merge.

## How to verify the current WP

See plan Part E → WP1. Runbook for the manual Supabase step: `docs/LAUNCH-RUNBOOK.md` §1.

## Open questions

- none

## Manual steps still owed by the user

- [ ] `docs/LAUNCH-RUNBOOK.md` §1 — apply PHASE 18 in the Supabase SQL editor (WP1)
- [ ] `docs/LAUNCH-RUNBOOK.md` §2 — `npx prisma migrate deploy` for launch_state_machine (WP2) — ALSO unblocks local browser verification
- [ ] `docs/LAUNCH-RUNBOOK.md` §3 — Vercel env vars + confirm the close-expired-sessions cron
