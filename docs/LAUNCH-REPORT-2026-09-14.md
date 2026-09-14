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

## 3. What was found

The architecture was sound. The scoring core, coffee-code generation, offline replay,
email degradation and the guest-claim flow were all carefully built. Problems clustered
in three places.

**Security, five issues.** The most serious: two row-security policies were written with
no role restriction, which in Supabase means they apply to the anonymous role, and the
anonymous key ships to every browser. Any visitor could read every session invite token on
the platform and walk into any group tasting, and could read every user profile row. Also
found: two unauthenticated server actions exposing private coffee records, an unvalidated
coffee identifier allowing another owner's private coffee to be attached to a sample,
participants able to overwrite the organiser's green-bean and reveal data, and a path to
resolve any account's email address from a user identifier.

**Data loss and integrity, three issues.** Deleting a session cascade-deleted every
participant's evaluations and their coffee history with no warning. A closed session
remained fully editable, and post-close edits did not re-fire the aggregate trigger, so
stored scores silently diverged from the underlying data. Closing a group session was not
idempotent, so a second click re-sent every participant's PDF, and because it never
revealed samples it usually wrote no coffee history at all.

**Flow dead ends, six.** Live sessions could only be started from a wizard screen the
organiser leaves immediately, stranding participants forever. Deadlines on asynchronous
sessions were never enforced. Other issues covered invite-link handling, the waiting room,
zero-sample sessions and the cupping error boundary, which could loop indefinitely.

**Error handling.** One error boundary existed in the entire application. There was no
404 page, no loading states, roughly 48 server actions that failed with an opaque digest
the user interface could not interpret, no feedback mechanism, no error reporting, and no
automated tests.

## 4. What was delivered

Seven commits across six work packages.

| Package | Content |
|---|---|
| Security | Policy fix, owner-gating for per-sample data, coffee identifier validation, co-cupper scoping for email lookups, read helpers moved out of the server-action surface |
| Error foundation | Shared error panel, five boundaries, localized 404, loading skeletons, login failure notice, resilient middleware |
| Session state machine | One idempotent close routine shared by three callers, closed-means-read-only enforced everywhere, delete that preserves history, invite-link fixes, start control, daily deadline job |
| Action contract | Result type and wrapper, validation helpers, server-derived scoring inputs, toast feedback, join forms converted |
| Observability | Request-error logging keyed to the support code users see, honest save status, offline storage hardening, pending-draft indicator |
| Deploy hygiene | Boot-time environment assertions, security headers, service-worker fix, cache-clearing sign-out, guest scoping, 33 unit tests |

Roughly 5,900 lines added across 102 files.

## 5. What was verified after deploy

Each claim below rests on a check performed against production, not on assumption.

| Claim | How it was proven |
|---|---|
| New build is live | The five security headers now present did not exist before |
| All eight required environment variables reached production | The deploy booted. The startup assertion fails the boot when any is missing |
| The scheduler secret took | Both cron routes answer 401, not the 503 returned when the secret is absent |
| Migration applied correctly | Schema inspected directly: new column, new table, two columns made nullable, two columns added |
| No data was harmed | 123 sessions, 1,070 evaluations and 83 history rows intact after migration |
| Application runs against the migrated schema | Key routes exercised locally against the production database before the deploy |
| New error surfaces render | Localized 404 and the invalid-invite card, both confirmed in a browser |
| Policy fix holds | Live policy inspection shows no anonymous read on invites or profiles |

## 6. Two mistakes made during this work

Recorded because both are instructive and both were caught.

**The policy lock broke live updates.** Revoking execute permission on a helper function
also removed it from the role that row-security policies run as, which would have silently
broken every realtime subscription. Caught by testing the function as that role against
production rather than trusting the change. Fixed the same day and documented as a
standing rule: a function called by a policy must keep execute permission for signed-in
users.

**A wrong diagnosis about the site URL.** A trailing slash was claimed to break the
printed join code by dropping the locale segment. Testing both forms against production
disproved it. The missing locale was normal behaviour, because the default language
carries no prefix in this application. The advice given happened to be harmless, but the
reasoning was wrong and was corrected in the record.

## 7. What remains

**Before running a real event.** The smoke test in runbook section 5. The authenticated
group-session flow, create through join, start, submit, close and delete, was never run
end to end, because it requires a real login and would have written test data into the
live database. This is the largest remaining gap and is roughly fifteen minutes of work.

**When the domain is ready.** Runbook section 6, five steps. The redeploy and the
authentication callback allow-list are the two that fail quietly if skipped.

**After launch, not urgent.** Narrowing analytics-access users to their own data rather
than platform-wide; an account-deletion path; an affected-user warning when deleting a
coffee; a content security policy; converting the remaining server actions to the result
contract; making the monthly digest job fully idempotent.

## 8. Honest assessment

The security holes were real and are closed. The data-loss paths were real and are closed.
The error handling went from one boundary and silent failures to a consistent contract with
user-visible messages and traceable logs.

The main residual risk is coverage, not correctness. The test suite covers pure logic:
the scoring formula, validation, session rules, error mapping and guest scoping. It does
not cover the database, the authenticated flows, or the interface, and no integration or
end-to-end tests exist. Several of the most valuable behaviours shipped here, the close
routine, the delete-with-snapshot path and the daily job, have been reasoned about and
type-checked but never executed against real data with a real user. The smoke test is
what converts that reasoning into evidence, which is why it is the top recommendation.
