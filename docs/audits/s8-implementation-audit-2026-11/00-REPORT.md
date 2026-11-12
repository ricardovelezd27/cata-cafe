# S8 implementation — independent engineering audit (2026-11-10)

**Audited commit:** `3713033` (`claude/s8-21-loose-ends-impl`), 420 files and about 27,000 lines over
`main@6c4ecf5`: the fifteen S8 specs plus six follow-ups, chained in merge order.

**Who did what.** Specs and decisions: Claude Fable 5.2 (architect). Code and per-PR reviews: Claude
Sonnet 5.5. This audit: four independent Claude Opus 5.5 auditors, one focus area each, read-only, each
running the type check, the test suite, the build and its own temporary tests. Their full reports are
the four files beside this one:

| File | Area | Critical | High | Medium | Low |
|---|---|---|---|---|---|
| `A-security.md` | Security, authorization, SQL | 0 | 1 | 3 (+1 outside the diff) | 8 |
| `B-lifecycle.md` | Session lifecycle, scoring, data integrity | 0 | 1 | 2 | 5 |
| `C-offline-client.md` | Offline sync, realtime, client state | 0 | 0 | 4 | 4 |
| `D-integration.md` | Schema, migrations, contracts, tests | 0 | 1 | 4 | 4 |

This file is the architect's consolidation. Where it disagrees with an auditor it says so.

## A. Executive assessment

The series is in better shape than its history suggested, and not yet ready for production as it stood.

- **No Critical finding.** No path was found that exposes another user's data, deletes another user's
  rows, or corrupts stored results in normal use.
- **Three High findings**, each with a small fix: an input-validation hole in scoring (B-01), an
  irreversible feature shipping enabled without ever having run (A-01), and a framework version with
  published advisories that predates this work (D-01).
- **Thirteen Medium findings.** Most are defects at the seams between pieces: a database-policy gap on
  five tables the first hardening pass did not cover (A-02), a stale offline send that can overwrite a
  newer edit (C-01, C-02), a waiting-room poll that dies after one network error (C-03), one visible
  raw translation key (D-02), and docs that contradict the code (D-03, D-04).

**Evidence behind this assessment.** Executed by the auditors on the audited commit: `tsc --noEmit`
exit 0; `vitest` 114 files / 1,088 tests passed; `next build` exit 0; `prisma migrate diff` from
`main`'s schema to the tip reproduces exactly the ten migration files; 1,556 translation-key usages
checked by script (one miss); 278,000 generated cases comparing the TypeScript score with a port of the
SQL trigger (8 boundary mismatches of 0.25); a daylight-saving sweep over two years and fourteen time
zones (two wrong days); about 60 temporary tests on validators, throttles, tokens and state machines.

**Not verified by anyone.** Nothing has run in a browser, on a device, or against a database, with one
exception: PHASE 21 was dry-run and then applied in production on 2026-11-10 and checked afterwards.
The account-deletion transaction, the guest-claim merge, the two-phase close with its repair pass, the
ordered evaluation write and the group-mail ledger have never executed against Postgres.

**Confidence.** High that the code type-checks, builds and satisfies its unit tests. Moderate that the
server-side rules are right, because they were read path by path by a second model. Low for anything
that only shows at runtime (realtime delivery, service worker behaviour, email, phone lifecycle).

## B. Findings register (Critical, High and Medium)

Full evidence, line references and reproduction steps are in the area files under the same ids.

