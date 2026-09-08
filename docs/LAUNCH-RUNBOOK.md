# Launch runbook — manual steps outside the codebase

Every step here is something only you can do (dashboard clicks, secrets). Each section
says **when** to do it, **exactly where to click**, **what to paste**, and **how to verify**.
Sections are added as the code that needs them lands; check `docs/HANDOVER.md` for which
ones are still owed.

---

## §1. Supabase — apply PHASE 18 (close anonymous reads, lock helper functions)

**When:** as soon as the WP1 branch is merged and deployed (it is safe to run before the
deploy too — no application code depends on the old policies).

**Why:** the public anon key could read every session invite token and every profile row.
See the comment block at the end of `prisma/sql/rls_and_triggers.sql` (PHASE 18).

**Steps**

1. Open <https://supabase.com/dashboard> and sign in.
2. In the project list, click **CaldiPro_App_Cata_Cafe_Sensible_EU** (ref `dpkgcgdywjfmffqnkqsk`, region eu-central-1). Do not use any of the INACTIVE projects.
3. In the left sidebar click **SQL Editor** (the `>_` icon).
4. Click **+ New query** (top-left of the editor).
5. In your editor open `prisma/sql/rls_and_triggers.sql`, scroll to the bottom, and copy
   everything from the line `-- PHASE 18 (2026-09-08)` down to the final
   `-- ====` line (about 55 lines, starting with the comment block and containing
   `DROP POLICY IF EXISTS "invites_select"`).
6. Paste it into the query pane.
7. Click **Run** (bottom-right, or Ctrl+Enter). Expected result panel: `Success. No rows returned`.
   - If you see `ERROR: function public.rls_auto_enable() does not exist`, delete that one
     `REVOKE … rls_auto_enable()` line and run again (it is a helper that may not exist on
     a fresh project).
   - Any other error: stop, copy the message, and paste it to me.
8. **Verify** — click **+ New query** again, paste this, and Run:

   ```sql
   select tablename, policyname, roles, qual
   from pg_policies
   where schemaname = 'public' and tablename in ('session_invites', 'profiles')
   order by tablename, policyname;
   ```

   Expected rows:
   - `profiles` / `profiles_insert` / `{public}` / *null*
   - `profiles` / `profiles_select` / `{authenticated}` / `(id = (auth.uid())::text)`
   - `profiles` / `profiles_update` / `{public}` / `(id = (auth.uid())::text)`
   - `session_invites` / `invites_write` / `{public}` / `("createdBy" = (auth.uid())::text)`

   There must be **no** `invites_select` row and **no** row whose `qual` is `true`.

9. **Verify the function lock** — new query, Run:

   ```sql
   select p.proname,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_exec,
          p.proconfig
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
   order by p.proname;
   ```

   Expected: `anon_can_exec` is `false` for every row, and `proconfig` shows
   `{search_path=public}` for `handle_new_user`, `is_session_participant`,
   `recompute_aggregate_score`, `is_affective_complete`.

10. **Re-run the advisor** — left sidebar → **Database** → **Advisors** → tab **Security**
    → click **Rerun linter** (top-right). The findings "Public Can Execute SECURITY DEFINER
    Function", "Signed-In Users Can Execute SECURITY DEFINER Function" and "Function Search
    Path Mutable" should be gone. The "Anonymous Access Policies" warnings for
    `session_invites` and `profiles` should be gone too. Remaining "Anonymous Access
    Policies" warnings on other tables are expected: anonymous guests are legitimately
    `authenticated` in this app.

11. **Smoke test that nothing broke** (2 minutes): open the production site in a private
    window, log in with a magic link, open a session, open a group. Then scan a QR invite
    as a guest (or open a `/join/<token>` link in another private window) and join with a
    name only. If any of those fail, run the rollback below and tell me.

**Rollback** (only if step 11 fails): new query, paste and Run:

```sql
CREATE POLICY "invites_select" ON session_invites FOR SELECT USING (true);
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
```

(The function revokes do not need rolling back; triggers keep working regardless.)

---

## §2. Database — apply the `launch_state_machine` migration

**When:** right before deploying the WP2 branch (`claude/launch-wp2-state-machine`). The app
code on that branch reads the new columns, so deploy and migration go together: migrate
first, deploy second (the migration is additive, so the OLD code keeps working in between).

**What it does** (`prisma/migrations/20260908140000_launch_state_machine/migration.sql`):
adds `cupping_sessions.closedAt`, creates `close_email_deliveries`, and makes
`user_coffee_history.sessionId` / `evaluationId` nullable with `ON DELETE SET NULL` plus
`snapshot` / `detachedAt` columns. No data is rewritten.

