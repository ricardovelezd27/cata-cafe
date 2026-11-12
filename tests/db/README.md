# Runtime DB suite (audit D-05)

Runs the data-moving code paths against a REAL, DISPOSABLE, LOCAL Postgres.
Plain `npm test` stays pure and fast and never starts a database.

```bash
npm run test:db          # ~100 s on a laptop (about 30 s of that is bringing the database up)
npx vitest run --config vitest.db.config.ts tests/db/rls.dbtest.ts   # one file
```

## What it starts

`globalSetup.ts` uses `embedded-postgres` (real PostgreSQL binaries per
platform; 18.6 on Windows x64), installed from `tests/db/package.json` (own lockfile, gitignored
`tests/db/node_modules`; `npm run test:db` runs `npm ci` there when it is missing or outdated, so the
app's own install carries no Postgres binaries). vitest, prisma and the app's `pg` come from the root to start a server in a temp directory on a free `127.0.0.1` port,
creates `cata_test_<random>` and then, in this order:

1. `support/shim.sql`: the Supabase pieces the project's SQL expects (roles `anon`,
   `authenticated`, `service_role`, `supabase_auth_admin`; `auth.users`, `auth.uid()`, `auth.jwt()`
   reading `request.jwt.claims`; the `supabase_realtime` publication; `rls_auto_enable()`; the
   default privileges Supabase gives API roles, which PHASE 24 later revokes writes from).
2. `prisma migrate deploy` (config `support/prisma.test.config.ts`, which loads no `.env*`), run on a
   temp COPY of `prisma/migrations` with the patches of `support/knownSqlFailures.ts`.
3. `prisma/sql/rls_and_triggers.sql`, split into statements and applied one by one. Any failure that
   is not in the `KNOWN_SQL_FAILURES` allowlist stops the suite.

Everything (server, data directory, copy of the migrations) is deleted afterwards; the data
directory lives in the OS temp folder, outside the repository. The server runs with
`io_method=sync` (the default I/O workers are left behind on Windows), UTF8/`C` locale and UTC.

Each test file calls `resetDb()` (TRUNCATE of every app table and `auth.users`) in `beforeEach`;
files run one after another against the one database.

## Safety guard

The only hosted database is production. `support/guard.ts` `assertSafeTestDatabaseUrl()` throws
before any connection unless the host is exactly `127.0.0.1` or `localhost` AND the database name
starts with `cata_test_`. It is called by the global setup, the worker setup (`setupEnv.ts`, which
also sets `DATABASE_URL` before `lib/prisma` is imported), the raw pg helper and the Prisma config.
The suite never reads `DATABASE_URL`/`DIRECT_URL`/`.env.local`. Unit test: `tests/testDbGuard.test.ts`
(part of plain `npm test`).

## What is mocked

Only external boundaries: Resend (`sendEmail`), the Supabase admin client (`getUserById`,
`deleteUser`), PDF rendering AND the report-data read that feeds the PDF attachment in the
close-email tests (`loadSessionReportSource`, `buildParticipantSummary`), `sendCloseEmails` itself in
`close.dbtest.ts` (it only records the call), and `server-only` (aliased to an empty stub).
Everything else (`lib/prisma`, the triggers, the lib functions) is the real code.

## Files

| File | Covers |
|---|---|
| `aggregate.dbtest.ts` | `trg_recompute_aggregate` vs `computeGroupAggregate`: the -1.0 case, under five cups, the B-04 tie (64), exclusion, drafts, 320 generated cases |
| `close.dbtest.ts` | `closeSessionInternal` / `finalizeClosedSession`: both phases, idempotence, concurrency, repair |
| `sessionDelete.dbtest.ts` | the `deleteSession` transaction (`detachCoffeeHistoryForSession`), label-only rows, the partial unique index |
| `guestMerge.dbtest.ts` | `mergeGuestData`: conflict rules, moves, aggregate re-fire, no orphan rows |
| `accountDeletion.dbtest.ts` | `deleteAccountData`: whole transaction, manifest tables, placeholder, others untouched |
| `evaluationWrite.dbtest.ts` | `writeEvaluationOrdered`: ordering by `clientTs`, legacy writes, re-fire, concurrency |
| `emailLedgers.dbtest.ts` | `reserveEmailBudget` limits, `sendCloseEmails` claim and lease |
| `harness.dbtest.ts` | the bring-up tolerated EXACTLY the one known SQL failure (a second one, or the known one starting to work, fails the run) |
| `rls.dbtest.ts` | `authenticated` / `anon` privileges and policies (PHASE 21, 24, 25) |

## Known clean-database failures (tolerated, listed in `knownSqlFailures.ts`)

* Migration `20260805120000_drop_deprecated_is_public` drops `coffees."isPublic"` without
  `IF EXISTS` although `20260805100000` already dropped it: `migrate deploy` from zero fails (42703).
  Patched in the temp copy only.
* `rls_and_triggers.sql` PHASE 11 `CREATE POLICY "coffees_select" ... "isPublic"`: the column no
  longer exists when the file runs on a clean database; PHASE 16/20/24 redefine the policy.

## Not covered

The tests connect as a real Postgres SUPERUSER, while hosted Supabase's `postgres` role is not one:
a missing grant on a SECURITY DEFINER function or trigger would stay hidden here. Also not covered:
real Supabase Auth (GoTrue), PostgREST, Realtime, the `supabase_auth_admin` flow of
`handle_new_user`, production-sized data, schema drift of the live project, the browser/offline
client, and server actions that need a request context (they delegate to the lib functions tested here).
