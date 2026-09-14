# Launch runbook — manual steps outside the codebase

Every step here is something only you can do (dashboard clicks, secrets). Each section
says **when** to do it, **exactly where to click**, **what to paste**, and **how to verify**.
Sections are added as the code that needs them lands; check `docs/HANDOVER.md` for which
ones are still owed.

---

## §1. Supabase — apply PHASE 18 (close anonymous reads, lock helper functions)

> **APPLIED to production 2026-09-14.** Kept for the record and for rebuilding an environment.


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

## §1b. Supabase — PHASE 18b correction (run right after §1)

> **APPLIED to production 2026-09-14.**


**Why:** §1 revoked execute on `is_session_participant` from the `authenticated` role, but
five row-security policies call that function and policies run as the querying role.
Without this fix, Supabase Realtime (waiting room, live "new submissions" badges) gets
"permission denied for function". Prisma is unaffected. Same SQL editor, new query, Run:

```sql
GRANT EXECUTE ON FUNCTION public.is_session_participant(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;
```

Expected: `Success. No rows returned`. Verify with a new query:

```sql
select has_function_privilege('authenticated', 'public.is_session_participant(text)', 'EXECUTE') as ok;
```

Expected: `true`. (The Security Advisor will list this one function as "callable by
signed-in users" again — that is correct and intended: it only answers whether the caller
belongs to a session.)

---

## §2. Database — apply the `launch_state_machine` migration

> **APPLIED to production 2026-09-14.** Verified afterwards: schema changed, 123 sessions / 1070 evaluations / 83 history rows intact.


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

> **DONE 2026-09-14.** All eight required variables are set; the deploy booting is itself the proof, since `lib/env.ts` fails the boot otherwise.


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

## §4. Vercel — finding a production error from a user's "support code"

**When:** any time a user reports an error screen. Every error boundary shows a
**Código de soporte** (the Next.js error digest). The server writes the same digest to the
logs as a JSON line (`instrumentation.ts` → `lib/log.ts`), so you can go from the code a
user pastes you to the actual failure.

**One-time setup (retention):** Vercel keeps runtime logs for a short window on the Hobby
plan (about 1 hour searchable in the UI) and 1 day on Pro. To keep them longer, open your
project → **Settings → Log Drains → Add Log Drain** and send them to a free tier of
Axiom, Better Stack or Logtail (any of them accepts the default JSON format; pick
**Sources: Function** and **Format: JSON**). Without a drain you must look within that
window.

**Steps**

1. Open <https://vercel.com/dashboard> → your project → the **Logs** tab (top navigation).
2. In the search box paste the support code exactly as the user sent it, e.g. `1234567890`.
   The matching line looks like:

   ```json
   {"level":"error","ts":"…","where":"request.action","digest":"1234567890","message":"…","routePath":"/[locale]/app/sessions/[id]/results","routeType":"action","method":"POST","locale":"es"}
   ```

3. `where` tells you what failed: `request.render` (a page), `request.action` (a button /
   form), `request.route` (an API route such as the PDF), `request.proxy` (middleware).
   `action.<name>` lines come from `run()` in server actions and carry `sessionId` /
   `userId` when known.
4. `message` is the real exception text. Paste the whole line to me and I will trace it.
5. If nothing matches: the error happened in the browser only (no server line). Ask the
   user which screen and what they clicked; browser-side failures also print to the
   devtools console with the same digest.

---

## §5. Post-deploy smoke test (15 minutes, two accounts)

> **STILL OWED — this is the one remaining task.** It needs a real magic-link login, so it cannot be automated.


**When:** after §1–§3 are done and the branches are deployed. Use two browsers (or one
normal + one private window): **A** = organiser account, **B** = a second account you
control. Expected results are in bold. Stop and paste me the screen + support code if
any step differs.

1. **Error screens.** Open `https://<domain>/es/esta-pagina-no-existe`.
   **A Spanish "Página no encontrada" page with "Ir al inicio".** Open `/zz/foo`:
   **the same page.**
