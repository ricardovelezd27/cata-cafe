# Launch-readiness work — handover ledger

> **Resuming work?** If `status` is `in-progress`, read this file first and continue
> from **Next action**. Do not re-plan. The approved plan lives at
> `~/.claude/plans/i-want-you-to-graceful-wreath.md` (summarised in the WP table below).

- **status:** launch work SHIPPED — merged to `main` (172aa0b..255578c) and deployed to production 2026-09-14. Runbook §1, §1b, §2 and §3 all applied. Only the §5 smoke test remains, and it needs a real login. Reference sample feature BUILT, UNMERGED — pending: migration deploy, browser walkthrough, merge.
- **last updated:** 2026-09-23
- **worktree:** `C:\projects\cata-cafe\.claude\worktrees\results-page-redesign-2920c2`
- **base:** `main` @ 172aa0b → now `main` @ 255578c (deployed)
- **current branch:** `claude/cafe-sensible-improvements-51283e` (worktree `results-page-redesign-2920c2`); all launch WP branches are historical now, folded into `main`.
- **current WP / step:** launch work complete, see `docs/LAUNCH-REPORT-2026-09-14.md`. Reference sample feature (commits `8b36b9e`/`19ef794`/`02d3e34`) built and typechecked/linted; not yet merged.

## Work packages (one branch/PR each, off `main`)

| WP | Branch | Status |
|---|---|---|
| WP1 Security (S1–S5) | folded into `claude/launch-wp3a-boundaries` (one commit) | shipped; §1 + §1b applied to prod |
| WP3a Boundaries + login + proxy (E1, F4, F6) | `claude/launch-wp3a-boundaries` | done (browser-verified 404 + login banner) |
| WP2 State machine + delete redesign (D1–D3, F1–F3, F11, cron) | `claude/launch-wp2-state-machine` | shipped; migration applied. Authenticated flows still UNTESTED end to end (§5) |
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

1. User: apply the reference-sample migration — `npx prisma migrate deploy` from this worktree (additive; the diff in `prisma/migrations/20260922120000_reference_sample/migration.sql` was verified by hand — see `docs/LAUNCH-RUNBOOK.md` §7).
2. User (+ Claude if available): run the two-user walkthrough in `docs/CHANGELOG-reference-2026-09.md` → "Cómo comprobarlo".
3. Open a PR from `claude/cafe-sensible-improvements-51283e` and merge to `main`.
4. Then, in a **new session**, run `docs/prompts/S2-staging-production.md`.
5. After the end-of-month calibration cupping: run `docs/prompts/S3-radar-reference-overlay.md` **only if** the reference experiment validates the concept (see `docs/product/experimento-referencia-2026-09.md` §7); `docs/prompts/S4-results-hygiene.md` can run any time.

### Reference sample (2026-09-22)

- [x] built
- [x] typechecked (`npx tsc --noEmit`)
- [x] tested
- [x] linted (`npm run lint`)
- [ ] migration applied
- [ ] browser walkthrough
- [ ] merged
- [ ] deployed

## How to verify the current WP

See plan Part E → WP1. Runbook for the manual Supabase step: `docs/LAUNCH-RUNBOOK.md` §1.

## Open questions

- none

## Manual steps still owed by the user

- [x] §1 PHASE 18 applied 2026-09-14 (verified: no anon read on invites/profiles)
- [x] §1b PHASE 18b applied 2026-09-14 (is_session_participant EXECUTE restored for authenticated)
- [x] §2 migration `20260908140000_launch_state_machine` applied 2026-09-14 (closedAt + close_email_deliveries + nullable history FKs + snapshot/detachedAt; 123 sessions / 1070 evaluations / 83 history rows intact; app boots clean against it)
- [x] §3 Vercel env vars set 2026-09-14 (CRON_KEY removed, CRON_SECRET + GUEST_CLAIM_SECRET added, DATABASE_URL + SUPABASE_SERVICE_ROLE_KEY converted to Secret, NEXT_PUBLIC_SITE_URL = https://cata-cafe-opal.vercel.app interim)
- [x] merged + pushed to `main` 2026-09-14 (172aa0b..255578c); Vercel deploy verified live
- [x] F10 completed 2026-09-14: status callbacks added to CupClient (stale-count notice in the master panel) and ResultsClient (points the viewer at Actualizar). All three subscription sites now report channel loss.
- [ ] **§5 post-deploy smoke test — STILL OWED.** Needs a real magic-link login; Claude cannot run it without writing test data into the live database. Steps 3–9 (the group session walkthrough) are the ones that matter.
- [ ] Domain cutover to cafesensible.ai when registered — runbook §6.
