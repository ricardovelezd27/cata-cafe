# S9 — Production database cleanup (test data)

> Prompt for a fresh session. Written 2026-11-12. Owner: Ricardo.
> Read `CLAUDE.md`, then `docs/handover/S8-ROLLOUT-HANDOVER.md` (§3 "How SQL was run from a
> session" and the last section) before doing anything.

## Goal

Remove the test data that months of development left in the production database, without
touching anything a real cupper created or took part in. When you finish, Ricardo has a
report of exactly what was removed, what was kept and why, and a way to restore what was
removed.

## Constraints you must not work around

- **There is one database and it is production** (Supabase project `dpkgcgdywjfmffqnkqsk`).
  Never run `prisma migrate`, seeds, or the dev server against it.
- **Nothing is deleted without Ricardo's explicit yes for that batch.** A general "go ahead"
  from an earlier message does not cover a later batch. Show him the list first, every time.
- **Every destructive statement is rehearsed first** as a self-rolling-back dry run
  (`DO $$ … RAISE EXCEPTION 'DRY RUN: …' $$`) that prints the row counts it would touch. The
  real run uses the identical statement inside one transaction and must report the same
  counts, or you stop.
- SQL runs in the Supabase SQL editor in the browser pane; Ricardo signs in. If the
  session's permission system refuses a run, load and checksum the script and ask him to
  press Run. Do not look for another route.
- Reference data is out of scope: `reference_series`, `benchmark_lots`, `_prisma_migrations`,
  `insight_narratives`, `digest_runs`, the waitlist.

## Known facts (read-only, 2026-11-11; re-check, do not trust)

- Survey of 2026-11-12: 174 sessions (117 closed, 57 active), 1,489 evaluations, 459
  coffees, 7 groups, 790 history rows, 501 auth users of which 315 anonymous.
- 26 sessions have no evaluation at all (19 older than 30 days); 29 are still active and
  older than 60 days.
- 21 sessions have a test-like name, holding 34 submitted evaluations; **4 of them have a
  cupper other than the owner.** Several belong to Kim and are real teaching sessions
  ("Ejemplo de coaching…", "Prueba Podcast Barista Emprendedor", "Calibración, Cata, junio
  2026. Ejemplo."). Kim (`kim@estudiodecafe.online`) owns 50 sessions, 28 of them shared.
- The `@cata.test` accounts own 11 sessions; 1 has a cupper other than its owner.
- 113 anonymous users have no evaluation; 210 anonymous users are older than 30 days.
- 77 coffees are not used by any sample; 17 coffees have a test-like name.
- Three accounts `master@`, `par1@`, `par2@cata.test` exist in production. Their password
  is in the repository (`app/api/dev/sign-in/route.ts`, audit finding A-13). `master@` owns
  8 sessions (7 open), `par1@` 3 (3 open), `par2@` none.
- Never-started live group sessions: "[DEV] Sesión de prueba 19:26"
  (`cmvgygod40001ewtvrs9bthga`, owner `master@cata.test`, 3 evaluations), "Ejemplo de cata."
  (`cmu4kl330000104jvl9wcc1wg`, real owner, 0 evaluations), "Artisan Brasil anaerobico"
  (`cmqteucs4000104jr9qdwbsqf`, real owner, 4 participants, 4 submitted). **The last one is
  real data: it is to be closed by its owner, never deleted.**
- "[TEST S8] prueba tras el despliegue - borrar" (`cmwbf3p8q000708kx9xt3jf7w`), closed, owned
  by Ricardo's test account.
- The app's super-admin is `ricardo.velez88@gmail.com`. Ricardo also tests with other
  mailboxes of his own; ask him for the list rather than guessing.

## Step 1 — Inventory (read-only)

Produce one table per category, with counts and the 20 most recent examples each. Aggregate
long lists into one row (the result grid is virtualized).

1. Sessions owned by `@cata.test` accounts.
2. Sessions owned by Ricardo's own accounts (ask him which addresses).
3. Sessions whose name looks like a test (`[DEV]`, `[TEST`, "test", "prueba", "ejemplo",
   "demo", "borrar", keyboard mash). A name is a hint, never proof.
4. Sessions with no evaluation at all, split by age (older / newer than 30 days).
5. Sessions still `active` and older than 60 days.
6. Anonymous users with no evaluation and no participation, split by age.
7. Coffees owned by test accounts, coffees never used by any sample, coffees with test-like
   names.
8. Tasting groups owned by test accounts or with only test members; their posts and
   email ledger rows.
9. Leftover rows in ledgers that point at any of the above: `close_email_deliveries`,
   `group_email_deliveries`, `outbound_email_events`, `ai_chat_usage`, saved insights.

For every session in categories 1 to 5 add the column that decides everything:
**does any account that is not a test account have an evaluation or a participation in
it?** If yes, the session is "shared with a real person" and goes on a separate list that
is kept by default.

## Step 2 — Classify with Ricardo

Present three lists and ask him to confirm or move items (use AskUserQuestion; do not
decide product questions yourself):

- **Delete**: test-only sessions (no real person took part), empty abandoned sessions,
  test accounts' coffees and groups.
- **Keep**: anything a real person took part in, even if it is named "prueba".
- **Decide**: borderline cases, each with one line of evidence.

Questions he must answer before step 4:

- The three `@cata.test` accounts: delete them with their data, or keep them for local
  development and only re-key them (then the dev sign-in password moves to `.env.local`)?
- Empty anonymous users: delete those older than N days? What N?
- His own old test sessions on his real accounts: all, or only the ones he ticks?

## Step 3 — Backup of what will be removed

- Confirm in the dashboard which backups the project's plan gives (daily backups, PITR) and
  write the answer in the report.
- Export every row that the approved batches will delete, per table, as JSON through the
  SQL editor, and save it under `docs/handover/cleanup-2026-11/` **only if it contains no
  personal data**; otherwise save it outside the repository and tell Ricardo the path.
  Emails, names and evaluation notes are personal data.

## Step 4 — Delete, in this order, one approved batch at a time

Know these rules of the schema before writing any statement:

- **Deleting a session through SQL skips the app's history rule.** `deleteSession`
  (`app/actions/sessions.ts`) first runs `detachCoffeeHistoryForSession` so every cupper
  keeps their `UserCoffeeHistory` rows with a snapshot. For a test-only session that is the
  opposite of what we want: the history rows of the test cuppers must go too. Delete the
  `user_coffee_history` rows of that session explicitly, in the same transaction, before the
  session row.
- `SessionSample` cascades to `Evaluation`, `PhysicalEvaluation`, `ExtrinsicData` and
  `AggregateScore`; `CuppingSession` cascades to `SessionParticipant` and `SessionInvite`.
  Check every other foreign key to these tables in `prisma/schema.prisma` before trusting
  that list, and report any `Restrict`.
- **Coffees are never row-deleted by the app** (owner delete = anonymize). A test coffee
  that no kept session and no kept history row references may be row-deleted; one that is
  still referenced is left alone and listed.
- **Users**: the tables that reference a user are listed in
  `lib/accountDeletion/manifest.ts`. Delete a test account's rows following that manifest,
  then the `profiles` row, then the auth user (dashboard → Authentication → Users, or
  `auth.users`). Never leave an auth user without a profile or the reverse.
- Community scores of kept sessions must not change. A kept session must lose no
  evaluation; verify with a before/after count and a checksum of `aggregate_scores` over the
  kept sessions.

Order: ledgers and history of the batch → sessions → coffees → groups → profiles → auth
users → empty anonymous users.

## Step 5 — Verify

- Before/after counts per table; the differences must equal the approved batch sizes.
- No orphan: participants without a session, history rows pointing at a missing coffee or
  session, profiles without an auth user, auth users without a profile.
- `aggregate_scores` checksum over kept sessions unchanged.
- Open the app in production with Ricardo signed in: dashboard, sessions list, one kept
  closed group session's results, coffees, profile history. No console errors.
- Supabase Security Advisor: still 0 errors.

## Step 6 — Report

Write `docs/handover/cleanup-2026-11/REPORT.md`: what was asked, the three lists as
approved, counts before and after, where the backup is, what was left and why, and how to
restore. Update `docs/handover/S8-ROLLOUT-HANDOVER.md` (items "three never-started
sessions" and "`@cata.test` accounts") and `docs/HANDOVER.md`.

## Stop and ask when

- A dry run's counts differ from the inventory.
- A session on the delete list turns out to have a real participant.
- A delete fails on a foreign key you did not expect.
- Anything would touch more rows than Ricardo approved.
