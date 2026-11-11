# D-integration — Integration, schema, migrations and tests

Audited commit: `3713033` (`origin/claude/s8-21-loose-ends-impl`, detached), baseline `origin/main` (`6c4ecf5`). Worktree `C:\projects\cata-cafe\.claude\worktrees\wf_ad92e1fd-965-4`. Real `npm ci` + `npx prisma generate`; no `.env.local`; no DB access.

## 1. System overview of the area

- **Schema/migrations.** Ten additive migrations (`20261110120000_outbound_email_ledger` … `20261111170000_group_member_email_opt_out`) add 3 tables (`outbound_email_events`, `group_email_deliveries`, `session_reminder_deliveries`), 17 columns, one relaxed NOT NULL (`user_coffee_history.coffeeId`), one SQL-only partial unique index (`user_coffee_history_label_row_evaluation_key`), one backfill (`closeFinalizedAt`), and one RLS enable. Supabase SQL: PHASE 21 (read-only RLS, before deploy), PHASE 22 (RLS on the 2 email tables, after migrate), PHASE 23 (trigger < 5 cups, any time after deploy).
- **User-reference bookkeeping.** `lib/accountDeletion/manifest.ts` lists every Profile relation and bare user column with a merge rule (`mergeGuestData`, `lib/guestClaim.ts`) and a delete rule (`deleteAccountData`, `lib/accountDeletion/deleteAccount.ts`); `tests/profileRelations.test.ts` parses `schema.prisma` and both sources as text.
- **Contracts.** `ACTION_ERROR_CODES` (`lib/actionResult.ts`) ↔ `messages/*.json errors.codes`; translation keys; server→client props; Next 16 conventions; runbook §10–§25.

## 2. Architecture assessment

- Migration design is sound: every step is additive, constant defaults only, no data rewrites besides a bounded backfill, nothing depends on a later migration, and old code tolerates every new object. The code, however, REQUIRES them (regenerated client selects new columns), so "migrate before deploy" is mandatory — correctly stated per section, but see D-03.
- The manifest + text-scan test is a reasonable guard against the classic "forgotten FK cascades rows away" failure. It is a static guard (D/A: it cannot prove the transaction works), see D-07.
- The partial unique index living only in SQL is an accepted, documented Prisma limitation; the writer uses `createMany({ skipDuplicates })` (ON CONFLICT DO NOTHING, works with partial indexes) so races are no-ops. Sound.
- No new user FK was introduced (all new user columns are bare: `SessionReminderDelivery.userId`, `SessionParticipant.excludedBy`, `OutboundEmailEvent.actorKey`), and all three are in the manifest and handled by merge and delete. Sound.

## 3. Findings register

### D-01 — High — dependency-security (baseline, not introduced by S8)
- **Files:** `package.json` (`next` 16.2.4), `node_modules/next`.
- **Expected:** a production deploy on a framework version without known critical/high advisories, especially in the middleware layer the app relies on (`proxy.ts` gates guests and now redirects signed-out users).
- **Actual:** `npm audit --omit=dev` → `19 vulnerabilities (1 low, 6 moderate, 11 high, 1 critical)`. `next 9.3.4-canary.0 - 16.4.0  Severity: critical`, ~33 advisories, among them "Middleware / Proxy bypass in App Router applications via segment-prefetch routes" (GHSA-267c-6grr-h53f and its follow-up GHSA-26hh-7cqf-hhc6), "Denial of Service in App Router using Server Actions" (GHSA-m99w-x7hq-7vfj, GHSA-p3m5-59mp-jv5r), "Unauthenticated disclosure of internal Server Function endpoints" (GHSA-955p-x3mx-jcvp). Also high: `ws`, `hono`, `source-map-js`, `sharp`.
- **Mitigation present:** the `/app` layout also guards auth server-side, and actions call `requireUser`/`requireRegisteredUser`, so a proxy bypass is not by itself an auth bypass; the guest scope gate (`isGuestAllowedPath`) is proxy-only for pages.
- **Verification:** Verified (command output). Exploitability against this app: Hypothesis.
- **Remediation:** upgrade `next` to the patched line the audit names (16.4.6) and `eslint-config-next` alongside; rerun build + smoke test; `npm audit fix` for the transitive ones. Read `node_modules/next/dist/docs/` upgrade notes first (AGENTS.md).
- **Regression test:** CI step `npm audit --omit=dev --audit-level=high` (fail on high).