| ID | Sev. | Category | Finding | Status | Decision |
|---|---|---|---|---|---|
| B-01 | High | Implementation / Security | Affective ratings are not validated on the server. `sabor_af_final: 9999` yields an individual score of 100 and drags the community score to 100; a non-numeric value is stored as is and is expected to make the SQL trigger throw for that sample. Reachable by any member, guests included. | Verified (TS, executed); the trigger failure is strongly supported | **Fix before release.** Clamp every affective value to an integer 1 to 9 inside `computeEvaluationDerived`; write and re-fire in one transaction. |
| A-01 | High | Architecture vs implementation | Account deletion ships enabled for every user. It is irreversible and has never run against a database. | Strongly supported | **Fix before release.** Ship it behind a flag that is off. The architect first excluded this feature, then built it as a follow-up on the spec's default; the auditor is right that enabling it is a separate decision. |
| D-01 | High | Dependencies (predates S8) | `next@16.2.4` carries published advisories, including a proxy bypass on prefetch routes and a Server Action denial of service. Layouts and actions re-check auth on the server, which limits impact. | Verified (`npm audit`); exploitability is a hypothesis | **Fix before release**, as its own change so it can be reverted alone: upgrade to the patched 16.4 line and rebuild. |
| A-02 | Medium | Security | PHASE 21 hardened nine session tables. Five others still accept writes from any signed-in token: `tasting_groups`, `tasting_group_members`, `group_posts`, `coffees`, `user_coffee_history`. A group owner can insert a member row with any user id and have the app email that user. `coffees_select` has no `TO authenticated`. | Strongly supported | **Fix before release.** PHASE 24: remove every write grant from the API roles across the schema, replace `FOR ALL` policies with read-only ones. |
| A-03 | Medium | Security | Code and link verification have no throttle in the app; Supabase sees one server IP for all users. | Verified (code); IP attribution is a hypothesis | **Fix before release.** Add a `code_verify` limit to the existing ledger. |
| A-04 | Medium | Security | `requestEmailChange` sends mail outside the email budget. | Hypothesis on impact | **Fix before release** (small). |
| B-02 | Medium | Implementation | Clearing the closing date of a running self-paced session sets `isAsync=false` while `startedAt` is null, so every participant is locked out. | Strongly supported | **Fix before release.** |
| B-03 | Medium | Implementation | After a guest claim where the guest's evaluation wins, the account's coffee history keeps the losing score. | Strongly supported | **Fix before release.** |
| C-01 | Medium | Reliability | The replay pass sends a snapshot taken at its start, so an older draft can be applied after a newer live save (physical and origin data have no ordering at all). | Strongly supported | **Fix before release.** Reload the module right before each send. |
| C-02 | Medium | Reliability | With a fast device clock the timestamp clamp lets the same stale send through for evaluations. | Verified (executed) | Fixed by the C-01 change; add the test. This one is a defect in the architect's own clamp decision: it closed one hole and opened this one. |
| C-03 | Medium | Regression | The waiting-room fallback poll stops forever after one failed request. | Verified (executed) | **Fix before release.** |
| C-04 | Medium | Reliability | The service worker may evict the current build's core scripts first. | Hypothesis | **Fix before release** (cheap): refresh entries on use. |
| D-02 | Medium | Integration | The coffee page's main button renders the raw key `common.tasteThis`. | Verified (script) | **Fix before release.** |
| D-03 | Medium | Documentation | The runbook has no procedure for ten pending migrations and four SQL phases at once. | Verified | **Fix before release.** One combined rollout section. |
| D-04 | Medium | Documentation | CLAUDE.md and flows.md contradict the code in three places. | Verified | **Fix before release.** |
| D-05 | Medium | Testing | The irreversible and data-moving paths are guarded by source scans, not runtime tests. | Verified | **Next cycle.** Needs a disposable database; see section D. |
| A-13 | Medium | Security (outside the diff) | `app/api/dev/sign-in` is dev-only, but its password for the `*@cata.test` users is in the repository. If those users exist in production, anyone with the repository can sign in as them. | Hypothesis | **Owner decision.** Checked in production during rollout; removing or re-keying those users is the owner's action. |

Low findings (17) are listed in the area files. Fixed in this pass: A-05, B-05, B-06/D-07, B-07, C-05,
D-09 and the saved-insights scope note. Left for the next cycle: A-06 to A-12, B-04, B-08, C-06 to
C-08, D-06, D-08.

## C. Architecture versus implementation

Each area file carries its own matrix. The decisions that matter most:

| Decision | Status | Evidence |
|---|---|---|
| One close routine writes `closed` | Compliant | grep over the tip; B report |
| Closed or expired sessions are read-only in every action | Compliant, one Low gap (A-05) | `tests/useServerExports.test.ts`; A report |
| Authorization only through `lib/sessionAuth.ts`; no client-supplied session id trusted | Compliant | A report, every `"use server"` export read |
| Guests cannot create assets or send mail | Compliant in the app; **Noncompliant at the database for five tables** (A-02) | A report |
| The browser key cannot write session data | Compliant (verified in production after PHASE 21) | dry run and post-apply checks |
| Scoring inputs never come from the client | **Partially compliant**: cup counts and format are server-side, the rating values were not bounded (B-01) | B report, executed |
| TypeScript score equals the SQL trigger | Partially compliant: equal in 99.99% of generated cases, 0.25 apart in rare rounding cases (B-04) | B report, executed |
| Ten migrations equal the schema, additive, independent | Compliant | `prisma migrate diff`, D report |
| Every table with a user reference is covered by merge and delete | Compliant | D report |
| Interactive actions return `ActionResult` and callers read it | Compliant (about 30 call sites read) | C report |
| Account deletion not built until owner decisions | **Noncompliant** with the first decision; built later on the spec default (A-01) | A report |
| Per-group unsubscribe not built | Built later as a follow-up; reviewed, public route neutral on failure | A report |

