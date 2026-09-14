# Launch-readiness review and remediation — final report

**Period:** 8 to 14 September 2026 · **Target launch:** 1 October 2026
**Outcome:** shipped to production on 14 September 2026, `main` at `255578c`
**Production:** <https://cata-cafe-opal.vercel.app> (interim domain)

Companion documents: `docs/CHANGELOG-launch-2026-09.md` (plain language, per user type),
`docs/LAUNCH-RUNBOOK.md` (the manual steps), `docs/HANDOVER.md` (state ledger),
`docs/flows.md` (normative flow diagrams), `CLAUDE.md` (the rules this work established).

---

## 1. What was asked

Review the codebase before launch, find real improvements rather than invented ones, map
the user flows, and assess error handling, which was suspected to be weak. User interface
and visual design were explicitly out of scope.

## 2. How the review was done

Three parallel read-only audits covering flow tracing, error handling, and data integrity
with authorization. Every high-severity finding was then re-read in the source by hand,
and the database-side findings were confirmed against the **live production database**
rather than against the SQL files, which is how the most serious issue was proven real
rather than theoretical.

The result was an approved plan containing 27 numbered findings across four severity
bands, six work packages, four product decisions, and an execution strategy. Sections 3
to 5 below account for every one of them.

---

## 3. Accounting against the approved plan

**Summary: 25 of 27 findings fully shipped. One is partial. One shipped by a different
mechanism than planned.** Both exceptions are described precisely rather than rounded up.

### P0 — Security (5 of 5 shipped)

| ID | Finding | Status | Where it landed |
|---|---|---|---|
| S1 | Anonymous key could read every invite token and every profile row | Shipped | `rls_and_triggers.sql` PHASE 18 + 18b, applied to production and verified by live policy inspection |
| S2 | Two unauthenticated server actions exposed private coffee records | Shipped | Moved out of the action surface to `lib/coffees/queries.ts` with `server-only` |
| S3 | `revealSample` accepted an unvalidated coffee id | Shipped | Re-validated against `usableCoffeeWhere` |
| S4 | Participants could overwrite the organiser's green-bean and reveal data | Shipped | `requireSampleOwner` on both upserts, payloads stripped for non-owners, tabs hidden |
| S5 | Any user id could be resolved to a live email address | Shipped | `isCoCupper` / `coCupperIdsAmong` gate, emails rendered masked |

### P0 — Data loss and integrity (3 of 3 shipped)

| ID | Finding | Status | Where it landed |
|---|---|---|---|
| D1 | Deleting a session erased every participant's evaluations and history | Shipped | `detachCoffeeHistoryForSession` with per-cupper snapshot, nullable FKs, `getDeleteImpact` dialog |
| D2 | Closed sessions stayed editable; edits desynced stored scores | Shipped | `assertSessionWritable` in every session and sample mutation, cup route redirects |
| D3 | Closing was not idempotent and never revealed, so history stayed empty | Shipped | `closeSessionInternal`, one routine shared by owner close, solo auto-close and cron |

### P1 — Broken flows (11 of 12 shipped, 1 partial)

| ID | Finding | Status | Where it landed |
|---|---|---|---|
| F1 | No way to start a live session; waiting room had no exit | Shipped | Start control in the master panel, waiting room reworked |
| F2 | Session deadlines were never enforced | Shipped | Daily cron at 06:00 UTC, registered and confirmed live |
| F3 | Owner demoted by own invite link; seat count burned on re-entry | Shipped | Owner and existing member are no-ops, seat limit enforced inside the transaction |
| F4 | Expired login link gave no explanation | Shipped | Localized notice, focus on the email field, resend affordance |
| F5 | Printed codes and emails pointed at localhost | Shipped | Boot-time assertion plus the value set in Vercel |
| F6 | One auth outage would 500 every page | Shipped | Middleware degrades instead of throwing |
| F7 | Close blocked on N document renders; delivery result discarded | Shipped | Background send, per-recipient ledger, bounded fan-out, result surfaced with a resend control |
| F8 | Invalid invite pages were dead ends with no error path | Shipped | Converted to action-state forms with distinct messages and escape links |
| F9 | Shared devices could serve the previous user's cached pages | Shipped | Sign-out clears the page caches, service worker excludes auth routes |
| **F10** | **Realtime channel death invisible at three subscription sites** | **Partial** | **Only the waiting room got a status callback and polling fallback. The cupping screen and the results screen still call subscribe with no status handler, so a dropped channel there remains silent.** |
| F11 | Zero-sample session crashed into a retry loop | Shipped | Empty state instead of indexing, retry budget on the boundary |
| F12 | Anonymous guests had the run of the app | Shipped | Guests confined to session routes, enforced in middleware, unit tested |

### P2 — Error-handling foundation (6 of 7 shipped, 1 by a different mechanism)

