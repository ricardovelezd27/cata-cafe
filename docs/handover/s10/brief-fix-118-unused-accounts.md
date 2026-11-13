# Brief — PR #118 (S10 WP9a, legal pages): the owner's retention decision, English in step, review fixes

Branch: check out the EXISTING branch `claude/s10-09a-legal-impl` (tip `986c1f7` when this was
written): `git fetch origin && git checkout -b s10-09a-fix3 origin/claude/s10-09a-legal-impl`,
then `git merge origin/main` (never rebase or force-push). Push with
`git push origin HEAD:claude/s10-09a-legal-impl`. The PR exists (#118): do not open a new one;
update its body. `LEGAL_PAGES_PUBLISHED` stays `false`.

Read first: CLAUDE.md ("Auth Pattern", "Account deletion (S8-19)", "Guest → account", the
runtime DB suite, "Cron routes", "Logging"), `lib/legal/es/privacy.ts` (the Spanish is the
source of truth; the architect wrote it and it is FINAL for this round: do not reword it),
`lib/legal/config.ts`, `lib/waitlistPurge.ts`, `lib/legal/waitlistRetention.ts`,
`lib/supabase/adminUsers.ts`, `app/actions/waitlist.ts`, `lib/magicLink.ts`,
`lib/accountDeletion/` (manifest, plan, deleteAccount), `app/api/cron/close-expired-sessions/route.ts`,
`lib/features.ts`, `tests/db/README.md` and `tests/db/support/` (the Supabase shim),
`prisma/sql/rls_and_triggers.sql` `handle_new_user`.

## The fact the last review established
Every founding-seat reservation, and every request for a sign-in link or code, creates an
account at once: `signInWithOtp` creates an unconfirmed `auth.users` row and the
`handle_new_user` trigger creates a `Profile`. So "a reservation without an account" does not
exist, and the current purge (`purgeWaitlist`) deletes almost nothing.

## The owner's decision (2026-11-14): really delete after 12 months
The Spanish privacy text (sections 3 and 10) now says: an account that was never used (a seat
was reserved or an access was requested, but the person never signed in) is deleted, with its
reservation, once `WAITLIST_RETENTION_MONTHS` months have passed since it was created; if the
person did sign in, the reservation is kept while the account exists. Build exactly that.

### 1. The job: `lib/unusedAccountPurge.ts` (replaces `lib/waitlistPurge.ts`)
**Which accounts.** An auth user is "never used" when ALL hold: not anonymous; never
confirmed and never signed in (`email_confirmed_at IS NULL AND last_sign_in_at IS NULL`;
check the installed GoTrue schema for the right columns, e.g. `confirmed_at`, `invited_at`,
and say what you used and why; a Google account is confirmed at creation and is never
selected); `created_at` older than the cutoff (`waitlistPurgeCutoff`, keep its calendar-month
arithmetic and tests; rename the module if it reads better); and no access email was sent to
it in the last 48 hours (`confirmation_sent_at`, `recovery_sent_at`, `email_change_sent_at`:
a link that is still in someone's inbox must not be broken; such an account is picked up by a
later run). Put the predicate in ONE pure function (inputs: the row's timestamps and flags,
`now`) with a unit test per condition and boundary, and mirror it in the SQL that selects
candidates; a DB test proves the two agree.

**Select candidates in SQL, on the server** (`prisma.$queryRaw` against `auth.users`; Prisma
connects as postgres), oldest first, bounded: at most 50 accounts per run. No full listing of
users through the admin API (the review showed its cap can silently truncate). Extend the test
shim's `auth.users` if it lacks the columns.

**The account must be empty.** A never-used account cannot have created anything, but rows can
point at it without its action (for example a group owner linking a member, a pending share
or invite, an access flag set by the super-admin). Walk EVERY table of
`lib/accountDeletion/manifest.ts` and decide per table, in a small pure plan with tests:
- rows that are the account's own bookkeeping → deleted with it (profile, waitlist row);
- rows owned by SOMEONE ELSE that merely point at it → unlinked exactly as account deletion
  already does for that table (e.g. a group member row keeps the address its owner typed and
  loses the user link); never delete another person's data;
- anything that shows the account WAS used (a session, an evaluation, a coffee, a group it
  owns, a participation, analytics access or an admin role on the profile) → the account is
  NOT deleted: skip it, count it as `skippedUsed`, log ids only. Exclude these in the candidate
  SQL where practical so skipped rows cannot fill the batch run after run.
Prefer reusing the existing, DB-tested deletion core (`deleteAccountData`) for the database
part if it does the right thing for an empty account and leaves no placeholder profile behind;
if it would create a placeholder or needs changes to its plan, do NOT change it: write the
minimal dedicated transaction instead, driven by the manifest so `tests/profileRelations.test.ts`
style guards still catch a forgotten table. Say which you chose and why. The super-admin
account is never a candidate.

**Order of deletion.** One transaction per account for the database rows (profile, waitlist
row matched on the normalised address, unlinks); then the auth user through the service-role
admin API, with the same bounded retry and orphan logging account deletion uses (reuse its
helper). Find out whether deleting the auth user cascades to the profile and make the order
safe either way. A failure on one account is logged (code and id only) and does not stop the
others.

**Waitlist rows with no auth user at all** (the access email failed when reserving) older than
the cutoff: deleted too (that is today's behaviour; keep it, in SQL, bounded).

**A used account keeps its reservation**, including after an email change: today the row is
matched by address, so `requestEmailChange` orphans it and it would be deleted after 12 months
although the account exists. Fix it going forward: when an email change COMPLETES (find the
completion point: `confirmEmailToken` / the confirm flow for the `email_change` type), move
the waitlist row to the new address in the same server step (only if a row exists for the old
address and none for the new; ids only in logs). State in the runbook that changes made before
this deploy cannot be reconciled.

**Switch.** `lib/features.ts`: `UNUSED_ACCOUNT_PURGE_ENABLED` ("1" = delete). Default OFF:
the job only COUNTS what it would delete. The daily cron
(`app/api/cron/close-expired-sessions`) calls it after its existing passes; its JSON summary
gains `unusedAccounts: { due, deleted, skippedUsed, failed, enabled }`; when `due > 0` and
the switch is off it logs one warning per run (`logWarn`, counts only). A failure of this pass
never fails the cron. Logs carry ids, counts and codes: never an address.

**DB tests** (`tests/db/`, real Postgres, admin API mocked as the suite already does): an
unused 13-month-old account with a reservation → profile, reservation and auth user gone; the
same at 11 months → untouched; confirmed or signed-in → untouched, reservation kept; an access
email 10 hours ago → untouched this run; an anonymous guest → untouched; an account that owns
a session, or has an evaluation, or is a linked group member → skipped or unlinked exactly as
your plan says, and the other person's rows are intact; a reservation with no auth user, 13
months old → deleted; switch off → nothing deleted and `due` reported; the batch bound; an
admin API failure → database rows handling as designed, orphan logged, next run retries or not
(say which); the email-change move.

### 2. Review fixes that remain
- `lib/coCuppers.ts` (~l.86-91): `evaluationCount` on the co-cupper card counts ALL of that
  person's evaluations on the platform. Scope it to the sessions shared with the viewer (the
  Spanish privacy text, section 4, now says "cuántas evaluaciones hizo usted en ellas"). Test.
- `lib/supabase/adminUsers.ts`: if `listAllAuthUsersStrict` still has callers, it must THROW
  when the page cap is reached while a next page exists (never a silent partial list); if
  nothing uses it any more, delete it.
- `components/legal/LegalPage.tsx` (~l.30): `break-words` on the `<dt>`.
- Tests (`tests/legalDocs.test.ts` and friends): the es/en parity check also compares the first
  cell of every `rows` entry whose key is a code identifier (`cata_…`, `sb-…`), so swapped or
  mismatched cookie rows fail; no hard-coded "12 meses" / "12 months" in the text files (the
  period must come from `WAITLIST_RETENTION_MONTHS`: test by rendering with the constant);
  the privacy files import nothing from `lib/signInPending*` / `lib/signInIntent*` (they
  describe those cookies by name in plain strings); the helper-import check matches single
  and double quotes.

### 3. English in step with the Spanish (`lib/legal/en/*`)
The Spanish changed in commits `d0e3ed6` and `986c1f7` (read both diffs): privacy section 3
(the reservation / access request item), section 4 (what co-cuppers see in Grupos), section 8
(coffee names sent by the analysis assistant), section 9 (the sign-in cookie row), section 10
(unused accounts); terms section 4 (first paragraph); legal notice 5.4 ("publique" → "publish")
and comment markers. Translate faithfully, same structure, plain British-neutral English, no
stronger and no weaker than the Spanish. Also `en/privacy.ts` (~l.68): "We do not
intentionally log…" (not "We deliberately do not log").

### 4. Docs
- `docs/LAUNCH-RUNBOOK.md`: rewrite the waitlist-retention section as "Unused accounts: the
  12-month deletion": what the job does; the read-only count the owner runs before the first
  deploy and whenever he wants (give the SQL, correct for this schema); the query for the
  OLDEST unused account's date (the switch must be on before that date + 12 months); the
  rehearsal on one throwaway address (request a link, never open it; one owner-run `UPDATE`
  in the SQL editor that back-dates that single account by id; trigger the cron by hand with
  the switch on after confirming the count is exactly 1; verify with read-only queries that
  the account, profile and reservation are gone and nothing else changed); how to switch it
  on in Vercel; what the cron summary shows. Add to "Publishing the legal pages": the pages
  state this deletion, so the switch must be on (after the rehearsal) before the first account
  reaches 12 months.
- CLAUDE.md: the env var (optional list), the job in "Cron routes" / auth notes, the
  email-change move. `docs/flows.md` if it shows the waitlist flow.
- PR body "Waiting on the owner": add (a) is custom SMTP configured in Supabase Auth (decides
  whether Resend also sends the access emails: the processors table), (b) a deletion request
  received by email cannot be carried out by a tool while account deletion is switched off,
  (c) the rehearsal and the switch above, plus what was already listed.

## Do not change
The Spanish text (report anything in it your code would make false instead of editing it),
`LEGAL_PAGES_PUBLISHED`, `deleteAccountData`'s behaviour, the account-deletion flag.

## Gates and delivery
All five gates (`npx tsc --noEmit`, `npm test`, `npm run test:db`, `npm run lint` with exactly
the 4 known errors in `app/[locale]/dev/page.tsx` and `components/ui/IntensitySlider.tsx`,
`npm run build` after the last change). Report: commits; the "never used" predicate as
committed (pure + SQL); the per-table plan (table → deleted / unlinked / blocks deletion) for
every manifest table; whether you reused `deleteAccountData` and why; the deletion order and
what a mid-way failure leaves; the cron summary shape; the email-change move and where it
runs; every English sentence changed, next to its Spanish; gate tails with exact counts;
anything in the Spanish that the code does not make true; anything not done or doubtful.