### D-02 — Medium — i18n contract ("built but never wired" copy)
- **File:** `app/[locale]/app/coffees/[id]/page.tsx:67,223`; introduced by `b163df7` (S8-10 review).
- **Expected:** the "Catar este café" primary button renders localized copy.
- **Actual:** `const tc = await getTranslations("common"); … {tc("tasteThis")}` but the key exists only at `coffee.tasteThis` (`messages/es.json:1145`, `en.json:1145`); `common.tasteThis` does not exist. next-intl falls back to rendering the key path, so the primary CTA of every coffee profile reads `common.tasteThis` and logs an error per render.
- **Verification:** Verified by script (`i18n-check.js`: 1,556 literal `t("…")` usages resolved against both catalogs; this is the only miss; es/en have identical 1,849-key sets).
- **Fix:** `t("tasteThis")` (the page already has `t = getTranslations("coffee")`).
- **Regression test:** keep a key-usage scan like the one I ran in `npm test`.

### D-03 — Medium — runbook / deploy procedure
- **File:** `docs/LAUNCH-RUNBOOK.md` §10–§25.
- **Expected:** S8 ships as one chained branch, so the operator needs ONE ordered procedure: PHASE 21 SQL → `migrate deploy` (all ten) → PHASE 22 → deploy → PHASE 23 + history resync → email templates (§15, deploy first) → dashboard settings (§16).
- **Actual:** each section is written for its own PR. §13 says "It must report exactly one migration applied, `20261111090000_close_lifecycle`"; §18 "expected: exactly one pending migration … Anything else: stop and paste the output"; §20, §21, §23, §25 "Expected: `1 migration found …`". Run against production today, `migrate status` shows ten pending, so a literal operator stops at the first section; one who proceeds runs ten migrations under a section that described one. There is no consolidated ordering (README covers merge order, not deploy order). Ordering matters: §11 states the login form fails if code ships before `outbound_email_events` exists; §10 requires PHASE 21 before the deploy; §15 requires the deploy before templates.
- **Verification:** Verified (doc text). Safety of applying all ten together: Strongly supported (I replayed them: all additive, independent; see §5).
- **Fix:** add a "§26 S8 combined deploy" checklist with the order above and the expected `migrate status` list of ten names; mark §11–§25 migration steps "already covered by §26".
- **Regression:** none (doc).

### D-04 — Medium — normative docs contradict code
- `CLAUDE.md:299`: "`closesAt` … It cannot be edited after creation" — but `updateSession` edits it through `planClosesAtChange` (`app/actions/sessions.ts:1149-1163`, `lib/sessionState.ts:98`), and the edit form reads it back with `dateInZone`.
- `CLAUDE.md:301`: "never-revealed blind samples are skipped … label-only rows wait for Kim D8, see the `TODO(S8-02 D8)`" and `docs/flows.md:891-892`: "D8 … unrevealed samples get no history row; label-only rows … wait for Kim's answer" — but `lib/coffeeHistory.ts:217-251` now writes label-only rows for never-revealed samples on delete (S8-16), the TODO no longer exists, and runbook §21's smoke test expects "Café sin revelar" rows.
- `CLAUDE.md:263`: "One 30 s transaction" — `lib/accountDeletion/deleteAccount.ts:54` is `{ maxWait: 15_000, timeout: 120_000 }` (runbook §24 says 120 s).
- **Risk:** CLAUDE.md is the instruction source for every later agent and flows.md is declared normative; the stale lines invite someone to "fix" correct code back.
- **Verification:** Verified (quoted). **Fix:** edit the three passages. **Regression:** none.