| ID | Finding | Status | Where it landed |
|---|---|---|---|
| E1 | One error boundary in the whole app, no 404, no loading states | Shipped | Five boundaries, localized 404 plus catch-all, two loading skeletons |
| **E2** | **~48 actions failed with an opaque digest** | **Shipped, differs from plan** | **8 actions moved onto the result contract. The remaining interactive ones (reveal, refresh, resend, invite-link, close) are caught at their call sites and show a generic message instead of the specific one. See the note below.** |
| E3 | No feedback primitive; bare transitions crashed the page | Shipped | Toast provider mounted at the locale layout, call sites converted |
| E4 | Prisma not-found and foreign-key errors handled nowhere | Shipped | Mapped in `classifyActionError`, unit tested |
| E5 | No validation layer; scoring inputs trusted from the client | Shipped | `lib/validate.ts`, and cup count and format now read from the session row |
| E6 | No error reporting at all | Shipped | `instrumentation.ts` logs each failure keyed to the support code the user sees |
| E7 | No tests of any kind | Shipped | 33 unit tests over scoring, validation, session rules, error mapping, guest scope |

**Note on E2.** The plan called for roughly ten interactive actions to move onto the result
contract. Eight did. The other four sit in files that were being edited concurrently, and
were instead wrapped in try/catch at the call site. The user-visible goal is met, nothing
crashes the page, but those four show the generic "something went wrong" message rather
than the specific one. A closed session, for example, reports generically instead of
saying the tasting is already closed.

### Product decisions (4 of 4 implemented as approved)

| Decision | Implemented |
|---|---|
| Session delete keeps anonymised per-cupper history | Yes, with the coffee-ownership confirm dialog you asked for |
| Deadlines enforced by a daily job | Yes, sharing the single close routine |
| Log-only observability, no third-party service | Yes |
| Start control in the master panel, waiting room kept | Yes |

### P3 — deferred by the plan (12 items)

Explicitly post-launch when you approved it. Two were completed incidentally and are no
longer outstanding: the missing security headers, and the four database functions callable
anonymously. The remaining ten stand, the most significant being that analytics-access
users still read platform-wide data rather than their own.

---

## 4. What was verified after deploy

Each claim rests on a check performed against production, not on assumption.

| Claim | How it was proven |
|---|---|
| New build is live | The five security headers now present did not exist before |
| All eight required variables reached production | The deploy booted. The startup assertion fails the boot when any is missing |
| The scheduler secret took | Both cron routes answer 401, not the 503 returned when the secret is absent |
| Migration applied correctly | Schema inspected directly: new column, new table, two made nullable, two added |
| No data was harmed | 123 sessions, 1,070 evaluations and 83 history rows intact afterwards |
| App runs against the migrated schema | Key routes exercised locally against the production database before deploy |
| New error surfaces render | Localized 404 and the invalid-invite card, confirmed in a browser |
| Policy fix holds | Live policy inspection shows no anonymous read on invites or profiles |

## 5. Mistakes made during this work

Recorded because all three are instructive, and because the last one was found only while
writing this section.

**The policy lock broke live updates.** Revoking execute permission on a helper function
also removed it from the role that row-security policies run as, which would have silently
broken every realtime subscription. Caught by testing the function as that role against
production. Fixed the same day and written into `CLAUDE.md` as a standing rule.

**A wrong diagnosis about the site URL.** A trailing slash was claimed to break the printed
join code by dropping the locale segment. Testing both forms disproved it: the missing
locale is normal, because the default language carries no prefix in this application. The
advice happened to be harmless but the reasoning was wrong, and the stored note has been
corrected.

**F10 was reported as complete when it was not.** The first version of this report said
realtime death was fixed. Only one of the three subscription sites was actually changed.
The gap was found by checking the code against the plan rather than trusting the summary,
which is the reason this section of the report now exists.

## 6. What remains

**Before running a real event.**

1. The smoke test in runbook section 5. The authenticated group-session flow, create
   through join, start, submit, close and delete, was never run end to end, because it
   requires a real login and would have written test data into the live database. This is
   the largest gap and is roughly fifteen minutes.
2. F10, the two remaining realtime subscription sites. Small, and the cupping screen is
   where it matters most, since a cupper whose channel dies stops seeing submissions
   appear with no indication.

**When the domain is ready.** Runbook section 6, five steps. The redeploy and the
authentication callback allow-list are the two that fail quietly if skipped.

**After launch.** The ten remaining deferred items, led by narrowing analytics-access users
to their own data, and an account-deletion path. Optionally, finishing the E2 conversion so
the last four actions report specific messages.

## 7. Honest assessment

The security holes were real and are closed. The data-loss paths were real and are closed.
Error handling went from one boundary and silent failures to a consistent contract with
user-visible messages and traceable logs.

The main residual risk is coverage, not correctness. The tests cover pure logic only:
scoring, validation, session rules, error mapping, guest scoping. Nothing covers the
database, the authenticated flows, or the interface. Several of the most valuable
behaviours shipped here, the close routine, the delete-with-snapshot path and the daily
job, have been reasoned about and type-checked but never executed against real data with a
real user. The smoke test is what converts that reasoning into evidence, which is why it
remains the top recommendation.
