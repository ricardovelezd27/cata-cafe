# Environment and testing

### Boot-time Env Assertions, Headers, Tests

- `lib/env.ts` lists the variables required in production; `instrumentation.ts` `register()` throws at boot when one is missing (warns in dev). Add new required variables there AND to `docs/LAUNCH-RUNBOOK.md` §3.
- `next.config.ts` sets Referrer-Policy / nosniff / X-Frame-Options / HSTS / Permissions-Policy. No CSP yet (landing-page third-party assets) — revisit post-launch.
- **Runtime DB suite (S9-04, audit D-05)**: `npm run test:db` (`vitest.db.config.ts`, files `tests/db/**/*.dbtest.ts`, never part of `npm test`) starts a throwaway Postgres with `embedded-postgres` (installed from `tests/db/package.json`, own lockfile, NOT in the root `package.json`; `typecheck:db` type-checks the suite, root `tsconfig.json` excludes `tests/db`) in a temp dir on a free `127.0.0.1` port, creates `cata_test_<random>`, applies a Supabase shim, `prisma migrate deploy` (from a patched temp copy of `prisma/migrations`) and `prisma/sql/rls_and_triggers.sql` statement by statement, then runs the real aggregate trigger, `closeSessionInternal`, session delete, `mergeGuestData`, `deleteAccountData`, `writeEvaluationOrdered`, the email ledgers and RLS-as-`authenticated` against it. It never reads `.env.local`/`DATABASE_URL`: every entry point calls `assertSafeTestDatabaseUrl` (`tests/db/support/guard.ts`, unit-tested in `tests/testDbGuard.test.ts`), which throws unless the host is `127.0.0.1`/`localhost` and the database starts with `cata_test_`. Only external boundaries are mocked (Resend, Supabase admin, PDF render and the report-data read feeding it). Known clean-database failures are an explicit allowlist in `tests/db/support/knownSqlFailures.ts`; see `tests/db/README.md`.

## Environment Variables

Required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # Used by lib/supabase/admin.ts — never expose to client
DATABASE_URL=                 # Supabase connection pooler URL
DIRECT_URL=                   # Non-pooler connection for `prisma migrate` (prisma.config.ts falls back to DATABASE_URL)
RESEND_API_KEY=               # Server-only. Unset → lib/email.ts sending is a graceful no-op (dev) / the server refuses to start (prod)
EMAIL_FROM=                   # Optional — overrides the default sender; must be a Resend-verified domain
```

**Required in production** (`lib/env.ts`, asserted by `instrumentation.ts` `register()` on every server cold start — a missing or blank one makes production REFUSE TO START (every request 500s) instead of shipping localhost links or silently skipped emails; it does NOT fail the build, so the deployment still goes Ready, and a preview deployment of the change is the test, since preview also runs with NODE_ENV=production and the same variable entry; `ANALYTICS_SUPER_ADMIN_EMAIL` must be exactly one valid address: a missing, blank or invalid value (a list, a typo) all refuse to start): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `GUEST_CLAIM_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `ANALYTICS_SUPER_ADMIN_EMAIL`. Setup steps: `docs/LAUNCH-RUNBOOK.md` §3.

```
GUEST_CLAIM_SECRET=           # HMAC key for guest "save my results" tokens (lib/guestClaim.ts); falls back to the service-role key in dev
CRON_SECRET=                  # Vercel Cron bearer for /api/cron/insights-digest and /api/cron/close-expired-sessions
```

Optional (features degrade gracefully to no-ops when unset):

```
RESEND_API_KEY=               # lib/email.ts — transactional email; unset → sends skipped
EMAIL_FROM=                   # Sender override; defaults to "Cata Café <no-reply@catacafe.app>"
ANALYTICS_SUPER_ADMIN_EMAIL=  # lib/analytics/access.ts — insights super-admin. REQUIRED in production; unset (dev) = nobody is super-admin, no address in code
GEMINI_API_KEY=               # lib/ai/gemini.ts — AI narratives; unset → "AI not configured" UI
GEMINI_MODEL_LITE=            # Model override; default gemini-3.1-flash-lite
GEMINI_MODEL_STANDARD=        # Model override; default gemini-3.5-flash
ANALYTICS_AI_ADMIN_EMAILS=    # lib/analytics/access.ts — comma-separated AI-chat admins; unset → super-admin only
GEMINI_MODEL_PRO=             # Model override for the insights chat; default gemini-3.1-pro-preview (no stable 3.x pro on the API yet)
NEXT_PUBLIC_SITE_URL=         # Absolute URL used in email links + the printed join QR; defaults to localhost in dev, REQUIRED in prod
UNSUBSCRIBE_SECRET=           # lib/groupUnsubscribe.ts — signs group unsubscribe links (S9-02, A-11). Unset → GUEST_CLAIM_SECRET. Verification accepts BOTH, so never remove/change it once set (runbook §3/§25); boot warning only when unset
CLOSE_EMAIL_ATTACH_CVA=       # "1" → close emails also attach each participant's CVA form PDF (legacy); default = results link + personal summary PDF only
ACCOUNT_DELETION_ENABLED=     # "1" → enables "Eliminar cuenta" (lib/features.ts); default OFF until the runbook §24 rehearsal passes
DB_POOL_MAX=                  # Per-instance Postgres pool size for the pg driver adapter; default 8
UNUSED_ACCOUNT_PURGE_ENABLED= # "1" → the daily cron really deletes accounts never used after WAITLIST_RETENTION_MONTHS (lib/features.ts); default OFF = count only. Switch on after the runbook §17 item 4 rehearsal and before the oldest never-used account turns 12 months
```