### D-05 — Medium — test quality / untested high-risk paths
- The irreversible and data-moving paths have no runtime test at all: `deleteAccountData` (transaction, placeholder, re-plan, `profile.delete` last), `mergeGuestData` (history dedupe for label rows, exclusion merge), `finalizeClosedSession`/repair, `ensureLabelRows` + the partial index, `writeEvaluationOrdered`'s conditional update, `deliverGroupMail` ledger. Nothing has run against a database (all migrations unapplied anywhere).
- What covers them is text scanning: `tests/profileRelations.test.ts` (regex over `deleteAccount.ts`: "a `tx.<delegate>.updateMany` whose where contains `<field>: userId`"), `tests/resultsRepairScan.test.ts`, `tests/assignCoffeeLinkGuard.test.ts`, `useServerExports`, `registeredOnlyActions`, `groupMailWiring`, `platformSeam`. These pass with behaviour broken as long as the text shape survives (e.g. a `deleteMany` with the right where placed after a `return`, or inside a branch never taken, still passes).
- `tests/joinability.test.ts` tests `joinBlock`, which no production code calls (see D-06) — a green test of dead code.
- Flakiness: in one run of the full suite while sibling processes loaded the machine, `tests/groupMailWiring.test.ts` and `tests/platformSeam.test.ts` (recursive filesystem walks) hit the 5 s default timeout; in my isolated rerun all 1,088 passed. (The failing log may have been a sibling auditor's run sharing the scratchpad; I report it as observed, not as a defect of this commit.)
- **Verification:** Verified (code read + runs). **Fix:** before go-live, run §24's throwaway-account script and a guest-claim + delete + close/repair pass against a Supabase branch with all ten migrations applied; add explicit `testTimeout` to the walk tests.

### D-06 — Low — dead / test-only exports
From the dead-export scan over the 420 changed files (`dead-exports.js`):
- `lib/joinability.ts: joinBlock` — no production caller; its own header says it is "kept for its tests" because `evaluateJoin` replaced it. Delete it and its test.
- `lib/groupEmail.ts:174 summaryOf` — no caller anywhere.
- `lib/accountDeletion/manifest.ts:245 BARE_COLUMNS` — no caller (the test discovers relations itself).
- Test-only: `lib/pdf/stampText.ts draftLabel`, `lib/trustedOrigin.ts safeNextPath`, `lib/historySnapshot.ts LABEL_SNAPSHOT_KEYS`, `lib/coffeeDuplicate.ts DUPLICABLE_COFFEE_FIELDS` (constants used as test oracles: fine), `components/ui/ReportLink.tsx newTab` prop never passed.
- `app/actions/community.ts:798-805` inlines the exact SQL of `lib/aggregates.ts refireAggregates` instead of calling it (two copies of the trigger re-fire).
- No "optional prop never wired" defect found for server→client props (scan of optional members in changed client types: the flagged fields `closesAtZone`, `emailOptedOut`, `trail`, `bannerNextAttempt` are all populated by their pages).
- **Verification:** Verified (scan + grep).

### D-07 — Low — `endOfDayInZone` is one hour early on a midnight DST fall-back
- **File:** `lib/closeRules.ts:133-143` (two-pass offset correction).
- **Expected:** the last millisecond of the chosen calendar day in the owner's zone.
- **Actual:** for `America/Santiago` (Chile, the partner market) the clock falls back at 00:00 → 23:00, so the day has 25 h; the function returns the FIRST 23:59:59.999 (`2026-04-04 → 2026-04-05T02:59:59.999Z`, `2027-04-03 → 2027-04-04T02:59:59.999Z`). The real end is 03:59:59.999Z. A session due that day stops accepting writes one hour early (S8-01 makes `closesAt` a write cutoff).
- **Verification:** Verified: temporary test over 2 years × 9 zones (Santiago, Bogotá, Madrid, Kiritimati, Pago Pago, Kathmandu, St Johns, Lord Howe, UTC); exactly these two failures; every other day/zone correct.
- **Fix:** after the two passes, if `dateInZone(t + 1, zone) === value` advance by the offset delta (or search forward to the first instant whose date is the next day, minus 1 ms). **Regression test:** the loop above.

### D-08 — Low — long email actions on pages without `maxDuration`
- `deliverGroupMail` sends sequentially in chunks of 4 with up to 3 attempts and backoff (`lib/groupEmailPlan.ts:9-11,115-118`), for up to 200 members, inline in the action. The hosting pages (`app/[locale]/app/groups/[id]/page.tsx`, `groups/page.tsx`, `sessions/new` for async-session notices) export no `maxDuration`; only cup/results (120) and profile (300) do. With the platform default the function may be cut mid-broadcast. Damage is bounded: Resend idempotency keys are per (broadcast, member, attempt) and the ledger supports "retry failed", but a recipient sent-but-not-ledgered before the cut is re-sent on retry only if Resend's 24 h idempotency window has passed.
- **Verification:** Hypothesis (Vercel plan default unknown; not executed).
- **Fix:** `export const maxDuration = 120` on the pages that host group mail, as CLAUDE.md already prescribes for close-email pages.

### D-09 — Low — `notifyGroupOfSession` remains a public action that bypasses the start-time idempotence
- `app/actions/groups.ts:891-973` is exported from a `"use server"` file. It authorizes correctly (registered user, owns group AND session, session active), but it does not check `session.groupId === input.groupId` nor `groupNotifiedAt`, so the owner can POST it directly to email any of their groups about any of their sessions repeatedly, bypassed only by the email budget (3 broadcasts/h). Owner-only self-spam; low.
- **Verification:** Strongly supported (code read). **Fix:** move the body to `lib/` (server-only) and keep the exported action only if a UI calls it.

### Cross-area notes (one line each, not audited in depth)
- `app/[locale]/app/sessions/[id]/results/page.tsx:61-71` performs a write (solo close repair) during a GET render; guarded to solo owner + 20 s grace and emails skipped — acceptable but unusual.
- `lib/analytics/savedInsights.ts:21-34` lists ALL users' saved insights (no `createdBy` filter) to any analytics user; pre-existing, but now inconsistent with S8-08's per-user scope.

## 4. Traceability matrix

| Requirement / decision | Expected | Actual | Evidence | Status |
|---|---|---|---|---|
| Schema == main + 10 migrations | identical | identical (plus SQL-only partial index, documented) | `prisma migrate diff --from-schema main --to-schema HEAD --script` output matches the union of the ten `migration.sql` files statement for statement (names, types, nullability, defaults, indexes, FKs, cascade rules) | Compliant |
| Migrations additive, safe on live tables | no rewrite, no long lock | constant defaults, nullable adds, one bounded UPDATE backfill, one CREATE UNIQUE INDEX on an empty predicate (non-CONCURRENTLY, brief lock) | migration files | Compliant |
| No migration depends on a later one | independent | independent (each touches distinct objects) | replay | Compliant |
| Old code tolerates new schema | yes | yes; new code requires the schema | runbook §11/§18/§19/§20/§23 | Compliant |
| Rollback | code revert safe | safe except after label-only history rows exist (documented §21) | `lib/coffeeHistory.ts`, §21 | Partially compliant (documented trap) |
| New user columns in manifest/merge/delete | all | `SessionReminderDelivery.userId`, `SessionParticipant.excludedBy`, `OutboundEmailEvent.actorKey` all listed and handled | manifest.ts:187-231, guestClaim.ts:314-323 | Compliant |
| No new Profile FK | n/a | none added | schema diff | Compliant |
| RLS on new tables | enabled, no policies | `session_reminder_deliveries` in migration; other two in PHASE 22 | migration, rls_and_triggers.sql:1546-1557 | Compliant (manual step) |
| PHASE 21 column-GRANT rule (session_samples) | new columns granted | no S8 migration adds a session_samples column | schema diff | Compliant |
| ActionErrorCode ↔ errors.codes | 1:1 both locales | 1:1, both locales; round-trip tested | temp test (passed) | Compliant |
| Every t() key exists es+en | yes | 1 miss (`common.tasteThis`) | D-02 | Noncompliant |
| es/en key parity | identical | 1,849 = 1,849 | script | Compliant |
| No generateStaticParams on authed [id] routes; force-dynamic | yes | new `sessions/[id]/invite` force-dynamic; results-csv & unsubscribe force-dynamic + nodejs | grep | Compliant |
| proxy.ts naming | `proxy` export | yes; build shows `ƒ Proxy (Middleware)` | build log | Compliant |
| outputFileTracingIncludes for PDF routes | every PDF-rendering function | crons + sessions pages + report routes covered; results-csv renders no PDF | next.config.ts:37-46 | Compliant |
| vercel.json crons | new passes registered | no new cron; repair + reminders inside the existing daily route | vercel.json, route.ts | Compliant |
| env vars | new required listed in env.ts + runbook §3 | none new required; `ANALYTICS_SUPER_ADMIN_EMAIL` recommended (warn) | lib/env.ts | Compliant |
| maxDuration on pages with long actions | yes | cup/results/profile yes; group-mail pages no | D-08 | Partially compliant |
| Consolidated deploy order | one procedure | per-PR sections | D-03 | Noncompliant |
| CLAUDE.md / flows.md match code | yes | three stale passages | D-04 | Partially compliant |
| Test coverage of irreversible paths | runtime tests | text scans only | D-05 | Not implemented |

## 5. What I executed (real output)

- `git checkout --detach origin/claude/s8-21-loose-ends-impl` → HEAD `3713033`; `git diff --stat origin/main...HEAD` → `420 files changed, 27081 insertions(+), 3100 deletions(-)`.
- `npm ci && npx prisma generate` → exit 0.
- `npx prisma migrate diff --from-schema <origin/main schema> --to-schema prisma/schema.prisma --script` (no DB connection) → SQL identical to the ten migrations (minus their comments, backfill, RLS line and the partial index, which Prisma cannot express).
- `npx tsc --noEmit` → exit 0, no output.
- `npx vitest run` (isolated) → `Test Files 114 passed (114)`, `Tests 1088 passed (1088)`. (An earlier concurrent run logged 2 timeouts in FS-walk tests; see D-05.)
- `npx eslint` → `✖ 11 problems (4 errors, 7 warnings)`, exit 1. The 4 errors are in `app/[locale]/dev/page.tsx` (2× react/no-unescaped-entities) and `components/ui/IntensitySlider.tsx` (2× react-hooks/refs) — neither file is in the S8 diff (baseline). Changed files carry warnings only (`coffees/new/page.tsx`, `lib/wizardDraft.ts:87`). I did not run lint on main to prove the baseline count.
- `npm audit --omit=dev` → `19 vulnerabilities (1 low, 6 moderate, 11 high, 1 critical)` (D-01).
- `npx next build` → `✓ Compiled successfully`, exit 0; routes include `ƒ /[locale]/app/sessions/[id]/invite`, `ƒ /[locale]/auth/confirm`, `● /[locale]/privacidad`, `● /[locale]/terminos`, `ƒ /api/groups/unsubscribe`, `ƒ /api/sessions/[id]/results-csv`, `ƒ Proxy (Middleware)`.
- Scripts (outside the repo, scratchpad): i18n key-usage + parity check; dead-export scan; optional-prop wiring scan; server-action auth-helper scan (every unguarded-looking export delegates to an authorized core or is token-gated by design).
- Temporary test `tests/_audit_D_zone.test.ts` (DST sweep + error contract) → 2 passed, 1 failed (D-07). Deleted; `git status --short` is clean.

## 6. Unverified, and what would settle it

- That the ten migrations apply cleanly to the real production schema (drift since earlier hotfixes is possible): `npx prisma migrate status` + `migrate diff --from-config-datasource --to-schema` against a Supabase branch restored from production.
- `deleteAccountData`, `mergeGuestData`, close/repair, label-only history with the partial index, ordered evaluation writes, group mail ledger under timeouts: run §24's script and a guest-claim → delete → close → cron-repair scenario on that branch.
- PHASE 21/22/23 on the live database (dry-run files exist; not executed).
- Whether the Vercel plan's default function duration cuts group broadcasts (D-08): send to a 200-member test group on a preview.
- Exploitability of the Next.js advisories against this deployment (D-01).

## 7. Answers for this area

- **Did the implementer correctly implement the architecture?** For schema and migrations, yes, and verifiably: the ten migrations reproduce `schema.prisma` exactly, are additive and order-independent, and every new user column is in the manifest, the merge and the deletion. The cross-team contracts mostly hold (error codes 1:1, i18n parity, Next 16 conventions, tracing, env). Defects are at the edges: one unwired translation key, stale normative docs, a per-PR runbook that does not describe the one deploy that will actually happen.
- **Was the architecture sound?** Yes for this area. The manifest-driven FK bookkeeping and the two-phase close with a stamp are good designs. The weakness is assurance: the guards are text scans, not executions.
- **Most serious defects or risks?** (1) Framework version with critical/high advisories, including proxy bypass (baseline, D-01). (2) Nothing in the S8 data paths has ever touched a database, and the irreversible ones (account deletion, guest merge) have no runtime test (D-05). (3) Deploy ordering is easy to get wrong from the current runbook (D-03).
- **Must fix before reliable:** upgrade Next (D-01); a combined deploy checklist (D-03); one end-to-end rehearsal on a non-production Supabase branch with all migrations + PHASE 21–23 applied (D-05); the `tasteThis` key (D-02); the stale CLAUDE.md/flows.md lines (D-04).
- **Remaining uncertainties:** production schema drift; behaviour of the transactions under real Postgres (FK re-checks, trigger re-fire cost); function duration limits on email-heavy actions.
