# S8 rollout — session handover

- **status:** in-progress
- **written:** 2026-11-11 (session "Application flow analysis and improvements", worktree
  `.claude/worktrees/cafesensible-mejoras-flujos-10dc7d`, branch
  `claude/app-flow-analysis-improvements-756c42`, PR #82 docs only)
- **owner's standing goal:** implement in production every S8 improvement that does not need Kim's
  input; use the browser for anything in Supabase; keep the Flowmap artifact and the docs current;
  audit the Sonnet-written code where the architect judges it necessary (done, see §4).

Read this file, then `docs/audits/s8-implementation-audit-2026-11/00-REPORT.md`. Do not re-plan and do
not re-audit. Continue from **§7 Next actions**.

## 1. What exists

Twenty-six stacked **draft** PRs, none merged. Every branch contains all the ones before it (chained
with merge commits, never rebased). Merging the last PR into `main` brings in everything; the others
then show as merged.

| Order | PR | Branch (`claude/…`) | What |
|---|---|---|---|
| 1 | #68 | `s8-01-rls-closed-readonly-impl` | Closed/expired = read-only; PHASE 21 |
| 2 | #67 | `s8-02-blind-leaks-impl` | Blind-tasting and owner-data leaks |
| 3 | #69 | `s8-03-guest-guard-email-impl` | Registered-only writes, email limits, ledger |
| 4 | #70 | `s8-04-scoring-impl` | Scoring under five cups; PHASE 23 |
| 5 | #75 | `s8-05-close-lifecycle-impl` | Two-phase close, deadline zone, solo finish |
| 6 | #80 | `s8-09-offline-impl` | Offline sync hardening |
| 7 | #71 | `s8-06-auth-impl` | Auth deep links, confirm page, code entry |
| 8 | #73 | `s8-07-account-impl` | Account lifecycle (no deletion) |
| 9 | #77 | `s8-08-legal-admin-impl` | Insights scope, audit log, legal drafts |
| 10 | #76 | `s8-15-native-foundation-impl` | Platform seam, resume, storage |
| 11 | #72 | `s8-10-setup-edit-impl` | Session create/edit robustness |
| 12 | #79 | `s8-11-live-group-impl` | Live group robustness |
| 13 | #78 | `s8-13-warmup-impl` | Warm-up player resilience |
| 14 | #81 | `s8-14-groups-admin-hygiene-impl` | Groups/admin hygiene |
| 15 | #74 | `s8-12-results-reports-impl` | Results and reports honesty |
| 16 | #85 | `s8-16-history-label-rows-impl` | History rows for blind/coffee-less samples |
| 17 | #84 | `s8-17-notify-at-start-impl` | Group email at start (C8 default) |
| 18 | #83 | `s8-18-offline-write-ordering-impl` | Server-side ordering of offline writes |
| 19 | #87 | `s8-19-delete-account-impl` | Delete account (now behind a flag, off) |
| 20 | #86 | `s8-20-group-unsubscribe-impl` | Per-group email unsubscribe |
| 21 | #88 | `s8-21-loose-ends-impl` | Review loose ends |
| 22 | #91 | `s8-22-audit-server-rules-impl` | Audit fixes: server rules |
| 23 | #89 | `s8-23-audit-client-offline-impl` | Audit fixes: client and offline |
| 24 | #90 | `s8-24-audit-sql-docs-impl` | Audit fixes: PHASE 24, runbook §27, docs |
| 25 | #92 | `s8-25-next-upgrade-impl` | Next.js 16.2.4 → 16.4.6 (tip `2a19f83`) |
| 26 | (pending) | `s8-26-coffee-policy-recursion-impl` | PHASE 24 recursion fix, being built (§5) |

Also #82 (`claude/app-flow-analysis-improvements-756c42`): docs only — planner reports, architect
decisions, the audit, this file. Safe to merge at any time.

Gate at `2a19f83`: `tsc` clean, 1,153 tests in 128 files, lint only the 4 pre-existing errors
(`app/[locale]/dev/page.tsx`, `components/ui/IntensitySlider.tsx`), `next build` succeeds. `npm audit
--omit=dev`: 7 remaining, all from the Prisma CLI (needs a coordinated Prisma upgrade; not done).

**Nothing has run in a browser, on a device, or against the database through the app.**

## 2. Production database state (Supabase project `dpkgcgdywjfmffqnkqsk`, "CaldiPro_App_Cata_Cafe_Sensible_EU")

| Step | State | Notes |
|---|---|---|
| PHASE 21 (session tables read-only for API roles) | **APPLIED 2026-11-10** | Dry run 12/12, verified after: 0 write grants, 0 non-SELECT policies on the nine tables |
| Ten migrations `20261110120000` … `20261111170000` | **APPLIED 2026-11-11** by Ricardo in the SQL editor | Verified: 10 rows in `_prisma_migrations`, checksums match, 3 new tables, 17 new columns |
| PHASE 22 (RLS on `outbound_email_events`, `group_email_deliveries`) | **NOT applied** | Two statements; `prisma/sql/rls_and_triggers.sql` at the tip |
| PHASE 23 step 1 (trigger: no penalties under five cups, `search_path` pinned) | **NOT applied** | Dry run file `prisma/sql/dry-runs/phase23_dry_run.sql` |
| PHASE 23 recompute of past scores | **HOLD** | Changes historical community scores; Kim must be told first |
| PHASE 24 (every public table read-only for API roles) | **NOT applied; dry run FAILED on purpose-revealing error** | See §5 |

Facts learned the hard way:

- `_prisma_migrations` checksums in production are the sha256 of `migration.sql` **with CRLF line
  endings** (the files as checked out on Ricardo's Windows machine). The ten new rows follow that.
- **Pre-existing production defect:** `coffees_select` and `coffee_shares_select` read each other's
  tables, so any SELECT on `coffees` or `coffee_shares` as role `authenticated` fails with
  `42P17 infinite recursion detected in policy` (since PHASE 16, August). The app is unaffected
  (Prisma runs as `postgres`). The S8-26 branch fixes it inside PHASE 24.
- Three live group sessions were never started: "[DEV] Sesión de prueba 19:26"
  (`cmvgygod40001ewtvrs9bthga`), "Ejemplo de cata." (`cmu4kl330000104jvl9wcc1wg`), "Artisan Brasil
  anaerobico" (`cmqteucs4000104jr9qdwbsqf`). After the deploy, participants in them cannot save.
  Ricardo decides: start or close them.
- Dry-run ids used so far: session `cmujavmd9000804l61l4wcand`, owner
  `241600d0-629e-493e-a5fd-045c14b5e622`, participant `7279d84a-23f7-4874-bee5-125459d99792`.

## 3. How SQL was run from a session

Supabase dashboard in the built-in browser pane (Ricardo signs in; the session cannot type
credentials). In the SQL editor: set the text with
`window.monaco.editor.getModels()[0].setValue(sql)`; for long scripts send base64 chunks, decode in the
page and compare a SHA-256 before running; click Run, then "Run query" on the destructive-operations
warning; read results from `document.querySelector('main').innerText` (the grid is virtualized, so
aggregate long lists into one row).

Permissions as experienced on 2026-11-10/11:

- Read-only queries and self-rolling-back dry runs (`DO … RAISE EXCEPTION`): allowed.
- PHASE 21 apply: allowed after Ricardo said "Yes, apply it".
- The ten migrations: **refused by the auto-mode classifier**. Ricardo pressed Run himself with the
  verified script loaded in the editor. Expect the same for PHASE 22/23/24: load and verify the
  script, then ask him to press Run, or ask for an explicit go-ahead per phase.

## 4. The audit (done)

`docs/audits/s8-implementation-audit-2026-11/`: `00-REPORT.md` (consolidated, follows Ricardo's audit
prompt) plus four Opus area reports. Result on tip `3713033`: 0 Critical, 3 High (B-01 unbounded
ratings, A-01 account deletion enabled, D-01 Next.js advisories), 13 Medium. Everything marked "before
release" was fixed in #91, #89, #90, #92. Deferred to the next cycle: D-05 (runtime tests on a
disposable database), A-06 to A-12, B-04, B-08, C-06 to C-08, D-06, D-08. Owner decision: A-13 (three
`@cata.test` accounts whose password is in the repo; whether they exist in production is unchecked).

## 5. In flight when this was written

Two background agents of the old session. Their notifications will not reach a new session; check
their outputs directly.

1. **Opus verification of every audit fix.** Writes
   `C:\Users\ricar\AppData\Local\Temp\claude\abf63ea712809caf\b4c1763d-bd33-4cad-a417-57ff30c99840\scratchpad\audit\E-verification.md`.
   If the file exists: read it, copy it into `docs/audits/s8-implementation-audit-2026-11/`, act on
   anything "Not resolved" or any new issue. If it does not exist: re-run the verification (prompt in
   the transcript; the essentials are in `00-REPORT.md` §D).
2. **S8-26, PHASE 24 recursion fix** on branch `claude/s8-26-coffee-policy-recursion-impl` (from
   `2a19f83`): adds `is_coffee_owner(text)` (SECURITY DEFINER, `search_path` pinned, EXECUTE for
   `authenticated` only) and rewrites `coffee_shares_select` to
   `"userId" = auth.uid()::text OR is_coffee_owner("coffeeId")`; mirrors it in
   `prisma/sql/dry-runs/phase24_dry_run.sql`; extends `tests/phase24Sql.test.ts`. Check
   `git log origin/claude/s8-26-coffee-policy-recursion-impl` and `gh pr list`. If the branch is
   missing, redo it (the exact SQL is in the transcript and repeated here).

**Update 2026-11-11 (later):** item 2 is DONE — PR #93, branch
`claude/s8-26-coffee-policy-recursion-impl` (commit `b11432f`, 1,155 tests). The PHASE 24 dry run was
re-run in production from that branch: every check matches its expectation except probe 4a, which
reported 8 because the probe counted Supabase's `storage` schema too. A separate self-rolling-back
probe confirmed the PHASE 24 statement is right (`public` default ACL for `anon`/`authenticated` goes
`arwdDxtm` → `rxtm`). A small fix to the probe was dispatched to the same branch (commit message
"S8-26: PHASE 24 dry-run default-privilege probe counts schema public only"); check that it landed,
otherwise redo it. **PHASE 24 is ready to apply.** Item 1 (verification) was still running.
The chain tip is now `claude/s8-26-coffee-policy-recursion-impl` (26th and last branch).

## 6. Decisions on record

- Kim has answered nothing. Everything built on a Kim default carries `TODO(<answer id>)`.
- **Not built** (need Kim or the owner): random blind codes (A4), group member consent (S8-11 step 9),
  late contributions after close (C1-d), C7, C9, D4 options a/b, F4/F5, queued offline create (E5),
  final legal text (pages exist as drafts behind `LEGAL_PAGES_PUBLISHED = false`).
- **Account deletion** ships disabled: `ACCOUNT_DELETION_ENABLED` unset. Enable only after a
  throwaway-account rehearsal on a non-production database (runbook §24).
- `decideThrottle` (`lib/emailLimits.ts`) was written by Claude. Ricardo should confirm the limits:
  300 recipients/day (groups hold up to 200), 40/day for accounts under 24 h.
- Behaviour changes to tell Ricardo/Kim about at release: `closesAt` is a write cutoff; the insights
  digest and the users CSV are super-admin only; AI admins see masked emails; "Impresión rápida" tag
  on sessions under five cups; service worker goes to v4 (old caches evicted once).
- Vercel free plan allows 100 deployments/day; it was exhausted on 2026-11-10 (red "Vercel" checks on
  that day mean the limit, not the code). Production deploys from `main` count against it.

## 7. Next actions, in order

1. Collect the two in-flight results (§5). Fix anything the verification marks unresolved (Sonnet fix
   agent in `isolation: "worktree"`, detached checkout of the tip, push to a new stacked branch), then
   chain so the last branch contains everything.
2. Re-run the PHASE 24 dry run in production from the S8-26 branch's
   `prisma/sql/dry-runs/phase24_dry_run.sql` (placeholder `<owner-uuid>` =
   `241600d0-629e-493e-a5fd-045c14b5e622`). Expected: a red error starting `PHASE 24 DRY RUN: NOTHING
   WAS APPLIED` with every line matching its expectation. Any other error: stop and fix the SQL.
3. Apply, with Ricardo pressing Run or giving a per-phase go-ahead, in this order: PHASE 22 → PHASE 23
   step 1 (dry run first) → PHASE 24. Verify each. Do **not** run the PHASE 23 recompute.
4. Ask Ricardo about the three never-started sessions (§2) and the `@cata.test` accounts (A-13).
5. Merge: mark the last PR in the chain ready and merge it into `main` (`gh pr merge --merge`); then
   #82. Check Vercel's deployment (the daily limit resets 24 h after it tripped on 2026-11-10).
6. After the deploy (runbook §27 has the full list): Supabase email templates from
   `docs/auth/email-templates/`, OTP length 6, redirect allow-list for `/auth/confirm`, auth rate
   limits; `ANALYTICS_SUPER_ADMIN_EMAIL` in Vercel.
7. Verify in production with Ricardo signed in on the pane: sign-in, create a session, cup, results,
   a group session with two accounts (realtime), offline on a phone, warm-up on two phones.
8. Flowmap (https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9, ArtifactData): `prompts/S8-NN` →
   `merged`; kanban cards `k-s8-01` … `k-s8-21` → `done` with notes; findings → `state: 'fixed'` with
   the PR number. Writes need `if_version`; at most 50 per batch. Add cards for S8-22 to S8-26.
9. Update `docs/HANDOVER.md`, CLAUDE.md where behaviour changed, and the memory files
   (`s8-batch1-orchestration-2026-11-10`, `s8-batch2-build-2026-11-10`).

## 8. Working rules that matter here

- Never write into another worktree from the session (a hook refuses it); use
  `isolation: "worktree"` agents: `git checkout --detach origin/<branch>`, commit, `git push origin
  HEAD:refs/heads/<branch>`. Read-only reviewers should get their own worktree too (one moved the
  session's checkout once).
- Pipeline that worked: Sonnet planner → architect decisions → Sonnet executor → independent QA →
  Sonnet fix → Opus for integration, audits and anything irreversible. Independent review found a real
  defect in every PR; do not skip it.
- The only database is production. Sessions never run `prisma migrate`, seeds or the dev server
  against it.
- Auto-fix events for these PRs have all been Vercel bot status comments; no action needed.

## Update 2026-11-11 (after the Opus verification)

- **Verification report**: `docs/audits/s8-implementation-audit-2026-11/E-verification.md`. Verdict: conditionally safe to release. All three High findings resolved. Partly resolved and left for the next cycle: A-03, A-04, B-03, C-02, C-04, D-09.
- **S8-27** (`claude/s8-27-verification-fixes-impl`, stacked on #93) is being built: removing the active reference now needs the owner's confirmation before another cupper's ratings are overwritten (new issue 1 + B-05), waiting-room poll generation token, two weak tests, one false comment. When it lands it is the new chain tip. Review it before merging.
- **PHASE 23 dry run in production: PASSED** (2026-11-11, file sha256 `fd063875…34ac6`). 352 aggregate rows, 332 under five cups; **54 community scores change** when the recompute runs (all upward, examples: 81 → 84.25, 79.75 → 84.75, 77.25 → 85.25); 0 rows with five or more cups change; `search_path=public` kept. Step 1 (the function) is safe to apply; step 2 (the recompute) stays on HOLD until Kim is told that 54 past scores go up by as much as 8 points.
- **Stored ratings check (read-only): clean.** 8,822 rating values in 1,227 evaluations; 0 non-numeric, 0 out of 1–9, 0 non-integer. The B-01 sanitizer cannot change any existing score.
- **Flowmap**: cards `k-s8-22` … `k-s8-26` added (status doing). Nothing is marked merged because nothing is merged.
- Reading results in the SQL editor when the pane is hidden: the grid renders empty cells; wrap a read-only query in a `DO` block that ends in `RAISE EXCEPTION '…%', v` and read the error text. Long scripts: gzip + base64, decompress in the page with `DecompressionStream`, compare SHA-256.
- **PHASE 24 dry run re-run from `f74d053` (probe fixed): ALL LINES MATCH** (2026-11-11, filled file sha256 `95e44c27…05ae`, owner `241600d0-…`). 0 write privileges left, 0 non-SELECT policies, 16 policies, `is_coffee_owner` t/f, coffee_shares readable without error (the 42P17 loop is gone), 4a = 0. Lines 3a and 3c read 0 because this owner really has no group and no history row (checked as postgres). Informational: `supabase_admin` defaults and the `storage` schema are outside PHASE 24. `claude/s8-26-coffee-policy-recursion-impl` tip is now `f74d053` (1,156 tests); S8-27 was branched from `b11432f` and must merge it.
- **S8-27 DONE: draft PR #94, `claude/s8-27-verification-fixes-impl` @ `80271b5` is the NEW CHAIN TIP** (contains everything, including `f74d053`). tsc clean, 1,162 tests / 129 files, lint 4 pre-existing errors. Architect-reviewed: removing the active reference returns `conflict` unless `confirmRepin` when the re-activated reference has ratings off the 79.00 anchor; `removeSessionSample` refuses with `reference_repin_required`; `removeSamplesInTx` takes a required `{ onReactivate }` (solo finish passes "ignore": review caught that the guard would otherwise break finishing a solo session). Not run in a browser; `next build` not re-run at this tip (last build check was at `2a19f83`). Merge #94 into `main` to bring in the whole chain.
- **A-13 answered (read-only, 2026-11-11):** production has **3 `@cata.test` accounts, 2 of them own sessions**. 185 registered users, 315 anonymous guests. Removing or re-keying the test accounts is Ricardo's action.
- **S8-28 in progress** (`claude/s8-28-audit-partials-impl`, stacked on #94): `next build` at the tip plus the partly resolved findings A-03, A-04, B-03, C-04, D-09, A-05 test, doc drift. No migration allowed in it. Review before treating it as the tip.

## Update 2026-11-11 (SQL phases applied)

Ricardo authorized Claude to run the three phases and to merge + deploy (answers to an explicit question, 2026-11-11). Applied through the Supabase SQL editor, each script checksum-verified in the page before running, source = `prisma/sql/rls_and_triggers.sql` at `80271b5`:

| Phase | Applied | Verified (read-only, after) |
|---|---|---|
| PHASE 22 | yes | RLS on for `outbound_email_events` and `group_email_deliveries`, 0 policies on them |
| PHASE 23 STEP 1 | yes (sha256 `a5a49f6d…f7b9`, identical to the dry-run copy) | function contains `v_cups_per_sample >= 5`, `proconfig = {search_path=public}`, trigger enabled |
| PHASE 23 STEP 2 (recompute) | **NO: on hold until Kim is told** (54 past scores go up) | n/a |
| PHASE 24 | yes (sha256 `c40c7b09…df6a`, with its self-check) | 16 policies, all SELECT + `authenticated`; 0 API-role write privileges in `public`; `is_coffee_owner` EXECUTE authenticated yes / anon no; every public table has RLS on |

- PHASE 24 pre-flight (a) matched the expected 18 policies exactly. Pre-flight (b), the grant half of the rollback, is saved as `docs/handover/phase24-rollback-grants.sql` (19 tables x 2 roles); the policy half is the commented block at the end of PHASE 24 in the SQL file. Pre-flight (c): postgres defaults in public were the Supabase defaults (`arwdDxtm` for anon and authenticated).
- Not checked yet: Supabase Security Advisor, and the two-account Realtime test (needs Ricardo's accounts).
- The old app is still what is deployed; it ran on top of these rules from this moment.
