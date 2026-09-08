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