## D. Prioritized remediation plan

**P0 — immediate.** None.

**P1 — before release** (being built as four changes on top of the audited tip):

1. *Server rules* — B-01, B-02, B-03, A-03, A-04, A-05, B-05, B-06/D-07, B-07, D-09, saved-insights
   scope, and A-01's flag (`ACCOUNT_DELETION_ENABLED`, default off). Regression risk: low to moderate;
   B-01 touches the save path of every evaluation. Verified by new unit tests for each rule and a
   re-audit of the diff.
2. *Client and offline* — C-01/C-02, C-03, C-04, C-05, D-02. Regression risk: moderate in the sync
   hook. Verified by unit tests on the pure parts and a re-audit; needs a device check after deploy.
3. *Database and docs* — A-02 as PHASE 24 with a fail-safe dry run; D-03 combined rollout section;
   D-04 doc corrections. Regression risk: low (no browser code reads or writes these tables).
   Verified by the dry run in production before applying.
4. *Framework upgrade* — D-01. Regression risk: moderate. Verified by type check, tests and build; it
   is the last change in the chain so it can be reverted by itself.

**P2 — next development cycle.** D-05: a disposable database (a Supabase branch or a local Postgres)
and runtime tests for deleteAccount, mergeGuestData, close and repair, ordered writes and the mail
ledger. Then enable account deletion. Also A-06, A-07, A-08, B-04, B-08, C-06, C-07.

**P3 — optional.** A-09 to A-12, C-08, D-06, D-08.

## E. Test coverage and remaining uncertainty

- **Tested and passing:** see section A. Two filesystem-scan tests time out at 5 s when the suite runs
  alongside the type check; they pass alone.
- **Unverified workflows:** everything that needs a database or a browser. The most important are the
  guest claim, closing a group session with its emails, the cron repair, offline replay on a phone,
  and account deletion.
- **D-05 status (S9-04, 2026-11-12):** partly closed. `npm run test:db` now runs the data-moving paths
  (aggregate trigger vs TypeScript, close and repair, session delete, guest merge, account deletion,
  ordered evaluation writes, email ledgers, RLS as `authenticated`) against a disposable local
  Postgres. Still open: the real Supabase auth user deletion, GoTrue/PostgREST/Realtime behaviour,
  production data volume and the browser. See `tests/db/README.md` and PR "S9-04".
- **What would raise confidence:** one rehearsal on a non-production database with all migrations and
  SQL phases applied, covering guest join → cup → claim → close → cron → delete account; and a
  two-phone session after deploy.

## Phase 7 — the five questions

1. **Did Sonnet correctly implement Fable's architecture?** Mostly. The structure, guards, pure-rule
   modules and tests follow the decisions closely, and no case was found where the implementer
   contradicted a stated rule. The defects are at boundaries the specs did not spell out: unbounded
   input values, callers of a function whose contract changed, pieces built and not connected.
2. **Was Fable's architecture appropriate and sound?** For this product, yes: rules in pure modules,
   one authorization gate, the database refusing what the app refuses. Three architect-level errors
   are on record: PHASE 21 covered nine tables and missed five (A-02); the timestamp clamp added
   during review introduced C-02; and account deletion was built after first being excluded, without
   a flag (A-01). The parallel build also produced avoidable overlap that took two integration passes
   to resolve.
3. **Most serious defects or risks?** B-01 (a guest can force a perfect community score), A-02 (five
   tables writable around the app), C-01 (a stale offline send overwrites a newer edit), and the fact
   that the data-moving transactions have never run.
4. **What must be fixed before this is reliable?** The P1 list above, then one real rehearsal against
   a database. Account deletion stays off until that rehearsal has happened.
5. **What uncertainties remain?** Runtime behaviour of realtime under the new policies, the service
   worker on a real build, Supabase's rate limits and email templates, phone lifecycle, and whether
   production's live trigger and policies match the repository everywhere outside PHASE 21.