2. **Login.** In B (private window) go to `/es/auth/login?error=exchange_failed`.
   **A red notice "El enlace ya no es válido…" above the form, cursor in the email field.**
   Request a magic link with B's email; **the sent state shows a hint and "Usar otro
   correo".** Open the link **twice**: the second time **lands on the login page with the
   notice** (not a blank form).
3. **Group session.** In A: create a **group** session (live, not async) with two coffees.
   On step 2, copy the invite link but **do not** press "Iniciar". Go to the session
   list, open the session. **The master panel shows "Iniciar cata".**
4. In B: open the invite link, join. **B lands in the waiting room with a "Volver a mis
   sesiones" link.** In A press "Iniciar cata". **Within a few seconds B is redirected to
   the cupping screen.**
5. In A: open the invite link yourself. **You land on the cupping screen; the session
   does NOT appear twice in your sessions list.**
6. In B: rate one sample, then turn off wifi/data; change a value. **The indicator turns
   amber "Guardado en este dispositivo · pendiente de sincronizar".** Go to the sessions
   list (still offline): **a badge "1 borradores sin sincronizar" shows at the top.**
   Turn wifi back on: **the badge disappears within ~10 s.** Submit.
7. In A: press "Cerrar sesión" → **a dialog, not a browser popup**. Confirm. **You land on
   results; a line "Cata cerrada el …" and "Correos de cierre: …" appear.** Press
   "Cerrar" again from anywhere (e.g. reload the cupping URL): **it redirects to results;
   nothing is re-sent.** Check A's and B's inboxes: **exactly one email each with two
   PDFs.** Open a coffee's detail page: **B's tasting appears in its history** (no manual
   reveal was needed).
8. In B: open the cupping URL of the closed session. **Redirected to results, no "Volver
   a cata" button.**
9. **Delete.** In A: delete that session. **The dialog lists the two coffees with their
   owners and says "…evaluaciones de 1 catador…".** Confirm. In B: open **Perfil →
   Historial**: **the coffees are still listed with a "Sesión eliminada" tag and no link.**
10. **Cron.** Run the `curl` from §3 step 6: **`{"ok":true,…}`.**
11. **Guest.** In a private window scan/open a fresh invite link (create another group
    session first), join with a name only. Then try to open `/es/app/coffees`:
    **redirected to the sessions list.**
12. **Sign-out.** In B press "Cerrar sesión"; in the same browser open
    `/es/app/sessions`: **login page** (never a cached sessions list).

If all twelve pass, launch. If anything fails, roll back the deploy in Vercel
(**Deployments → previous deployment → ⋯ → Promote to Production**) — the database
changes are additive and do not need rolling back.

---

## §6. Moving to the real domain (catasensible.ai)

**When:** the day the domain is registered and pointing at Vercel. Interim value in use is
`https://cata-cafe-opal.vercel.app`, which keeps working permanently once a custom domain
is attached, so nothing printed or emailed before the switch breaks.

All five steps, or it fails quietly:

1. Vercel → Settings → **Domains** → add `catasensible.ai`.
2. Vercel → Settings → **Environment Variables** → set `NEXT_PUBLIC_SITE_URL` to
   `https://catasensible.ai`. Use https, and no trailing slash.
3. **Redeploy.** `NEXT_PUBLIC_*` values are baked in at build time, so editing the variable
   alone changes nothing until a new build runs.
4. Supabase → Authentication → **URL Configuration** → add
   `https://catasensible.ai/auth/callback` to the redirect allow-list. Without this,
   magic-link sign-in fails on the new domain.
5. Re-test: a magic-link login on the new domain, and scan a freshly printed session QR.

`NEXT_PUBLIC_SITE_URL` only feeds three places: the printed QR sheet
(`app/[locale]/app/sessions/[id]/print/page.tsx`), the monthly digest email links, and
`metadataBase`. Live in-app invite links are built from `window.location.origin`, so they
follow whatever domain the user is actually on and are unaffected by this value.

---