**Steps** (from your machine, in the repo, on the WP2 branch):

1. Make sure `.env.local` has `DIRECT_URL` (the non-pooler connection string — Supabase
   Dashboard → **Project Settings → Database → Connection string → "Direct connection"**)
   or, failing that, a `DATABASE_URL` that is NOT the pgbouncer pooler. `prisma migrate`
   cannot run through the transaction pooler.
2. Preview what will run (read-only):

   ```bash
   npx prisma migrate status
   ```

   Expected: one pending migration, `20260908140000_launch_state_machine`. If it lists
   OTHER pending migrations or says the migration history has drifted, stop and paste the
   output to me (see the memory note about checksum drift on this project).
3. Apply it:

   ```bash
   npx prisma migrate deploy
   ```

   Expected: `1 migration applied`. Takes a few seconds; no downtime (the ALTERs take
   brief locks on `user_coffee_history` and `cupping_sessions`).
4. **Verify** in Supabase → SQL Editor:

   ```sql
   select column_name, is_nullable from information_schema.columns
   where table_name = 'user_coffee_history' and column_name in ('sessionId','evaluationId','snapshot','detachedAt');
   select count(*) from close_email_deliveries;
   ```

   Expected: `sessionId` and `evaluationId` → `YES`, `snapshot`/`detachedAt` present,
   count `0`.
5. Deploy the branch (merge → Vercel deploys).

**Rollback:** the columns are nullable and unused by the old code, so rolling the app back
is enough; leave the columns in place. (Dropping them would need
`ALTER TABLE user_coffee_history ALTER COLUMN "sessionId" SET NOT NULL`, which fails if any
row was detached in the meantime — do not do that without asking.)

---

## §3. Vercel — environment variables and the new cron

**When:** before the first production deploy of the WP2 branch (the cron needs
`CRON_SECRET`; the printed QR needs `NEXT_PUBLIC_SITE_URL`).

1. Generate two secrets locally (any terminal):

   ```bash
   openssl rand -base64 32
   ```

   Run it twice; keep the two values for `CRON_SECRET` and `GUEST_CLAIM_SECRET`.
2. Open <https://vercel.com/dashboard> → your **cata-cafe** project → **Settings** →
   **Environment Variables**.
3. Add or check each row (Environment = **Production**; also tick **Preview** for the two
   `NEXT_PUBLIC_*` ones if you use preview deploys):

   | Name | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://<your-production-domain>` (no trailing slash) | Used in the printed join QR, close/digest emails, canonical URLs. Without it those links say `localhost:3000`. |
   | `CRON_SECRET` | first generated value | Vercel sends it as `Authorization: Bearer` to both cron routes. |
   | `GUEST_CLAIM_SECRET` | second generated value | Signs guest "save my results" links. Currently falls back to the service-role key; a dedicated secret means rotating the service key no longer invalidates outstanding claim links. |
   | `RESEND_API_KEY` | from <https://resend.com/api-keys> | Without it every email is silently skipped. |
   | `EMAIL_FROM` | e.g. `Cata Café <no-reply@your-domain>` | Must be a Resend-verified domain. |
   | `ANALYTICS_SUPER_ADMIN_EMAIL` | your admin email | The code fallback is a personal Gmail — set it explicitly. |

4. Click **Save** for each. Vercel only applies env changes to NEW deployments: after the
   last one, go to **Deployments** → the latest production deployment → **⋯** →
   **Redeploy** (keep "Use existing build cache" unticked).
5. **Cron:** after that deploy, open **Settings → Cron Jobs**. You should see two entries:
   `/api/cron/insights-digest` (`0 12 1 * *`) and `/api/cron/close-expired-sessions`
   (`0 6 * * *`, i.e. 06:00 UTC daily). If the second is missing, the deploy did not pick
   up `vercel.json` — check that the file is on the deployed commit.
6. **Trigger the close cron once by hand** to confirm it is wired (replace the two values):

   ```bash
   curl -s -H "Authorization: Bearer <CRON_SECRET>" https://<your-production-domain>/api/cron/close-expired-sessions
   ```

   Expected JSON: `{"ok":true,"due":0,"closed":0,"results":[],"truncated":false}` (or a
   list of sessions it closed, if any async session was already past its deadline).
   `{"ok":false,"error":"not_configured"}` means `CRON_SECRET` is not set on that
   deployment; `unauthorized` means the header value does not match.

---
