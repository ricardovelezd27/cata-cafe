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

> **DONE 2026-09-14.** All eight required variables are set; the deployment serving requests is itself the proof, since `lib/env.ts` makes the server refuse to start otherwise (a missing variable does not fail the build; the deployment goes Ready and then every request returns 500).


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
   | `CLOSE_EMAIL_ATTACH_CVA` | *(optional)* `1` | Legacy: also attach each participant's CVA form PDF to the close email. Default (unset) = link to results + personal summary PDF only. |
   | `ANALYTICS_SUPER_ADMIN_EMAIL` | your admin email | **Required** (F-insights-5): exactly ONE valid address (a list or a typo counts as missing). Without it the production server refuses to start: the build still succeeds and the deployment goes Ready, then every request returns 500; check a preview deployment first. There is no address built into the code. |
   | `UNSUBSCRIBE_SECRET` | *(optional, recommended)* `openssl rand -base64 48` | Signs the per-group unsubscribe links (S9-02, A-11). Unset = the links use `GUEST_CLAIM_SECRET`. **Once set, never remove or change it** without keeping the old value as `GUEST_CLAIM_SECRET`'s role (see §25): unsubscribe links never expire. Unset means one boot warning, never a failed deploy. |

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

### Cambio de dominio a cafesensible.ai

**When:** the rebrand from Cata Café to cafesensible.ai (contact `hola@estudiodecafe.online`)
ships share metadata (og:/twitter: tags, canonical URLs, `/opengraph-image`,
`/robots.txt`, `/sitemap.xml`) that all depend on `NEXT_PUBLIC_SITE_URL` — this only
takes effect once the real domain is live.

1. Vercel → project → **Settings → Environment Variables** → set
   `NEXT_PUBLIC_SITE_URL=https://cafesensible.ai` for **Production** and **Preview**.
2. Supabase → **Authentication → URL Configuration**: add
   `https://cafesensible.ai/auth/callback` and `https://cafesensible.ai/**` to the
   **Redirect URLs** allow-list, and update **Site URL** to `https://cafesensible.ai`.
   Without this, magic-link sign-in on the new domain fails.
3. **Redeploy.** `NEXT_PUBLIC_*` values are baked in at build time, so saving the
   variable alone changes nothing until a new build runs.
4. Verify every URL resolved to the real host, not `localhost:3000`:

   ```bash
   curl -s https://cafesensible.ai/ | grep -E 'og:|twitter:|canonical'
   ```

   Every `content=`/`href=` value should start with `https://cafesensible.ai`. Then
   confirm the generated image itself:

   ```bash
   curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://cafesensible.ai/es/opengraph-image
   ```

   Expected: `200 image/png` (the route is locale-prefixed on purpose — `proxy.ts`
   excludes it from the intl middleware so the default-locale card never 307s;
   `/en/opengraph-image` must return the same).
5. Paste `https://cafesensible.ai/` into the
   [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and share the link
   in a WhatsApp chat to confirm the card renders with the new image, title, and domain
   (both cache previous scrapes — use each tool's "reload"/"reinspect" option if the old
   `Cata Café` card still shows).

`NEXT_PUBLIC_SITE_URL` only feeds `metadataBase` (and therefore every relative
og/twitter/canonical/sitemap/robots URL), the printed join QR sheet
(`app/[locale]/app/sessions/[id]/print/page.tsx`), and the monthly digest email links.
Live in-app invite links are built from `window.location.origin` and are unaffected.

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

## §6. Moving to the real domain (cafesensible.ai)

> **Domain corrected 2026-09-22** — earlier drafts of this section named
> `catasensible.ai`; the registered rebrand domain is **cafesensible.ai**. See also the
> "Cambio de dominio a cafesensible.ai" subsection under §3 for the share-metadata
> (og:/twitter:/canonical/opengraph-image) verification steps that go with this cutover.

**When:** the day the domain is registered and pointing at Vercel. Interim value in use is
`https://cata-cafe-opal.vercel.app`, which keeps working permanently once a custom domain
is attached, so nothing printed or emailed before the switch breaks.

All five steps, or it fails quietly:

1. Vercel → Settings → **Domains** → add `cafesensible.ai`.
2. Vercel → Settings → **Environment Variables** → set `NEXT_PUBLIC_SITE_URL` to
   `https://cafesensible.ai`. Use https, and no trailing slash.
3. **Redeploy.** `NEXT_PUBLIC_*` values are baked in at build time, so editing the variable
   alone changes nothing until a new build runs.
4. Supabase → Authentication → **URL Configuration** → add
   `https://cafesensible.ai/auth/callback` to the redirect allow-list. Without this,
   magic-link sign-in fails on the new domain.
5. Re-test: a magic-link login on the new domain, and scan a freshly printed session QR.

`NEXT_PUBLIC_SITE_URL` only feeds three places: the printed QR sheet
(`app/[locale]/app/sessions/[id]/print/page.tsx`), the monthly digest email links, and
`metadataBase`. Live in-app invite links are built from `window.location.origin`, so they
follow whatever domain the user is actually on and are unaffected by this value.

For the fuller DNS/SSL procedure (record types, propagation checks, certificate
verification), see `docs/prompts/S2-staging-production.md` §6 "Flujo C — Dominio
cafesensible.ai + HTTPS".

---

## §7. Database — apply the `reference_sample` migration (2026-09)

**When:** any time before the reference-sample code (branch
`claude/cafe-sensible-improvements-51283e`) is merged and deployed. The migration is
additive, so it is safe to apply before the code deploy — old code simply ignores the new
column.

**What it does** (`prisma/migrations/20260922120000_reference_sample/migration.sql`):
adds a nullable `cupping_sessions.referenceSampleId` column, an index on it, and a
foreign key to `session_samples` with `ON DELETE SET NULL`. No data is rewritten, no
existing row changes.

**Steps** (from your machine, in the repo, on the branch):

1. Make sure `.env.local` has `DIRECT_URL` (the non-pooler connection string — Supabase
   Dashboard → **Project Settings → Database → Connection string → "Direct connection"**)
   or, failing that, a `DATABASE_URL` that is NOT the pgbouncer pooler. `prisma migrate`
   cannot run through the transaction pooler.
2. Preview what will run (read-only):

   ```bash
   npx prisma migrate status
   ```

   Expected: exactly one pending migration, `20260922120000_reference_sample`. If it
   lists OTHER pending migrations or says the migration history has drifted, stop and
   paste the output before continuing.
3. Apply it:

   ```bash
   npx prisma migrate deploy
   ```

   Expected: `1 migration applied`. Takes a few seconds; no downtime (the ALTER takes a
   brief lock on `cupping_sessions`).
4. **Verify** in Supabase → SQL Editor:

   ```sql
   select column_name from information_schema.columns
   where table_name = 'cupping_sessions' and column_name = 'referenceSampleId';
   ```

   Expected: one row, `referenceSampleId`.
5. Deploy the branch (merge → Vercel deploys).

**Note:** no PHASE SQL, no RLS, no Security Advisor change expected; additive and
nullable, safe to apply before the code deploy.

**Rollback:** the column is nullable and unused by the old code, so rolling the app back
is enough; leave the column in place.

---

---

## §8. Database — apply the `coffee_soft_delete` migration + PHASE 20 policies (2026-09)

**When:** before the coffee-list-actions code (branch
`claude/coffee-profile-consistency-fae8b3`) is deployed. Both steps are additive and
safe to apply first — old code ignores the new column and the stricter policies only
hide rows that do not exist yet.

**What it does:**

- `prisma/migrations/20260926120000_coffee_soft_delete/migration.sql` adds a nullable
  `coffees.deletedAt` column and an index on it. No row changes.
- `prisma/sql/rls_and_triggers.sql` **PHASE 20** re-creates `coffees_select` and
  `coffees_write` with `"deletedAt" IS NULL`, so an anonymized coffee is invisible to
  the anon/authenticated key. The app itself already filters through Prisma
  (`usableCoffeeWhere`), so this is hygiene, not a functional dependency.

**Steps:**

1. Same `DIRECT_URL` precondition as §7.
2. `npx prisma migrate status` — expected: exactly one pending migration,
   `20260926120000_coffee_soft_delete`. Anything else: stop and paste the output.
3. `npx prisma migrate deploy` — expected `1 migration applied`.
4. Supabase → **SQL Editor** → paste the **PHASE 20** block from
   `prisma/sql/rls_and_triggers.sql` → **Run**. Expected: `Success. No rows returned`.
5. **Verify** in the SQL Editor:

   ```sql
   select column_name from information_schema.columns
   where table_name = 'coffees' and column_name = 'deletedAt';
   select policyname, qual from pg_policies where tablename = 'coffees';
   ```

   Expected: one row for the column; both `coffees_select` and `coffees_write` quals
   start with `("deletedAt" IS NULL)`.
6. Check the Supabase **Security Advisor** shows no new warnings.

**Behaviour after deploy:** "Eliminar café" (row icon, bulk toolbar, profile page)
anonymizes instead of deleting — name/code/farm/producer/notes/certifications are
wiped, shares and invite links revoked, and the coffee vanishes from lists, pickers and
its profile URL. Session results, tasting history and insights keep the row and show
"Café eliminado" where the name was. Only the coffee's owner can trigger it.

---

## §9. Database — apply the `session_warmup_started_at` migration (2026-10, S6 warm-up v3 PR3)

**When:** BEFORE the deploy that contains the synced master-led warm-up (branch
`claude/s6-warmup-v3-pr3`). Unlike §7 this ordering is mandatory: the regenerated Prisma
client selects `cupping_sessions."warmupStartedAt"` on every session read, so deploying
the code first makes every page that loads a session (cup, waiting, results, lists)
return 500 until the column exists. Applying the migration first is safe — the old code
simply ignores the new column.

**What it does** (`prisma/migrations/20261028120000_session_warmup_started_at/migration.sql`):

```sql
ALTER TABLE "cupping_sessions" ADD COLUMN "warmupStartedAt" TIMESTAMPTZ(3);
```

One nullable column, no default, no index, no data rewritten. It holds the instant the
master pressed "Empezar con el grupo" (the t0 of the warm-up timeline); `NULL` means no
run in progress. Brief lock on `cupping_sessions`, no downtime.

**Steps** (from your machine, in the repo root, with the production `DIRECT_URL` in
`.env.local` — same precondition as §7: the direct connection, not the pgbouncer pooler):

1. Preview (read-only):

   ```bash
   npx prisma migrate status
   ```

   Expected: exactly one pending migration, `20261028120000_session_warmup_started_at`.
   Anything else pending or a drift message: stop and paste the output.
2. Apply it:

   ```bash
   npx prisma migrate deploy
   ```

   Expected: `1 migration applied`.
3. **Verify** — `npx prisma migrate status` now reports the database schema is up to
   date, and in Supabase → SQL Editor:

   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'cupping_sessions' AND column_name = 'warmupStartedAt';
   ```

   Expected: one row, `warmupStartedAt`.
4. Deploy the branch (merge → Vercel deploys).

**No RLS / publication step.** `cupping_sessions` is already in the `supabase_realtime`
publication (the waiting room and cup page subscribe to its UPDATEs) and the existing
row policies cover the new column. No PHASE SQL, nothing to check in the Security
Advisor.

**Ignore the `startedAt` drift.** `prisma migrate diff` (and `migrate dev`) also reports a
pre-existing difference on `cupping_sessions."startedAt"` (`SET DATA TYPE TIMESTAMP(3)`).
That is NOT part of this migration and must not be applied or "fixed" here — leave it
alone.

**2-minute manual check after deploy** (two devices or a normal + a private window):

1. Create a fresh **group** session (live, no closing date) with a warm-up exercise
   chosen; copy the invite link.
2. As a participant, open the invite and sit in the waiting room.
3. As the master (owner), open `/cup` and press **Movimiento sensorial · Empezar con el
   grupo**. The participant's player must open, seeked to the same moment, within ~1 s
   (or within 15 s via the polling fallback if realtime is down). The participant is
   muted by default; the master's device plays the sound.
4. Press **Detener** on the master panel: the participant's player closes with "El maestro
   detuvo el ejercicio".
5. Start the run again, then press **Iniciar cata** mid-run: the confirm "El grupo está en
   el ejercicio (quedan m:ss). ¿Iniciar igual?" must appear. Confirming starts the cupping
   and the participants move on to `/cup`.

**Rollback:** the column is nullable and unused by the old code — roll the app back and
leave the column in place.

---

## §27. S8 combined rollout (all of S8 in one release)

> Placed here, at the top of the S8 material, on purpose; numbered §27 because §10–§26 were
> taken when it was written. **For the S8 release this section supersedes every
> per-section "exactly one pending migration, else stop" / "1 migration applied" line in
> §10–§26**: those were written for one PR each, but S8 ships as ONE chained branch, so ten
> migrations are pending at once. Follow the order below; use §10–§26 only for the detail
> each step points to. Every step here is in production (there is only one Supabase project).

**Why one procedure:** the regenerated Prisma client selects the new columns on every read, so
code that reaches production before its migration returns 500s (sessions, groups, invites,
results) and the sign-in form fails (it reads `outbound_email_events`). The migrations are all
additive and independent and the OLD app ignores every new object, so applying all of them
first is safe; the reverse order is not. The email templates are the opposite case: they link
to `/auth/confirm`, which only exists after the deploy.

### Before the deploy

0. **Right checkout.** On your Windows machine, check out the commit you are about to deploy
   (the merged S8 tip), `npm ci`, `npx prisma generate`, `.env.local` with the production
   `DIRECT_URL` (direct connection, not the pooler; same precondition as §7). Ignore the
   pre-existing `cupping_sessions."startedAt"` drift (§9): never apply or "fix" it.

1. **PHASE 21: already applied 2026-11-10 (§10).** Confirm it is still in place (expect no
   rows):

   ```sql
   select tablename, policyname, cmd from pg_policies
   where schemaname = 'public' and cmd <> 'SELECT'
     and tablename in ('evaluations','aggregate_scores','cupping_sessions','session_samples',
       'session_participants','physical_evaluations','extrinsic_data','session_invites','profiles');
   ```

   Why first: the new app expects participants to learn about new results from the
   `cupping_sessions` channel only, and the API to be read-only on the session tables.

2. **Never-started live sessions: close or start them.** After the deploy a participant
   cannot save in a live group session that never recorded a start (`session_not_started`).
   There were **three** on 2026-11-10; re-run the query, it may differ now:

   ```sql
   select id, name, "createdBy" from cupping_sessions
   where "isGroup" and not "isAsync" and status = 'active' and "startedAt" is null;
   ```

   For each row, ask the owner to press "Iniciar cata" or close it (from the app) before the
   deploy. Why before: the moment the new code is live, their participants are locked out.

3. **The ten migrations, in timestamp order, BEFORE the deploy.** `npx prisma migrate status`
   must list exactly these ten as pending (anything else, or a drift message other than the
   `startedAt` one: stop and paste the output):

   1. `20261110120000_outbound_email_ledger` (§11)
   2. `20261111090000_close_lifecycle` (§13)
   3. `20261111100000_waitlist_consent` (§17)
   4. `20261111110000_invite_active_entries_locked` (§18)
   5. `20261111120000_digest_run_status` (§19)
   6. `20261111130000_exclusion_audit_extrinsic_edited` (§20)
   7. `20261111140000_history_coffee_optional` (§21)
   8. `20261111150000_session_notify_group_at_start` (§22)
   9. `20261111160000_evaluation_last_client_write` (§23)
   10. `20261111170000_group_member_email_opt_out` (§25)

   **Preferred:** `npx prisma migrate deploy` from that checkout. It applies them in this order,
   stops at the first failure and records each one in `_prisma_migrations` itself. Expected:
   `10 migrations found … applied`.

   **Only if you apply them through the Supabase SQL editor instead:** each migration needs
   its own row in `_prisma_migrations`, or the next `migrate status` / `migrate deploy` will
   try to apply it again. One editor run per migration, in the order above:

   ```sql
   BEGIN;
   -- paste the full contents of prisma/migrations/<name>/migration.sql here
   INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
   VALUES (gen_random_uuid()::text, '<sha256 of that migration.sql>', '<name>', now(), now(), 1);
   COMMIT;
   ```

   - `checksum` = SHA-256 (lowercase hex) of the `migration.sql` file **as checked out on your
     Windows machine, i.e. with CRLF line endings** (git `core.autocrlf=true`), because every
     existing row was recorded that way by `migrate deploy` run from that machine. Compute it in
     PowerShell:
     `(Get-FileHash -Algorithm SHA256 prisma\migrations\<name>\migration.sql).Hash.ToLower()`.
   - Check the CRLF assumption once first: the existing row for
     `20261028120000_session_warmup_started_at` must hold the hash of your local file
     (`eb9e4c3733a9053c18e48077d5872b09acc77b56a663cb3b54cbcddd3cedc108` with CRLF;
     `f7fea817e9ab9e17fc9b516221ef7aad2bea8d10a81b1ffc83e1ce311c2937b5` would mean LF, in
     which case hash LF copies of the files instead).
   - For cross-checking, the CRLF hashes computed from a checkout of this branch (yours must
     match; if one differs, the file changed: stop and ask):

     | # | sha256 (CRLF) |
     |---|---|
     | 1 | `a733f82bab4b27f64e74608acfe81c51f6eb5f35267f3f866950f04ca262d9bb` |
     | 2 | `ac7ecbf0e3bc8e5fd054ff035322a83f1cdefe124fd85a65c6384ebaa43443b9` |
     | 3 | `6af5a6fc9a0e90d562607ad2954d6f9a28c17cb2aa57046255f939304743179b` |
     | 4 | `065a012d204d859e46ae9ba8ad3066536f137e2493cc9f23f5ab537fffb2aab4` |
     | 5 | `c645ba5e327f9b47d16133b1ed4e849791edc328575f937984f24a4b5bf4140b` |
     | 6 | `ae6749f3161d552b5b78149ebb45f911913a4eb3dbaa984e12c934a6bf81f588` |
     | 7 | `692a0d351c53d30f69ef4eb0f2580b5f544e3b27b9b98b3520f872f987deb0f6` |
     | 8 | `aa9026f67f47970c087da0ec92720cf2b619e6ff8415aeb56427abb7588c12b1` |
     | 9 | `56044d52d76d17b943f26e6b9978ad88df515ff16d3235dbfc622239fef9520a` |
     | 10 | `19b678ba350a63465cebedbdc9d3887aa7be60218381c38509f5336cc736aa0d` |
   - `id`: any uuid; `started_at`/`finished_at`: `now()`; `applied_steps_count`: `1`;
     `logs` and `rolled_back_at` stay NULL.
   - Never edit a `migration.sql` after recording it: the checksum would no longer match.

   **Verify** (either path):

   ```sql
   select migration_name, left(checksum, 8) as sum, finished_at is not null as finished,
          rolled_back_at, applied_steps_count
   from _prisma_migrations where migration_name >= '20261110120000' order by migration_name;
   ```

   Expected: the ten names above, `finished = true`, `rolled_back_at` NULL, `1` step each. Then
   `npx prisma migrate status` reports the schema up to date (a "modified after it was applied"
   warning means a checksum is wrong: fix the row, not the file). Then run the per-migration
   checks: §13 step 2 (`owed` must be `0`), and the column queries of §18–§25.
   Never accept a `prisma migrate dev` proposal to drop
   `user_coffee_history_label_row_evaluation_key` (§21).

4. **PHASE 22 right after the migrations (§11 step 3).** The two ledger tables exist only once
   migration 1 ran; enabling RLS on them before the new code writes to them keeps them closed to
   the public key from the first row. Verify with §11 step 4.

5. **PHASE 23 STEP 1 only (§12 steps 1–3: pre-flight, dry run, re-issue the function).** Before
   the deploy, so the stored community score written by the first new submission already agrees
   with what the new app shows (no deductions under 5 cups). It changes nothing stored by itself
   and is safe against the old app. **HOLD STEP 2** (the recompute of past scores, §12 steps 4–5,
   plus `scripts/resync-low-cup-history.ts`) until Kim has been told; it raises the stored score
   of past sessions under 5 cups with a flagged cup.

6. **PHASE 24 (§26): pre-flight, dry run, apply.** No dependency on the code (the app writes
   nothing through the API roles), so it can go before the deploy and closes the group-member
   mail hole sooner. Save the pre-flight (b) output: it is the rollback. This phase also fixes
   the `coffees`/`coffee_shares` policy recursion (42P17) with a new helper, `is_coffee_owner`.

7. **Environment (Vercel → Production).**
   - `ACCOUNT_DELETION_ENABLED`: leave **unset** (the account-deletion entry point stays off) until
     §24 has been run on a non-production environment and signed off. (The flag arrives with the
     audit's "server rules" change, S8-22 / A-01, which is in the chained S8 tip; only the exact
     value `1` turns deletion on. If that change is not in the deployed commit, account
     deletion is NOT gated: hold the deploy or accept it knowingly.)
   - `ANALYTICS_SUPER_ADMIN_EMAIL`: **required**, the super-admin address (§17). Without it (or with a
     malformed value) the production server refuses to start (the build still succeeds, every
     request then returns 500); there is no built-in fallback address any more.
   - `NEXT_PUBLIC_SITE_URL` present for Production AND Preview (§19).
   - Resend plan covers the daily volume, and Supabase **Authentication → Rate Limits → email**
     is not below the 60 per IP per 15 min tripwire (§11).

### Deploy

8. **Merge → Vercel deploys.** Outside a live tasting: the service worker goes to v4 (S8-09 took it
   to v3, S8-23 to v4; one release, so devices jump straight to v4) and every device rebuilds
   its caches once (§14).

### After the deploy

9. **Supabase dashboard (§15, §16)**, in this order:
   - Authentication → Sign In / Providers → Email: **OTP length = 6**; turn on **Secure email
     change**.
   - Authentication → URL Configuration: the redirect allow-list covers
     `https://cafesensible.ai/**` (includes `/auth/confirm` and `/en/auth/confirm`).
   - Authentication → Email Templates: paste Magic Link, Confirm signup, Change Email Address
     (copy the old ones first; they are the rollback). Why after the deploy: the new templates
     link to `/auth/confirm`, which did not exist before. Old emails keep working.
   - Authentication → Rate Limits: anonymous sign-ins at least 2x the largest room per hour; email
     as in step 7.

10. **Post-deploy checks.**
    - Sign-in: §15 smoke test (a bare GET of the link does not burn it; the 6-digit code works).
    - **Two-account Realtime** (owner + participant on an active group session): waiting room,
      cup and results update live; the owner's "enviados" counter moves (§10 step 5, §26 step 5).
    - **Phone offline**: §14 device checks and the §23 two-tab stale-replay test.
    - **Warm-up on two phones**: §9's synced warm-up check (master starts, participant follows,
      Detener closes it).
    - §13 `owed` query again after the next cron (06:00 UTC); Security Advisor shows nothing new.
    - The remaining per-PR smoke tests as time allows: §11, §18, §20, §21, §22, §25.

11. **Later, separately:** PHASE 23 STEP 2 + history resync once Kim knows (§12 steps 4–6);
    legal pages (§17 step 3); §24 on a non-production environment before turning on account
    deletion.

### Rollback order

Reverse, and only as far as needed:

1. **Email templates first** (paste the saved old ones): the old app has no `/auth/confirm`.
2. **Revert the deploy.** The schema stays: every migration is additive and the old code ignores
   the new objects. Exception (§21): once label-only history rows exist (`"coffeeId" IS NULL`),
   do NOT roll the code back below S8-16 (old code crashes the history page on them).
3. **SQL phases only if they are the cause**, newest first: PHASE 24 (its commented rollback +
   the saved pre-flight output), PHASE 23 (re-create the old function; re-run STEP 2 only if it
   had been run), PHASE 21 (its commented rollback). PHASE 22 needs none.
4. **Never roll back a migration** by hand, and never drop a new table or column while code that
   uses it is deployed.

---

## §10. Supabase — apply PHASE 21 (closed / expired = read-only in SQL, 2026-11, S8-01)

**When:** SQL FIRST, deploy second. PHASE 21 is safe against the old app (nothing the old
app does through Prisma/`postgres` is affected, and its participant Realtime binding on
`evaluations` simply stops receiving rows), but the new app expects it: non-owners now
learn about new results from the `cupping_sessions` channel only. Apply in the Supabase
**SQL editor of the production project** (there is only one). No Prisma migration.

**What it does** (`prisma/sql/rls_and_triggers.sql`, block `PHASE 21`, read its header):

- Browser key becomes **SELECT-only** on `evaluations`, `aggregate_scores`,
  `cupping_sessions`, `session_samples`, `session_participants`, `physical_evaluations`,
  `extrinsic_data`, `session_invites` and `profiles` (`INSERT/UPDATE/DELETE/TRUNCATE`
  revoked from `anon` and `authenticated`; the write policies are dropped). Every write
  already goes through a server action as `postgres`.
- A participant reads only their own `evaluations`; the owner also reads submitted rows
  of their sessions. `aggregate_scores` is hidden from participants until group results
  are visible (new helpers `is_session_owner`, `can_view_group_results`).
- `session_samples."coffeeId"` is no longer readable over the API for anyone (blind
  coding). **Future rule:** a new column on `session_samples` needs a
  `GRANT SELECT ("col") ON session_samples TO authenticated` in a new SQL phase, or API
  reads of it fail (Prisma is unaffected).
- Closes two adjacent holes: any user could mint an invite for any session
  (`session_invites`) and set their own `analyticsAccess` (`profiles`).

**Steps**

1. **Pre-flight** (SQL editor, read-only), from the header of the block:

   ```sql
   -- must list exactly: coffeeId, createdAt, id, label, position, referenceRank, revealed, sessionId
   select column_name from information_schema.columns
   where table_schema='public' and table_name='session_samples' order by 1;

   -- live group sessions that never recorded a start. After the deploy a
   -- participant cannot save evaluations in these (session_not_started):
   select id, name from cupping_sessions
   where "isGroup" and not "isAsync" and status = 'active' and "startedAt" is null;
   ```

   If the column list differs, add the missing columns to the `GRANT SELECT (...)` line
   before running. If the second query returns rows, ask each owner to press "Iniciar
   cata" (or close the session) before you deploy the app.
2. **Dry run** (fail-safe: one statement, nothing is applied). Open
   `prisma/sql/dry-runs/phase21_dry_run.sql` and replace its three placeholders. Find
   candidates with this read-only query (an active group session with at least one
   participant who has not submitted; `owner_id` is the creator, `participant_id` a
   non-owner participant):

   ```sql
   select cs.id as session_id, cs."createdBy" as owner_id, sp."userId" as participant_id
   from cupping_sessions cs
   join session_participants sp on sp."sessionId" = cs.id and sp.status <> 'owner'
   where cs."isGroup" and cs.status = 'active'
     and not exists (
       select 1 from evaluations e join session_samples ss on ss.id = e."sessionSampleId"
       where ss."sessionId" = cs.id and e."cupperId" = sp."userId" and e."isDraft" = false)
   limit 10;
   ```

   Paste the whole file and run it. Expected: a red error starting with `PHASE 21 DRY
   RUN: NOTHING WAS APPLIED`, listing lines 1a to 3b; compare each with its
   `(expect ...)` text. Any OTHER error: stop and report it (nothing was applied either
   way).
3. **Apply.** Run the block as written (`BEGIN … COMMIT`). Expected: `Success. No rows
   returned`.
4. **Verify** in the SQL Editor:

   ```sql
   select tablename, policyname, cmd, roles from pg_policies
   where tablename in ('evaluations','aggregate_scores','cupping_sessions','session_samples',
     'session_participants','physical_evaluations','extrinsic_data','session_invites','profiles')
   order by 1,2;
   ```

   Expected: no `ALL` policy and no `INSERT`/`UPDATE`/`DELETE` policy left on these tables.
   Then check Supabase **Advisors → Security** shows no new warnings.
5. **Deploy** the app (PR `S8-01`). Smoke test with two accounts (owner + participant,
   an active group session): the waiting room, cup and results screens still update live;
   after the participant submits, the owner's "enviados" counter moves; a participant on
   the results page sees "Hay novedades · Actualizar" when results become visible.

**Behaviour change to expect:** `closesAt` is now a **write cutoff**. After the chosen
day ends (UTC), saving, submitting and joining are refused (`session_closed`) and `/cup`
redirects to results at the same instant they open, even though the session stays
`active` until the daily cron closes it (~06:00 UTC next day). Drafts not submitted by then
are not counted. The warning to cuppers and the late-contribution rule are S8-05.

**Rollback:** the commented block at the end of PHASE 21 restores the old policies and
grants exactly; run it in one transaction. The app keeps working under either state.

---

## §11. Database — apply the `outbound_email_ledger` migration + PHASE 22 (2026-11, S8-03)

(S8-01 takes §10 / PHASE 21. If this PR merges first, renumber to §10 / PHASE 21 here and
in `prisma/sql/rls_and_triggers.sql`.)

**When:** BEFORE the deploy that contains S8-03. The ordering is mandatory, as in §9: the
regenerated Prisma client selects `tasting_groups."clientKey"` on every group read, so
deploying the code first makes the groups pages return 500 until the column exists. The
new email throttle also reads `outbound_email_events` on every sign-in link request, so
the login form fails until the table exists. Applying the migration first is safe — the
old code ignores the new objects.

**What it does** (`prisma/migrations/20261110120000_outbound_email_ledger/migration.sql`),
additive only:

- `outbound_email_events` — one row per reserved send (`kind`, `actorKey`, `targetKey`,
  `recipients`, `createdAt`). Keys are HMACs of the address / IP, never raw values.
- `group_email_deliveries` — one row per group-broadcast recipient (`sent | skipped |
  failed`), what "Reintentar fallidos" reads. FK to `tasting_group_members`, cascade.
- `tasting_groups."clientKey"` — nullable unique idempotency key of the create-group dialog.

**Steps** (repo root, production `DIRECT_URL` in `.env.local`, direct connection — same
precondition as §7):

1. Preview: `npx prisma migrate status`. **S8 release: ten migrations are pending together;
   follow §27 step 3 instead of the one-migration check below.** (Per-PR text: exactly one
   pending migration, `20261110120000_outbound_email_ledger`; anything else or drift: stop.)
2. Apply: `npx prisma migrate deploy` — expected: the migration(s) applied.
3. **PHASE 22 (RLS)** — Supabase → SQL Editor, run the `PHASE 22` block at the end of
   `prisma/sql/rls_and_triggers.sql`:

   ```sql
   ALTER TABLE outbound_email_events ENABLE ROW LEVEL SECURITY;
   ALTER TABLE group_email_deliveries ENABLE ROW LEVEL SECURITY;
   ```

   No policies on purpose (server-only through Prisma). Then check **Security Advisor**:
   it must not list these two tables as "RLS disabled".
4. **Verify** — SQL Editor:

   ```sql
   SELECT tablename, rowsecurity FROM pg_tables
   WHERE tablename IN ('outbound_email_events', 'group_email_deliveries');
   ```

   Expected: both rows `rowsecurity = true`.
5. Deploy the branch (merge → Vercel deploys).

**Limits worth checking before a live event** (`lib/emailLimits.ts`, one file):
sign-in link 3 per address and 60 per IP per 15 min; group mail 3 broadcasts per hour and
300 recipients per day per account (40 per day while the account is under 24 h). Confirm
the **Resend plan** covers the daily volume (Resend dashboard → Usage) and Supabase's own
auth email limit (Dashboard → Authentication → Rate Limits) is not lower than the 60 per IP
tripwire when a whole room asks for a link at once.

**Smoke test (2 minutes):** request a sign-in link for the same address four times in a
row — the fourth shows the "demasiados intentos" message under the form, no email is sent.
Create a group with an email member: the invitation arrives once; double-clicking the
create button yields one group.

**Rollback:** the objects are additive; code rolled back ignores them. Do not drop the
tables while the new code is deployed.

---

## §12. Supabase — apply PHASE 23 (one score below five cups, 2026-11, S8-04)

> **STEP 1 was applied 2026-11-11. STEP 2 (steps 4–5 below, the recompute and the history
> resync) is CANCELLED as of 2026-11-12 and must never run.** The rule of this section was
> replaced by the flat deduction at any cup count: see §30 and
> `docs/product/cata-descentralizada-puntaje.md`.

**When:** any time after the deploy; the new app is correct without it for what users SEE
(group results already ignored deductions under 5 cups), but the STORED score used by the
coffee history and profile only changes once this is applied. No Prisma migration. Apply in the
Supabase **SQL editor of the production project** (there is only one). **S8 release:** run
steps 1–3 (STEP 1) BEFORE the deploy and hold steps 4–5 until Kim is told; see §27 step 5.

**Tell Kim first.** The recompute (step 4) changes the stored community score of every
past session with fewer than 5 cups per sample and a flagged cup, once. Those scores go UP
(deductions disappear). Sessions with 5 or more cups never move.

**Steps**

1. **Pre-flight** (read-only). The live function must still be the PHASE 11 body:

   ```sql
   select pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure);
   ```

   It must contain `IF v_total_cups > 0 THEN` and not `v_cups_per_sample >= 5`. If it differs, stop.
2. **Dry run** (changes nothing): paste all of `prisma/sql/dry-runs/phase23_dry_run.sql` and run it.
   It ends with a red error starting `PHASE 23 DRY RUN: NOTHING WAS APPLIED`; that error is the
   expected result. Line 3 must say `0` (no row with 5 or more cups changes) and line 4 must show `{search_path=public}`. Line 2 is how many
   past aggregates will change. Any other error: stop and report it.
3. **STEP 1:** run the `CREATE OR REPLACE FUNCTION recompute_aggregate_score()` block of PHASE 23
   in `prisma/sql/rls_and_triggers.sql`. Nothing stored changes yet.
4. **STEP 2 (recompute):** run `UPDATE evaluations SET "isDraft" = "isDraft" WHERE "isDraft" = false;`
   (idempotent; a second run changes nothing).
5. **History:** from the checkout you choose, `npx tsx scripts/resync-low-cup-history.ts` (dry run:
   prints the rows that would change), then `npx tsx scripts/resync-low-cup-history.ts --apply`.
6. **Check:** pick one session with fewer than 5 cups and a flagged cup:

   ```sql
   select a."avgRawScore", a."communityScore" from aggregate_scores a
   join session_samples ss on ss.id = a."sessionSampleId"
   where ss."sessionId" = '<session id>';
   ```

   Before step 4 `communityScore` is below `avgRawScore`; after it equals `avgRawScore` rounded to
   0.25. The results page, the coffee profile and the history now show the same number.
   Also confirm the PHASE 18 `search_path` pin survived STEP 1:

   ```sql
   select proconfig from pg_proc where proname = 'recompute_aggregate_score';  -- expect {search_path=public}
   ```

   Then Security Advisor: no new findings expected.

**Rollback:** re-create the previous function body (kept verbatim in the PHASE 23 comment)
and re-run step 4, then step 5. Nothing is deleted: the cup flags stay in the evaluations.

---

## §13. Database: apply the `close_lifecycle` migration (2026-11, S8-05)

What it is for: the closing date keeps the owner's time zone, a closed session records
whether its second phase (history, emails) finished so a failed close can be repaired, and
reminder emails get their own ledger. Additive only; no Supabase SQL. Prisma migrations are
NOT applied by the deploy: run it yourself, **before** the deploy, from the checkout that
contains `prisma/migrations/20261111090000_close_lifecycle/`.

**Steps**

1. From that checkout (with `.env.local` or `DIRECT_URL` pointing at the production
   database; there is only one): `npx prisma migrate deploy`. **S8 release: it applies all ten
   S8 migrations at once; follow §27 step 3.** (Per-PR text: exactly one migration applied,
   `20261111090000_close_lifecycle`.)
2. **Check** (Supabase SQL editor, read-only):

   ```sql
   select count(*) filter (where status = 'closed' and "closeFinalizedAt" is null) as owed,
          count(*) filter (where status = 'closed') as closed
   from cupping_sessions;
   ```

   `owed` must be `0` right after the migration (history was backfilled to finalized).
3. Deploy. The next daily cron (06:00 UTC) now also runs the repair and reminder passes inside
   `close-expired-sessions`; there is no new cron entry. In the JSON response look for
   `repair` and `reminders`.
4. **After the deploy:** a session whose close emails or history failed shows up as `owed` in
   the query above after 5 minutes; the next cron run repairs it. Vercel logs: search
   `closeSession.finalize` (error level) for the step that failed.

**Rollback:** the deploy can be reverted freely (the columns are nullable and unused by old
code). Dropping the columns/table is not needed.

---

## §14. Offline sync hardening, service worker v3 (2026-11, S8-09)

What it is for: offline drafts get explicit end states (nothing is dropped silently), the
replay retries by itself, and the service worker stops serving stale or other users' pages.
**No migration and no Supabase SQL.** The one thing to know before deploying:

- `public/sw.js` goes from `v2` to `v3`. On the first visit after the deploy every
  browser drops its old `cata-static-*`, `cata-pages-*` and `cata-rsc-*` caches once and
  rebuilds them. Expect one slower first load per device and, for a cupper who is OFFLINE
  at that moment with an uncached page, the "need connection" screen. Deploy outside a live
  tasting. Drafts in IndexedDB are not touched.

**Steps**

1. Deploy. Nothing to run.
2. **Check** on a phone after the deploy: DevTools or Safari Web Inspector, Application,
   Cache Storage shows only `cata-*-v3` caches; `/app/insights` and `/app/profile` are not
   in `cata-pages-v3`.

**Device checks (physical iPhone and a low-end Android; audit 15 section 5)**

- Lock the phone mid-cupping with a pending draft, unlock: the replay runs without a tap.
- Turn the server off (or airplane mode on a resumed tab), watch "Próximo intento en N s";
  after 5 failed attempts the module is parked and "Reintentar sincronización" appears.
- Delete a session from a second device while the first holds a draft, reconnect: the draft
  appears under "Notas sin sincronizar", no endless retry.
- Sign out with a pending draft: the warning dialog names the count.
- A guest with a pending draft taps "Guardar mis resultados": the dialog names the count;
  after signing in, the draft replays under the new account (the marker is localStorage
  `cata_claim_anon`).
- Shared tablet: user A signs out, B signs in, go offline: A's pages are not served.

**S8-23 follow-up (service worker v4):** the static cache cap (120) is now least-recently-used:
a cache hit re-puts the entry so the running build's core chunks are not evicted first. The
cache-key logic changed, so `SW_VERSION` went `v3` to `v4`; the same one-time cache drop as
above applies on the first visit after that deploy (deploy outside a live tasting). Device
check: browse landing, app and several sessions (more than 120 distinct static files), go
offline and hard-reload a visited page: it must still boot. Check Cache Storage shows
`cata-*-v4` only.

**Not in this PR (owned by S8-15):** `navigator.storage.persist()` and the 3-day stale-draft
warning.

**Rollback:** revert the deploy. Reverting `sw.js` to `v2` evicts the v3 caches again on the
next activate; blobs written with the new statuses (`failed`, `orphaned`) are read by old
code as unknown statuses and simply never replay, so keep them readable by not deleting them.

---

## §15. Supabase — paste the sign-in email templates (2026-11, S8-06)

**Review Supabase Auth rate limits (S8-22 A-03, migration-free).** The app now counts code and
link verification ATTEMPTS itself (10 per address and 120 per IP per 15 minutes, kind
`code_verify` in `outbound_email_events`), but the server-side calls reach GoTrue from Vercel's
egress IPs, so GoTrue's per-IP buckets are shared by every user. Dashboard → Authentication →
**Rate Limits**: check "Token verifications" and "Sign-ups and sign-ins" are sized for your
largest room (50 people within a few minutes), not just "Emails sent".

No migration, no SQL. The sign-in link now opens `/auth/confirm` (a button press consumes
the token, so mail scanners cannot burn it) and the email also carries a 6-digit code.

**Order matters: deploy first, paste second.** Templates pasted before the deploy link to a
page that does not exist yet. Links from emails sent with the old template keep working
(`/auth/callback` redirects them to `/auth/confirm`).

1. Merge and let Vercel deploy.
2. Supabase Dashboard → Authentication → **Sign In / Providers → Email**: confirm
   **OTP length = 6**. Leave "OTP expiry" as it is; the copy never states a number.
3. Authentication → **URL Configuration**: the redirect allow-list must cover the site
   origin with a wildcard (`https://cafesensible.ai/**`), which includes `/auth/confirm` and
   `/en/auth/confirm`.
4. Authentication → **Email Templates**: paste, with the subject given at the top of each file
   - **Magic Link** ← `docs/auth/email-templates/magic-link.html`
   - **Confirm signup** ← `docs/auth/email-templates/confirm-signup.html`
   - **Change Email Address** ← `docs/auth/email-templates/change-email.html`
5. TODO(owner): confirm `hola@estudiodecafe.online` (`lib/siteContact.ts`) is the address people
   should write to when sign-in fails; it appears on the login screen and the "sent" state.

**Smoke test (3 minutes):** request a link; before opening it, `curl` the link URL (a bare
GET) — the page loads and the token is untouched. Then enter the 6-digit code from the same
email on the login screen: you are signed in. Repeat from `/en/auth/login` with a new
address: the email is in English and the link goes to `/en/auth/confirm`.

**Rollback:** paste the previous templates back (copy them before step 4). The code keeps
accepting both link shapes.

---

## §16. Supabase — account settings and guest capacity (2026-11, S8-07)

No migration, no SQL, no new env variable. Two dashboard settings, one rehearsal.

1. Authentication → **Sign In / Providers → Email**: turn on **Secure email change** (the change
   needs a click from the old and the new mailbox, so a hijacked session cannot silently move the
   account). The **Change Email Address** template was pasted in §15; the link lands on
   `/auth/confirm` and returns to `/app/profile`.
2. Authentication → **Rate Limits → Anonymous sign-ins**: this is a per-IP hourly cap. A room
   where 40 people share one Wi-Fi shows up as ONE IP. Set it to at least 2x the largest
   expected room per hour (for a 50-person tasting, 100 or more). Confirm "Allow anonymous
   sign-ins" is on (CLAUDE.md, Supabase Manual Steps).
3. **Rehearsal before a big event** (5 minutes): from one network, open the QR link in 40
   fresh private windows in sequence and join each time. All 40 must reach the waiting room or
   `/cup`. If the 41st fails with the "mucha gente está entrando" message, the limit is too low.
   Fallback during an event: people join with their email (magic link or 6-digit code).

**Manual path for a lost mailbox (E4 option c, Ricardo only):** a person who
can no longer open their old address and cannot use "Cambiar correo" writes to support. Verify
who they are by a second channel, then in Supabase Dashboard → Authentication → Users edit the
user's email to the new address. The profile and all history stay attached because they hang off
the user id, not the address. Never create a second account and "move" data by hand.

**Account deletion** (`deleteAccount`) shipped later, in S8-19: see §24.

---

## §17. Database + env + legal switch (2026-11, S8-08)

No SQL phase. One additive migration, one env variable, one code switch.

**1. Migration (before the deploy).** From the right checkout:
`npx prisma migrate deploy` applies `20261111100000_waitlist_consent` (two nullable
columns on `waitlist_entries`: `consentAt`, `consentNoticeVersion`). **S8 release: applied
together with the other nine S8 migrations, §27 step 3.** Old rows stay null; new rows stay null too until the legal pages are published, so these columns record consent only from that moment.
RLS stays on with no policies; nothing else to do.

**2. Env.** Set `ANALYTICS_SUPER_ADMIN_EMAIL` in Vercel Production to the address that
should be super-admin. Since S10 WP9b it is **required** (`REQUIRED_IN_PRODUCTION`): a
production server without it (or with a malformed value: it must be exactly one address)
refuses to start, and the built-in fallback address is gone. This does NOT fail the build:
the deployment goes Ready and then returns 500 on every request, so deploy a Preview first
(it runs with NODE_ENV=production too). Set it for Production AND Preview before deploying. After the S8 change only the super-admin
sees platform-wide insights, the platform report PDF, the digest and the email CSV export;
AI admins and flagged users see their own data.

**3. Publishing the legal pages (owner; S10 WP9a).** `/es|en/privacidad`, `/terminos` and `/aviso-legal` carry the final adapted text (Spanish original in `lib/legal/es/*`, English translation in `lib/legal/en/*`) but stay unpublished: they render for a direct visit with a "Borrador" banner and `noindex`, and nothing links to them. Steps:
   1. Read the three pages in Spanish and English on the Vercel preview of the WP9a PR. Open items still marked `TODO(owner)`: Registro Mercantil data (`LEGAL_ENTITY.registry`, mandatory under LSSI-CE art. 10.1(b); the pages omit the line until supplied), the founding-offer conditions (terms section 6), the Vercel/Resend transfer safeguards, and the contact address (the pages use the support address).
   2. Approve, then flip `LEGAL_PAGES_PUBLISHED` to `true` in `lib/legal/config.ts` (a one-line PR) and deploy. If the text changed after approval, bump `CONSENT_NOTICE_VERSION` in the same PR.
   3. What turns on together: the footer links (Privacidad, Términos, Aviso legal), the login-page legal line, the notice line under both waitlist forms, the consent stamp (`consentAt`, `consentNoticeVersion` written on new waitlist rows), the removal of the "Borrador" banner, indexing of the three pages (`robots` no longer `noindex`) and their listing in `app/sitemap.ts` (both locales). The test `tests/legalDocs.test.ts` fails if the flag is true while `LEGAL_ENTITY.registry` is still null (Registro Mercantil data is mandatory, LSSI-CE art. 10.1(b)).
   4. The pages STATE the 12-month deletion of unused accounts, so before the first account reaches 12 months (query in item 4 below) the rehearsal must have passed and `UNUSED_ACCOUNT_PURGE_ENABLED=1` must be set. Do not publish the pages while the switch is off and accounts are already due.
   5. Terms section 4 says the group's results are shown when the cupping is closed (organizer closes it or its closing date arrives). That is true only once the closing-rules change (PR #123) is live: today `canViewGroupResults` also shows them once everyone has submitted. Do NOT publish the pages before PR #123 is deployed.

**4. Unused accounts: the 12-month deletion (S10 WP9a; owner decision 2026-11-14).** Every founding-seat reservation and every request for a sign-in link or code creates an auth user at once (`signInWithOtp` makes an unconfirmed `auth.users` row and `handle_new_user` makes its `profiles` row), so "a reservation without an account" does not exist. The privacy text (sections 3 and 10) says: an account that was never used is deleted, with its reservation, once `WAITLIST_RETENTION_MONTHS` (12, calendar months) have passed since the person's LAST reservation or access request; if the person did sign in with the address of the reservation, the reservation is kept while the account exists; a reservation whose address matches no account is deleted 12 months after the reservation.

*What the daily `close-expired-sessions` cron does* (`lib/unusedAccountPurge.ts`; rule in `lib/unusedAccountRules.ts`):
- An account is "never used" when ALL hold: not anonymous; has an email; `email_confirmed_at`, `phone_confirmed_at` and `last_sign_in_at` are all null (a Google account is confirmed at creation, so it is never selected; any OTP or link sign-in confirms the address); not invited, not SSO, not banned, not soft-deleted; not the super-admin or an `ANALYTICS_AI_ADMIN_EMAILS` address; the LATEST of `created_at`, `confirmation_sent_at`, `recovery_sent_at`, `email_change_sent_at`, `reauthentication_sent_at` (SQL `GREATEST`) AND the `createdAt` of any reservation at the same normalised address is older than 12 calendar months (a person who asked for a link 13 months ago and reserved a seat yesterday is NOT due); and, a second line, none of the four access-email columns is within the last 48 hours (a link may still be in an inbox). An address that is empty or blank is never selected.
- It must also be EMPTY: no coffee, session, evaluation, participation, group, post, saved insight, history, AI usage, invite, or profile sign of use (analytics access, finished onboarding, a chosen role, country, bio, avatar). Such an account is never deleted; it counts as `skippedUsed`. Grants made TO the account by someone else (a coffee share), its own email ledgers and its reservation are deleted with it; a group owner's roster row that is linked to it keeps the address the owner typed and only loses the link. Nothing owned by another person is deleted.
- At most 50 accounts per run, oldest first. For each: one database transaction (re-check, unlink/erase, `profile` delete), then a LAST re-check of the auth row (a sign-in that landed in between keeps the auth user and logs `unusedAccount.signedInDuringPurge`, ids only), THEN the auth user through the admin API (3 attempts). If the admin call fails, the database rows are already gone, the failure is logged (`deleteAccount.authUserOrphaned`, ids only) and the NEXT run selects the auth user again and retries the deletion. A failure on one account never stops the others, and a failure of the whole pass never fails the cron.
- Reservations whose address has no auth user at all (the access email failed when reserving; or an old address left behind by an email change before this deploy) older than 12 months are deleted too, at most 500 per run. There is no exception for an email change: while a change is really in flight the account still holds the OLD address (so its reservation is not an orphan), and once it completes the reservation moves with it (next item).
- **Switch: `UNUSED_ACCOUNT_PURGE_ENABLED`** (Vercel env). Unset or anything but `1` = OFF: the job only counts, and logs one `unusedAccount.switchOff` warning per run when something is due. The cron JSON carries `unusedAccounts: { due, deleted, skippedUsed, failed, enabled, orphanReservations: { due, deleted } }` (counts only).
- An email change: after Supabase accepted the request, `requestEmailChange` records `{ from, to }` in the account's `app_metadata.email_change` through the service role (service role only; `user_metadata` is user-writable and is never read for this): `from` is the address the SERVER read for the signed-in user, `to` the new address the SERVER passed to Supabase. Each new request overwrites the record. The move runs in ONE place: `confirmEmailToken`, right after the link's token was verified for `type=email_change`, whatever the browser does afterwards (opened in another browser and never confirmed with "Si, continuar", or "No soy yo": the change is complete at Supabase either way). It moves the reservation row to the new address only when the verified account's current address IS the recorded `to` and no second confirmation is pending (the first of two "secure email change" confirmations moves nothing), only if the old address has a row, the new one has none and no OTHER account holds the old address (in that last case nothing moves and the record is KEPT, logged `old_address_held`), and then clears the record. A record whose `to` never became the account's address is inert. Changes completed BEFORE this deploy cannot be reconciled: a reservation left under an old address with no account is deleted after 12 months as an orphan. Addresses compare as lowercase with surrounding SPACES trimmed (`lower(btrim())` in SQL, `normalizeAddress` in code), nothing wider.

*Pre-flight (only the owner can check these; do them before the rehearsal).*
- The role behind `DATABASE_URL` can read `auth.users`: in the SQL editor run `select current_user, has_table_privilege(current_user, 'auth.users', 'SELECT');` (the user should be `postgres.<ref>`, the answer `true`). After deploying with the switch OFF, the cron JSON must show `unusedAccounts.due` as a number, not `{ error }`.
- The SQL editor may UPDATE `auth.users` (the rehearsal back-dates one row). If it is refused, STOP: there is no other project to rehearse on.
- The real `auth.users` has every column the job reads (the queries below fail loudly with "column does not exist" if not), including `raw_app_meta_data`.
- GoTrue's OTP expiry (Authentication > Providers/Email) is 24 hours or less (the 48-hour guard relies on it).
- "Secure email change" is on (the code works either way: the first of two confirmations returns no user, so nothing moves).
- Read-only count BEFORE the rehearsal's switch-on step. Reservations with no account, older than the period:

```sql
select count(*) as orphan_reservations from waitlist_entries w
where w."createdAt" < now() - interval '12 months'
  and not exists (select 1 from auth.users u where lower(btrim(u.email)) = lower(btrim(w.email)));
```

  **The reservations this query counts WILL BE DELETED by the rehearsal's switch-on step (step 5), up to 500 real rows on the first run: the switch-on deletes every reservation older than the period whose address matches no account, not only the throwaway's. That is exactly what the privacy text promises ("las reservas cuya dirección ya no corresponde a ninguna cuenta se eliminan una vez transcurridos 12 meses"). Proceed to step 5 only if you accept that deletion. If you do not, STOP here: leave the switch off and tell the developer.** To see the rows first: `select * from waitlist_entries w where w."createdAt" < now() - interval '12 months' and not exists (select 1 from auth.users u where lower(btrim(u.email)) = lower(btrim(w.email)));`.

  Accounts due: the cron JSON's `unusedAccounts.due` with the switch OFF. The rehearsal proceeds ONLY when due = 1 (the throwaway). Run steps 4 and 5 of the rehearsal the SAME DAY: an account can become due in between.

*Read-only checks (SQL editor, nothing is written).* Upper bound of what will become due (the cron adds the "empty account" and super-admin filters; its JSON with the switch OFF gives the exact `due`):

```sql
select count(*) as never_used,
       count(*) filter (where greatest(u.created_at, u.confirmation_sent_at, u.recovery_sent_at, u.email_change_sent_at, u.reauthentication_sent_at) < now() - interval '12 months') as over_12_months
from auth.users u
where u.is_anonymous = false and u.email is not null
  and u.email_confirmed_at is null and u.phone_confirmed_at is null and u.last_sign_in_at is null
  and u.invited_at is null and coalesce(u.is_sso_user, false) = false
  and u.banned_until is null and u.deleted_at is null;
```

The OLDEST never-used account (the switch MUST be on, after the rehearsal, before `switch_on_before` below, because the privacy text promises the deletion):

```sql
select min(greatest(u.created_at, u.confirmation_sent_at, u.recovery_sent_at, u.email_change_sent_at, u.reauthentication_sent_at)) as latest_activity_of_the_oldest, min(greatest(u.created_at, u.confirmation_sent_at, u.recovery_sent_at, u.email_change_sent_at, u.reauthentication_sent_at)) + interval '12 months' as switch_on_before
from auth.users u
where u.is_anonymous = false and u.email is not null
  and u.email_confirmed_at is null and u.phone_confirmed_at is null and u.last_sign_in_at is null
  and u.invited_at is null and coalesce(u.is_sso_user, false) = false
  and u.banned_until is null and u.deleted_at is null;
```

If a query fails with "column does not exist", a GoTrue column differs from `lib/unusedAccountPurge.ts`: stop and tell the developer before switching anything on (the job reads exactly these columns).

*Rehearsal on ONE throwaway address (before the first real deletion).* 1) From the landing form (or the login page) request an access link for an address you own and NEVER open the link. 2) Find its id (read-only): `select id, email, created_at from auth.users where email = '<that address>';` 3) The one write, owner-run, back-dates that single account: `update auth.users set created_at = now() - interval '13 months', confirmation_sent_at = now() - interval '13 months' where id = '<that id>';` and `update waitlist_entries set "createdAt" = now() - interval '13 months' where lower(btrim(email)) = '<that address, typed in LOWERCASE>';` (the 12 months count from the latest of creation, last access email and reservation, so ALL three must be back-dated; use the id, never the address for `auth.users`). 4) Call the cron by hand with the switch still OFF (the curl in §3) and confirm `unusedAccounts.due` is EXACTLY 1 (more means real accounts are already due: investigate, do not continue) and `deleted` is 0. If `due` is 0 the back-dating did not take (a column missed, the address typed with capitals, the wrong id): STOP, check the three back-dated values with a read-only `select`, and do NOT switch on until `due` is exactly 1. 5) Set `UNUSED_ACCOUNT_PURGE_ENABLED=1` in Vercel Production, redeploy, call the cron again: expect `due: 1, deleted: 1, failed: 0`. 6) Verify with read-only queries that `auth.users`, `profiles` (`where id = '<id>'`) and `waitlist_entries` (`where email = '<address>'`) no longer have it, and that the counts of the other tables did not change. 7) Leave the switch on.

*Turning it on* (Vercel → Project → Settings → Environment Variables → add `UNUSED_ACCOUNT_PURGE_ENABLED` = `1` for Production → redeploy). To turn it off, delete the variable or set it to anything but `1`.

**Verify:** insert one waitlist entry from the hero form on a preview and check
`source = 'hero'` and BOTH `consentAt` and `consentNoticeVersion` null (legal pages unpublished, no notice shown, no consent recorded; they are stamped only after the flag is true); open
`/?src=chile` and submit the founding form: `source = 'founding:chile'`. Log in as an AI admin:
the Users page shows masked emails (masked in the payload itself), no reveal toggle and no CSV button; Vercel Logs search `"where":"audit"`.

**Rollback:** the columns are nullable and unused by older code; no rollback needed. To give AI
admins the platform view again change `scopeFor` in `lib/analytics/scope.ts`.

---

## §18. Database — apply the `invite_active_entries_locked` migration (2026-11, S8-11)

**When:** BEFORE the deploy that contains S8-11 (live group robustness). The regenerated
Prisma client selects `session_invites."active"` and `cupping_sessions."entriesLocked"`
on every invite / session read, so deploying the code first makes the join page, the cup
and waiting pages and every session list return 500 until the columns exist. Applying
the migration first is safe: old code ignores both columns.

**What it does** (`prisma/migrations/20261111110000_invite_active_entries_locked/migration.sql`):

```sql
ALTER TABLE "session_invites" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "cupping_sessions" ADD COLUMN "entriesLocked" BOOLEAN NOT NULL DEFAULT false;
```

Two columns with constant defaults, no index, no backfill. Every existing invite stays
usable and every existing session keeps accepting newcomers. Brief lock, no downtime.
No SQL PHASE block and no RLS change are needed.

**Steps** (repo root, production `DIRECT_URL` in `.env.local`, same precondition as §9):

1. `npx prisma migrate status`. **S8 release: ten migrations are pending together; follow
   §27 step 3 instead.** (Per-PR text: exactly one pending migration,
   `20261111110000_invite_active_entries_locked`; anything else: stop.)
2. `npx prisma migrate deploy`.
3. Deploy the code.

**Verify:** open a group session as owner, press "Invitar" twice — the same link shows
both times; "Regenerar enlace" (confirm) shows a new link and the old one reads "expirado"
on `/join`. Close entries in the master panel: a new scan is refused with a clear
message, an existing participant re-enters.

**Rollback:** code revert is enough (the columns are harmless when unread).

---

## §19. Database — apply the `digest_run_status` migration (2026-11, S8-14)

**When:** BEFORE the deploy that contains S8-14. The regenerated Prisma client selects
`digest_runs."status"` and `"results"` on every digest read and the monthly cron
(`/api/cron/insights-digest`, `0 12 1 * *`) now claims the month with a `running` row.
Deploying the code first makes the cron fail with a missing-column error.

**What it does** (`prisma/migrations/20261111120000_digest_run_status/migration.sql`):

```sql
ALTER TABLE "digest_runs" ADD COLUMN "results" JSONB,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'done';
```

One nullable column and one column with a constant default. Existing rows become
`done` (they were complete runs). No index, no backfill, no SQL PHASE, no RLS change.

**Steps** (repo root, production `DIRECT_URL` in `.env.local`, same precondition as §9):

1. `npx prisma migrate status`. **S8 release: ten migrations are pending together; follow
   §27 step 3 instead.** (Per-PR text: exactly one pending migration,
   `20261111120000_digest_run_status`; anything unexpected: stop.)
2. `npx prisma migrate deploy`.
3. Deploy the code.
4. Confirm `NEXT_PUBLIC_SITE_URL` exists in Vercel for Production AND Preview (the digest
   link and every group email use it; Preview falls back to localhost without it).

**Verify:** `/es/app/insights/access` (super-admin) shows a "Resumen mensual por correo"
card. To test the cron manually:
`curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/insights-digest`.
With `RESEND_API_KEY` set it answers `sent: 1`; the second call answers `alreadyRan: true`.
With the key unset it answers `sent: 0` and no row is kept, so the month is free to run again.
A `running` row older than 30 minutes (a crashed run) is taken over by the next call.

**The cron is monthly, so nothing retries by itself.** A run left `running` (the function
died) or released with zero sends is NOT retried automatically: the next scheduled tick is a
month away. The owner re-runs the cron URL by hand (the `curl` above) once 30 minutes have
passed for a stuck `running` row, or right after fixing the cause for a zero-send run. Until
then the Acceso page shows "En curso" for the stuck run. Each recipient's outcome is saved as
soon as its email is sent, so the manual re-run skips anyone who already received it.

**Rollback:** code revert is enough (the columns are harmless when unread). If a `running`
row blocks a month you want to resend, delete it in the SQL editor:
`DELETE FROM digest_runs WHERE status = 'running';`.

---

## §20. Database — apply the `exclusion_audit_extrinsic_edited` migration (2026-11, S8-12)

> Numbering: §12–§19 belong to S8-04…S8-14 and land in series order; this section keeps its
> reserved number so the chained branches merge mechanically.

**What it does:** adds four NULLABLE columns, no defaults, no foreign keys, no policy change.

| Column | Meaning |
|---|---|
| `session_participants.excluded_at` | when the owner excluded the cupper from the group results |
| `session_participants.excluded_by` | who (plain user id, deliberately without a foreign key) |
| `session_participants.exclusion_reason` | `sample_error`, `protocol`, `calibration` or `other` |
| `extrinsic_data.edited_at` | when the owner corrected origin data after the session closed |

**Order matters:** run it BEFORE the deploy. The new code selects these columns; without them
the results page fails to load.

1. On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx prisma migrate deploy
   ```
   **S8 release: ten migrations are applied together, follow §27 step 3.** (Per-PR text:
   `1 migration found … 20261111130000_exclusion_audit_extrinsic_edited … applied`.)
2. **Verify** — Supabase SQL Editor:
   ```sql
   SELECT table_name, column_name FROM information_schema.columns
   WHERE (table_name = 'session_participants' AND column_name IN ('excluded_at','excluded_by','exclusion_reason'))
      OR (table_name = 'extrinsic_data' AND column_name = 'edited_at')
   ORDER BY 1, 2;
   ```
   Expected: four rows.
3. Deploy the branch (merge → Vercel deploys). No SQL PHASE, no environment variable.

**Smoke test (3 minutes, owner of a group session):** exclude a cupper in the owner matrix →
a dialog asks for the reason → after confirming, the management card shows "Excluido por … el …
· motivo". On a CLOSED session do the same: the yellow "Resultados actualizados el …" banner
appears for every viewer. On a closed session open a revealed sample → Editar origen → save: the
detail shows "Origen editado el …"; on an unrevealed sample the button is absent.

**Rollback:** the columns are nullable; code rolled back ignores them. Do not drop them while
the new code is deployed.

---

## §21. Database — apply the `history_coffee_optional` migration (2026-11, S8-16)

**What it does:** `user_coffee_history."coffeeId"` stops being NOT NULL. The foreign key to
`coffees` (ON DELETE CASCADE) and every index stay. Nothing is backfilled: label-only rows
(no coffee) are written from now on, never retroactively.

**Order matters:** run it BEFORE the deploy. The new code inserts rows with a NULL `coffeeId`
when an express/coffee-less session closes or a never-revealed sample's session is deleted;
without the migration those closes would fail at the history step.

1. On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx prisma migrate deploy
   ```
   **S8 release: ten migrations are applied together, follow §27 step 3.** (Per-PR text:
   `1 migration found … 20261111140000_history_coffee_optional … applied`.)
2. **Verify** — Supabase SQL Editor:
   ```sql
   SELECT is_nullable FROM information_schema.columns
   WHERE table_name = 'user_coffee_history' AND column_name = 'coffeeId';
   ```
   Expected: `YES`.
3. Deploy the branch. No SQL PHASE, no environment variable.

The same migration creates a partial unique index, `user_coffee_history_label_row_evaluation_key`
(one label-only row per evaluation). Prisma's schema cannot express it, so `prisma migrate dev`
may propose dropping this index; never accept.

**Smoke test (3 minutes):** run a "Catar ahora" session with one sample and no coffee, submit
→ it closes; Perfil → Historial shows a row "Muestra A · Sin café asignado" that links to the
session results and not to a coffee page. Assign a coffee to that sample from the results
drill-down: the row becomes the normal coffee row (no duplicate). Delete an open session that
has a never-revealed coffee-linked sample with a submitted evaluation: your history shows the
sample label with "Café sin revelar" and no coffee name.

**Rollback:** do NOT roll the code back below this migration once label-only rows exist (old
code dereferences `coffee.id` and would crash the history page). Do not re-add NOT NULL while
rows with a NULL `coffeeId` exist; delete them first
(`DELETE FROM user_coffee_history WHERE "coffeeId" IS NULL;`).

## §22. Database — apply the `session_notify_group_at_start` migration (2026-11, S8-17)

**What it does:** adds two columns to `cupping_sessions`: `notifyGroupAtStart` (BOOLEAN NOT NULL
DEFAULT false) and `groupNotifiedAt` (nullable TIMESTAMPTZ). No foreign keys, no policy change.

**Order matters:** run it BEFORE the deploy; the new code selects these columns.

1. On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx prisma migrate deploy
   ```
   **S8 release: ten migrations are applied together, follow §27 step 3.** (Per-PR text:
   `20261111150000_session_notify_group_at_start … applied`.)
2. **Verify** — Supabase SQL Editor:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'cupping_sessions' AND column_name IN ('notifyGroupAtStart','groupNotifiedAt');
   ```
   Expected: two rows.
3. Deploy the branch. No SQL PHASE, no environment variable.

**Smoke test:** create a LIVE group session linked to a group with the notify box ticked: no email
at creation. Press "Iniciar cata": the members get one email; pressing start again sends nothing.
An async session (with a closing date) still emails at creation.

**Rollback:** the columns are additive; rolled-back code ignores them (live sessions would then
email at creation again).

## §23. Database — apply the `evaluation_last_client_write` migration (2026-11, S8-18)

> Numbering: §21–§22 are reserved for sibling S8 follow-ups; this section keeps §23 so the
> branches merge mechanically.

**What it does:** adds ONE nullable column, `evaluations."lastClientWriteAt" timestamptz(3)`, no
default, no index, no foreign key, no policy change. It records the newest client edit time accepted
for an evaluation so an older offline replay cannot overwrite a newer save. Scoring, the aggregate
trigger and `aggregate_scores` never read it.

**Order matters:** run it BEFORE the deploy. The new code writes the column; without it every
evaluation save with a client timestamp fails.

1. On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx prisma migrate deploy
   ```
   **S8 release: ten migrations are applied together, follow §27 step 3.** (Per-PR text:
   `1 migration found … 20261111160000_evaluation_last_client_write … applied`.)
2. **Verify** — Supabase SQL Editor:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'evaluations' AND column_name = 'lastClientWriteAt';
   ```
   Expected: one row, `timestamp with time zone`.
3. Deploy the branch. No SQL PHASE, no environment variable.

**Smoke test (3 minutes, two tabs, same cupper):** in tab A go offline (devtools), edit a sample,
note the amber pending pill; in tab B (online) edit the same field to another value and wait for the
green saved state; bring tab A online. Tab B's value must remain after the replay and tab A's pill
clears. Vercel Logs shows one `replayEvaluation.staleClientWrite` line.

**Rollback:** the column is nullable; code rolled back ignores it. Do not drop it while the new
code is deployed.

## §24. Account deletion: verify on a throwaway account, clean an orphaned auth user (2026-11, S8-19)

No migration and no SQL phase. **Account deletion ships DISABLED (S8-22 A-01).** The one
environment variable is `ACCOUNT_DELETION_ENABLED`: **leave it unset until the
throwaway-account rehearsal below has passed** in a non-production environment. While it is
unset (or anything other than `1`) the profile page does not show "Eliminar cuenta" and both
`deleteAccount` and the impact read refuse with `not_found_or_forbidden`. Set it to `1` in
Vercel (Production) only after the rehearsal, then redeploy. Nothing else to apply before the deploy.
`deleteAccount` creates its own placeholder profile (`deleted_<random>`) inside its transaction,
so there is no fixed tombstone row to insert.

**Order of effects (S9-01, audit A-06):** kept live group sessions are closed BEFORE the deletion
transaction starts (`closeSessionInternal`, emails skipped), so if the transaction then fails
(conflict, timeout) those sessions stay closed even though the account still exists. Tell the
person so; retrying the deletion is safe. Separately (A-07), in sessions that are not closed
where the person only took part and submitted nothing, their participant row and draft
evaluations are deleted instead of moved to the placeholder.

**What the automated suite now covers (S9-04):** `npm run test:db` runs `deleteAccountData` against
a disposable local Postgres (all migrations and `rls_and_triggers.sql` applied): the whole
transaction, the placeholder profile, kept and deleted sessions, the A-07 drop of draft-only
participation, anonymized coffees, every table of `lib/accountDeletion/manifest.ts` (no row left
pointing at the person) and that other people's submitted evaluations and stored scores are
untouched. It does NOT cover the real Supabase auth user deletion (the admin call is mocked, so the
orphan path of this section still needs a real check), a production-sized account, or the
production schema's drift. The rehearsal below stays required.

**Never test this against production with a real account.** `.env.local` points at
production: do not run `deleteAccount` from a local dev server with it. Verify only in a
NON-production environment (a Supabase branch or a separate project with its own
`DATABASE_URL`, seeded with throwaway accounts), or, if no such environment exists yet, wait.

**Verification on a throwaway account (non-production only, ~10 minutes):**

1. Create throwaway account A (email) and B (email) and one guest G (QR join).
2. As A: create a solo session and finish it; create a group session, have B and G join and
   submit; exclude G from the results (owner matrix). Create a coffee and a tasting group with B
   as a member; post once. Leave a second group session live (not closed) with B's submission.
3. As A: Perfil → Cuenta → **Eliminar cuenta**. The dialog lists the counts (1 session deleted,
   2 kept, evaluations anonymized, 1 coffee anonymized, 1 group kept). Type `ELIMINAR`
   (`DELETE` in English) and confirm. You land on the landing page, signed out.
4. As B: both group sessions are CLOSED and still show results; A's column/row reads
   "Cuenta eliminada"; the community scores are exactly what they were before step 3; G is still
   excluded. The group is still listed for B with owner "Cuenta eliminada"; A's post reads
   "Cuenta eliminada". The coffee in the session shows "Café eliminado".
5. Supabase Dashboard → Authentication → Users: A is gone. Sign up again with A's email: a fresh,
   empty account is created.
6. As G (guest): Perfil → Eliminar cuenta works too.
7. With the super-admin account: the dialog says the account cannot be deleted from the app.

**If the auth user could not be deleted** (the action logs `deleteAccount.authUserOrphaned`
with the user id; the person's data is already gone and they are signed out):

1. Vercel Logs → search `deleteAccount.authUserOrphaned` → copy the `userId`.
2. Supabase Dashboard → Authentication → Users → search the id → **Delete user**.
3. Nothing else: the profile row no longer exists. Do NOT recreate it.

**Bound: more than 300 own sessions to delete (`MAX_SESSIONS_TO_DELETE`).** The deletion is ONE
transaction (timeout 120 s; the profile page exports `maxDuration = 300`) and every session it
deletes detaches coffee history first, so above 300 the app refuses up front: the dialog says the
account has too many sessions and to write to support, and the action returns
`account_too_large` before anything is written. Manual path, for the owner only, never from a
local dev server pointed at production:

1. Confirm the request comes from the account's own mailbox (as in §16).
2. Ask a developer to reduce the count first: delete the person's oldest SOLO sessions in batches
   through the normal `deleteSession` path (it detaches history the same way), never with raw SQL,
   until fewer than 300 own sessions would be deleted.
3. The person then deletes the account from Perfil → Eliminar cuenta as usual.

**If the transaction fails** (timeout, conflict, any error): nothing is deleted and the person
can retry, BUT the shared sessions the pre-step closed stay closed (closing is not part of the
transaction and is not undone).

**Lost mailbox (E4 option c):** unchanged, see §16.

**Rollback:** reverting the deploy removes the button. Deletions already done cannot be undone
(by design).

## §25. Database — apply the `group_member_email_opt_out` migration (2026-11, S8-20)

> Numbering: §21–§24 belong to the other S8 follow-ups and land in series order; this section
> keeps its reserved number so the chained branches merge mechanically.

**What it does:** adds one NULLABLE column, no default, no foreign key, no policy change:
`tasting_group_members."emailOptOutAt"` (TIMESTAMPTZ), set when a member unsubscribes from a
group's emails.

**Order matters:** run it BEFORE the deploy. The sender now reads this column on every group
mail; without it group email fails.

1. On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx prisma migrate deploy
   ```
   **S8 release: ten migrations are applied together, follow §27 step 3.** (Per-PR text:
   `1 migration found … 20261111170000_group_member_email_opt_out … applied`.)
2. **Verify** — Supabase SQL Editor:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'tasting_group_members' AND column_name = 'emailOptOutAt';
   ```
   Expected: one row, `timestamp with time zone`.
3. Deploy the branch. No SQL PHASE, no new required environment variable (the token uses
   `GUEST_CLAIM_SECRET`; `NEXT_PUBLIC_SITE_URL` builds the link and is already required).

**`UNSUBSCRIBE_SECRET` (S9-02, A-11, optional).** Unsubscribe links never expire, so the secret
that signed them must outlive every mail ever sent. A dedicated secret lets `GUEST_CLAIM_SECRET`
be rotated later without breaking NEW mails' links:

- Generate: `openssl rand -base64 48`, add it in Vercel Production as `UNSUBSCRIBE_SECRET`, redeploy.
- From then on new mails are signed with it. Verification accepts BOTH the new secret and the
  legacy one (`GUEST_CLAIM_SECRET`, else the service-role key), so every link mailed before the
  switch keeps working as long as the legacy value is unchanged.
- **Never remove or change `UNSUBSCRIBE_SECRET` once set**: every link mailed since would stop
  working. If it must change, there is no second slot: keep the old value reachable as the
  legacy one or accept that those links die.
- **Rotating `GUEST_CLAIM_SECRET` still breaks the links of mails sent BEFORE the switch**
  (they were signed with it). Only mails sent after `UNSUBSCRIBE_SECRET` was set survive that
  rotation. A broken link only means the person cannot self-unsubscribe from that old mail
  (the owner can still remove them); it never unsubscribes the wrong person.
- Unset: behaviour is exactly as before; the app logs one boot warning in production.

**Smoke test (3 minutes):** send a group announcement email to a test address; the mail has a
"Darte de baja…" footer link (and your mail client shows its own Unsubscribe control). Open it →
confirm page → "Darme de baja" → "Listo". Send another announcement: the result shows that
member as skipped and the owner roster shows "Se dio de baja de los correos". Sign in as that
member → group page shows the notice → "Volver a recibir correos de este grupo" clears it.

**Rollback:** the column is nullable; code rolled back ignores it. Do not drop it while the new
code is deployed.

---

## §26. Supabase — apply PHASE 24 (API roles read-only across the schema, 2026-11, S8-24 / audit A-02)

**When:** any time, before or after the deploy (the app never writes through the API roles;
see §27 step 6 for its place in the S8 order). No Prisma migration. Apply in the Supabase **SQL editor of
the production project** (there is only one).

**What it does** (`prisma/sql/rls_and_triggers.sql`, block `PHASE 24`, read its header):

- Drops the last five write policies on the browser key: `tasting_groups_owner_all`,
  `tasting_group_members_owner_all`, `group_posts_write`, `coffees_write`, `history_own`.
  The exploitable one let any signed-in user (a guest too) link any user id into their own
  group over `/rest/v1/tasting_group_members` and then mail that person through "Enviar
  correo". Where a dropped policy was also the only read path (`tasting_groups`,
  `tasting_group_members`, `user_coffee_history`) a SELECT-only twin with the same condition
  replaces it, so reads do not change.
- Re-targets the six SELECT policies that had no role (`coffees_select`,
  `coffee_shares_select`, `group_posts_select`, `sessions_select`, `samples_select`,
  `participants_select`) to `authenticated`. The public key can no longer list public coffees
  with their owner ids. (`coffee_shares_select` is recreated instead of re-targeted, next line.)
- Breaks a policy recursion found by the 2026-11-10 production dry run: since PHASE 16
  `coffees_select` and `coffee_shares_select` read each other's tables, so any select on either
  as `authenticated` failed with `42P17`. The new SECURITY DEFINER helper `is_coffee_owner(text)`
  (EXECUTE for `authenticated` only) lets `coffee_shares_select` skip the `coffees` policy.
  Dry run lines 1g (`t f`) and 3e (a count, no error) check it; 1e stays 16.
- Revokes `INSERT/UPDATE/DELETE/TRUNCATE` from `anon` and `authenticated` on **every** table in
  `public`, and changes the default privileges of `postgres` so a table created by a future
  migration is born read-only for them. **Future rule:** a table the browser must write
  needs an explicit `GRANT … TO authenticated` (and a policy) in its own SQL phase.
  Only schema `public` is covered: Supabase's `storage` schema keeps its own defaults and is
  out of scope (dry run 4a counts `public` only; 4c lists other schemas, informational).
- Ends with a self-check: if any write policy or API-role write privilege is left, the whole
  block aborts and nothing is applied.

**Steps**

1. **Pre-flight** (read-only): run the three queries (a), (b), (c) from the PHASE 24 header.
   (a) must list exactly the 18 policies named there; anything else: stop and report.
   **Save the output of (b) and (c)**: (b) prints the exact `GRANT` statements that restore
   today's write grants, which is the grant half of the rollback.
2. **Dry run** (fail-safe: one statement, nothing is applied). Open
   `prisma/sql/dry-runs/phase24_dry_run.sql` and replace its one placeholder, `<owner-uuid>`,
   with a registered user who owns a tasting group and a coffee:

   ```sql
   select g."createdBy" as owner_id, count(*) as groups
   from tasting_groups g
   join coffees c on c."createdBy" = g."createdBy" and c."deletedAt" is null
   group by 1 order by 2 desc limit 5;
   ```

   Paste the whole file and run it. Expected: a red error starting with `PHASE 24 DRY RUN:
   NOTHING WAS APPLIED`, lines 1a to 4b; compare each with its `(expect ...)` text (1a, 1b,
   1c, 1d, 2a, 2b, 2c and 4a must be `0` / `f`; 3a and 3b greater than 0 for that owner).
   Line 4b is informational. Any OTHER error (for example `policy "…" does not exist`):
   stop and report it; nothing was applied either way.
3. **Apply.** Run the block as written (`BEGIN … COMMIT`). Expected: `Success. No rows
   returned`. An error starting `PHASE 24 aborted, nothing applied` means the self-check
   found something left: report it.
4. **Verify** in the SQL Editor:

   ```sql
   select tablename, policyname, cmd, roles from pg_policies
   where schemaname = 'public' and (cmd <> 'SELECT' or roles <> '{authenticated}');
   ```

   Expected: no rows. Then Supabase **Advisors → Security**: no new warnings.
5. **Smoke test** (two accounts, an active group session): the waiting room, cup and results
   screens still update live (Realtime reads `cupping_sessions` and `evaluations` through
   their SELECT policies); create a group, add a member, post, send a group email, create a
   coffee: all work (they are server actions through Prisma).

**Rollback:** the commented block at the end of PHASE 24 (paste the saved pre-flight (b)
output where it says so; run the default-privileges line only if (c) showed them). Run it
in one transaction. The app keeps working under either state.

---

## §28. Supabase — apply PHASE 25 (hide exclusion metadata from the API, 2026-11, S9-02 / audit A-10)

**When:** any time, before or after the deploy; the app never reads `session_participants`
through the API (Prisma reads it as `postgres`, which ignores column privileges). No Prisma
migration, no new environment variable. Apply in the Supabase **SQL editor of the production
project** (there is only one). **This PR does NOT apply it: you do, after the dry run.**

**What it does** (`prisma/sql/rls_and_triggers.sql`, block `PHASE 25`, read its header):

- Today every member of a session can read every row of `session_participants` over
  `/rest/v1/session_participants`, including who the owner excluded from the results
  (`excluded_from_results`, `excluded_at`, `excluded_by`, `exclusion_reason`).
- The block revokes table-level SELECT from `anon` and `authenticated` and grants back only
  `"sessionId"`, `"userId"`, `status`, `"joinedAt"` to `authenticated`. The four exclusion
  columns are unreadable over the API; the header lists every policy and function that
  touches the table and why hiding them cannot break one (only SECURITY DEFINER code reads
  `excluded_from_results`).
- Side effect: `select=*` against that endpoint now errors; name the columns.
- **Future rule:** a NEW column on `session_participants` needs its own
  `GRANT SELECT ("col") ON session_participants TO authenticated;` in a later phase.

**Steps**

1. **Pre-flight** (read-only): run queries (a) to (d) from the PHASE 25 header. (a) must list
   exactly the eight columns; (d) exactly `participants_select SELECT {authenticated}`.
   Anything else: stop and report. **Save the output of (b)**: it is the rollback.
2. **Dry run** (fail-safe: one statement, nothing is applied). Open
   `prisma/sql/dry-runs/phase25_dry_run.sql`, replace `<owner-uuid>` and `<session-id>` with
   a session owner and one of their group sessions:

   ```sql
   select s."createdBy" as owner_id, s.id as session_id, count(p.*) as roster
   from cupping_sessions s
   left join session_participants p on p."sessionId" = s.id
   where s."isGroup" group by 1, 2 order by 3 desc limit 5;
   ```

   Paste the whole file and run it. Expected: a red error starting `PHASE 25 DRY RUN:
   NOTHING WAS APPLIED`. Compare each line with its `(expect ...)` text: 1a all `t`;
   1b all `f f`; 1c `0`; 2a a roster count, 2b `ok`; every 2c and 2d line `refused`; every
   line 3 a number and no `FAILED`; 4a/4b `t` for the owner, 4c no error. **Any `FAILED` or
   `NOT REFUSED`, or any OTHER error: stop and report; nothing was applied either way.**
3. **Apply.** Run the block as written (`BEGIN … COMMIT`). Expected: `Success. No rows
   returned`. An error starting `PHASE 25 aborted, nothing applied` means the self-check
   found a column in the wrong state: report it.
4. **Verify** in the SQL Editor:

   ```sql
   select column_name, grantee from information_schema.column_privileges
   where table_schema='public' and table_name='session_participants'
     and grantee in ('anon','authenticated') and privilege_type='SELECT' order by 1;
   ```

   Expected: exactly `joinedAt`, `sessionId`, `status`, `userId` (all `authenticated`). Then
   Supabase **Advisors → Security**: no new warnings.
5. **Smoke test** (two accounts, an active group session): the waiting room, cup and results
   screens load and update live; the owner can exclude and restore a participant and the
   results page says "Resultados actualizados el …" (Prisma, unaffected).

**Rollback:** the commented block at the end of PHASE 25 (restore the table-level grant saved
from pre-flight (b)). One transaction; the app works under either state.


## §29. Building a new environment from scratch (2026-11, S9-04)

Two things fail on an EMPTY database. Both were found by the runtime DB suite (`npm run test:db`,
`tests/db/README.md`), which builds an empty database on every run. **Production and the existing
shared project are not affected**, and neither file may be edited (an applied migration's checksum
must not change; the SQL file is production history). Do the workarounds below ONLY when you create
a new database (a second Supabase project, a staging copy, a restore into an empty project).

**(a) The migrations do not replay from zero.**
`20260805100000_coffee_visibility_and_sharing` already drops `coffees."isPublic"`, and
`20260805120000_drop_deprecated_is_public` drops it again without `IF EXISTS`, so
`prisma migrate deploy` on an empty database stops at the second one with
`column "isPublic" of relation "coffees" does not exist` (42703). Production is unaffected because
there the column had been re-added out of band (the 2026-08-05 drift incident), and the migration
was applied by hand and recorded with `migrate resolve --applied`.

Workaround on a new database, with `DATABASE_URL`/`DIRECT_URL` pointing at the NEW database only:

1. `npx prisma migrate deploy` (it fails at `20260805120000_drop_deprecated_is_public`; that
   migration is one statement, so nothing is half applied).
2. `npx prisma migrate resolve --applied 20260805120000_drop_deprecated_is_public`
3. `npx prisma migrate deploy` again (applies everything after it).

The test harness does it differently, because its database is thrown away: it runs
`migrate deploy` on a temporary COPY of `prisma/migrations` in which that one statement reads
`DROP COLUMN IF EXISTS "isPublic"` (`tests/db/support/knownSqlFailures.ts`). Do not use the patched
copy for a real environment: the recorded checksum would differ from the repository file.

**(b) One statement of `prisma/sql/rls_and_triggers.sql` fails on a clean database.**
In PHASE 11, `CREATE POLICY "coffees_select" ON coffees FOR SELECT USING ("isPublic" = true OR ...)`
(about line 964) fails with `column "isPublic" does not exist`, because the migrations of (a) have
dropped the column before the file runs. Production is unaffected: the file was applied there
before the column was dropped, and later phases of the file (lines ~1087, ~1237, ~2045) redefine `coffees_select` without it,
so the final policy is the same either way. The Supabase SQL editor runs a pasted script as one
transaction, so the failure would roll back the whole paste.

Workaround: paste the file into the SQL editor with exactly that one statement removed (the
two-line `CREATE POLICY "coffees_select" ON coffees FOR SELECT USING ("isPublic" ...)` in PHASE 11;
the later `DROP POLICY IF EXISTS "coffees_select"` + `CREATE POLICY` pairs stay). The test harness
applies the file statement by statement and tolerates exactly this one failure; it fails the run if
a second statement fails or if this one stops failing.


---

## §30. The cup deduction at any cup count: migration, PHASE 26, deploy (2026-11, S10 WP1a)

**Read this first.** The score that existed before S8 was right in principle and had bugs; this
goes back to it (flagged cups cost points at any cup count, everyone's cups share the
deduction) and fixes three bugs: a cupper under five cups saw no deduction, a group under five
pooled cups had its stored deduction amplified, a defective cup was counted twice in the group.
Spec: `docs/product/cata-descentralizada-puntaje.md`. **Scores stored before this deploy were
computed under older rules and are NOT recomputed, and they are DISPLAYED unchanged (owner's
decision: no past score ever changes).** The data says which rule a stored score used
(`evaluations.cups` NULL = old; `aggregate_scores."ruleVersion"` 1 = old), so there is no backfill. PHASE 23 STEP 2 (§12
steps 4–5) and `scripts/resync-low-cup-history.ts` are CANCELLED and must never run.

**Order, and why.** (1) migration, (2) dry run, (3) PHASE 26, (4) check, (5) merge and deploy.
The new trigger reads `COALESCE(evaluations."cups", cupsPerSample)`, so it computes the right
number under the OLD app code (which does not write `cups` yet) and under the new one. **Do
step 3 and step 5 back to back, at a time when no cupping is live.** Between them the OLD page
still recomputes the old rule in TypeScript while the new trigger stores the new one: a
submission in that window (for example a cupper who flags a cup in a 2-cup sample) is STORED
with the deduction (coffee history, profile, results of that sample after the deploy) while the
old page shows no deduction until the deploy lands. Nothing stored before the window changes.
**What such a submission looks like afterwards (permanent).** An evaluation SUBMITTED between
PHASE 26 and the deploy is written by the old code: it keeps `cups` NULL for good and its
INDIVIDUAL score has no deduction under five cups, while the trigger stores the sample's GROUP
score with the deduction (`ruleVersion = 2`). In that window "my score" and the session score of
a solo session can therefore differ permanently. List those rows afterwards (read-only; use the
time you applied PHASE 26):

```sql
select e.id, ss."sessionId", e."cupperId", e."submittedAt"
from evaluations e join session_samples ss on ss.id = e."sessionSampleId"
where e."isDraft" = false and e.cups is null
  and e."submittedAt" > '2026-11-DD HH:MI+00';  -- the time PHASE 26 was applied
```

The only prevention is to run the two steps back to back with no cupping live. Doing the deploy
BEFORE PHASE 26 is worse: the page would show the new rule while the stored
score still follows the PHASE 23 rule until the next submit, and the old trigger stamps every
new sample `ruleVersion = 1` while its evaluations already carry `cups`.

**Steps** (Supabase SQL editor of the production project; there is only one)

1. **Migration (adds two columns, NO backfill, fires no trigger).** From the checkout you
   choose (`.env.local` IS production) run `npx.cmd prisma migrate deploy`. It applies
   `20261113090000_evaluation_cups`: `ALTER TABLE "evaluations" ADD COLUMN "cups" INTEGER`
   (left NULL on every existing row on purpose: **NULL means "scored before the 2026-11 rule"**
   and the app keeps showing those evaluations under the old rule) and
   `ALTER TABLE "aggregate_scores" ADD COLUMN "ruleVersion" INTEGER NOT NULL DEFAULT 1`
   (existing rows are 1 = old rule). Both are metadata-only statements: no row is rewritten
   and `trg_recompute_aggregate` (`AFTER INSERT OR UPDATE OF "isDraft"`) does not fire.
   Check: `select count(*) from aggregate_scores where "ruleVersion" <> 1;` returns `0`, and
   `select count(*) from evaluations where "cups" is not null;` returns `0`.

   **Before you run it, read-only pre-flight: what exists right now and could be touched by the
   system after the deploy.**

   ```sql
   -- A. closed sessions whose second phase (reveal, history, emails, stamp) never finished
   select id, name, "closedAt" from cupping_sessions
   where status = 'closed' and "closeFinalizedAt" is null order by "closedAt";
   -- B. sessions not closed whose closing day already passed (the daily cron closes them)
   select id, name, "closesAt", status from cupping_sessions
   where status <> 'closed' and "closesAt" < now() order by "closesAt";
   ```

   What the code does with each, after the deploy: for A the next repair (cron pass, owner
   close, a solo owner opening the results) finishes the reveal, the coffee history, the emails
   and the stamp, and re-fires the score of a sample ONLY when that sample has a submitted
   evaluation with `cups` set or a stored aggregate row with `ruleVersion` other than 1; a
   sample made entirely of evaluations stored before the deploy (`cups` NULL) whose aggregate
   is `ruleVersion = 1` keeps its stored score byte for byte, and one with NO aggregate row
   (query C below) stays without one. For B the cron closes them with the
   same rule: a first close of a session whose submitted evaluations all have `cups` NULL leaves
   its aggregates untouched. The data says which rule produced a score, there is no date. Only a
   deliberate owner action (excluding or including a cupper) recomputes a whole sample under the
   current rule.

   ```sql
   -- C. samples with submitted evaluations and NO aggregate row, in a session that is not
   --    closed or whose second phase never finished (expect few or none)
   select ss.id as sample_id, ss."sessionId", cs.status, cs."closeFinalizedAt",
          count(*) filter (where e."isDraft" = false) as submitted
   from session_samples ss
   join cupping_sessions cs on cs.id = ss."sessionId"
   join evaluations e on e."sessionSampleId" = ss.id
   left join aggregate_scores a on a."sessionSampleId" = ss.id
   where a."sessionSampleId" is null
     and (cs.status <> 'closed' or cs."closeFinalizedAt" is null)
   group by ss.id, ss."sessionId", cs.status, cs."closeFinalizedAt"
   having count(*) filter (where e."isDraft" = false) > 0;
   ```

   What the code does with C: nothing. The close routine's pass does not give a first score to a
   sample whose submitted evaluations all have `cups` NULL (it has no new data), so the sample
   keeps having no aggregate row; it is still revealed and its history written like any other. A
   first score appears only when a cupper submits with the new code (`cups` set) or the owner
   excludes or includes someone. What each surface shows for such a sample in the meantime:
   - group results page, and the PDF, close-email attachment and CSV: the TypeScript recompute
     under the OLD rule;
   - solo results: the cupper's own score, with no community block;
   - coffee history: the community score is empty ("—");
   - coffee profile and ficha: that sample is left out of the coffee's average.

   **Run query C BEFORE the deploy and read the list**: every row is a sample that will show
   as above until it gets its first score.

   **Right before the migration, a read-only check that nothing long is running** (the
   migration waits at most 5 s for its locks and then gives up). Expect no rows; if there are
   rows, wait and run it again:

   ```sql
   select pid, now() - xact_start, state from pg_stat_activity
   where xact_start < now() - interval '5 seconds';
   ```

   **If the migration fails on a lock timeout.** The file is ONE transaction
   (`BEGIN; SET LOCAL lock_timeout = '5s'; ALTER …; ALTER …; COMMIT;`; `migrate deploy` sends it
   statement by statement, and only the explicit `BEGIN` makes the timeout apply and the two
   ALTERs succeed or fail together), so it gives up instead of queueing behind a long
   transaction and nothing is applied when it fails. Then `migrate deploy` prints
   `Error: ERROR: current transaction is aborted, commands ignored until end of transaction block`
   (the lock timeout aborts the file's transaction and Prisma's own bookkeeping write then fails
   on the same connection; the real cause, `55P03`, is NOT shown, and the same message appears
   for ANY statement error in this file). Neither column exists afterwards, the migration row is
   left marked failed and a re-run is refused with `P3009`.

   **After ANY failed run, choose the recovery command from the database, not from the
   message.** If the COMMIT succeeded but Prisma's "finished" write failed, both columns exist,
   the next deploy answers `P3009` just like a real failure, and `--rolled-back` plus a deploy
   would fail again. First run this read-only query in the SQL editor:

   ```sql
   select column_name from information_schema.columns where table_schema = 'public' and table_name = 'evaluations' and column_name = 'cups';
   ```

   - A row comes back: run `npx.cmd prisma migrate resolve --applied 20261113090000_evaluation_cups`.
   - No row: run `npx.cmd prisma migrate resolve --rolled-back 20261113090000_evaluation_cups`
     and then `npx.cmd prisma migrate deploy` again (at a quieter moment).
2. **Dry run** (fail-safe: one statement, nothing is applied). Open
   `prisma/sql/dry-runs/phase26_dry_run.sql`, paste the whole file, run it. Expected: a red
   error starting `PHASE 26 DRY RUN: NOTHING WAS APPLIED`. Every numbered line says on the line
   itself whether it is informational or has an expectation:
   - 1 (informational): how many `aggregate_scores` rows a FULL re-fire would change;
   - 2 (informational): the same split by cups per sample (1 cup, 2 cups, 3-4 cups, 5+ cups);
   - 3 (informational): the highest and lowest change of `communityScore`. Increases are
     expected for samples with 5 or more cups and a defective cup, which used to be counted
     twice; decreases are expected for samples under 5 cups with flagged cups, which used to
     have no deduction; large increases can also appear on samples under 5 cups, on rows stored
     by an older version of the function, which amplified deductions under 5 cups. Show the two
     numbers to the owner;
   - 4 (expect 0): rows with submitted evaluations NOT stamped `ruleVersion = 2` by the re-fire
     (proves the new function is the one running);
   - 5 (expect `{search_path=public}`): the function's `proconfig`;
   - 6 (informational): up to ten of the largest individual changes, each as session NAME,
     date and sample label (this is your own SQL editor, so names are shown, not ids).

   Example of a real report (run against a throwaway local database holding two made-up
   sessions, with stored values pinned to arbitrary "old" numbers;
   `tests/db/phase26DryRun.dbtest.ts` produces it):

   ```
   PHASE 26 DRY RUN: NOTHING WAS APPLIED (this error is the expected result). Compare each line with its expectation:
    1 (informational) aggregate rows: 2, of which communityScore would change under a FULL re-fire (production never does one): 2
    2 (informational) by cups per sample, group 1 cup: 1 rows, 1 would change
    2 (informational) by cups per sample, group 2 cups: 1 rows, 1 would change
    3 (informational) change of communityScore under a full re-fire, highest: 5.25, lowest: -2.75. Increases are expected ... ; large increases can also appear on samples under 5 cups, on rows stored by an older version of the function, which amplified deductions under 5 cups
    4 rows with submitted evaluations NOT stamped ruleVersion 2 by the re-fire (expect 0): 0
    5 proconfig of recompute_aggregate_score (expect {search_path=public}): {search_path=public}
    6 (informational) Cata solitaria, 2026-11-01, sample Nariño lote 2 (1 cup per sample): 80.25 -> 85.5
    6 (informational) Cata del viernes, 2026-11-01, sample Huila lote 7 (2 cups per sample): 80.25 -> 77.5
   ```
   **These numbers are what a FULL re-fire of every sample would do, which production never
   does.** The dry run is a functional test of the new function on real data, not a preview of
   what applying PHASE 26 changes: applying it changes NO stored row (step 3). While it runs it
   holds row locks on every submitted evaluation until it rolls back, so run it when no
   cupping is live.
   If it says `evaluations.cups is missing`, redo step 1. Any OTHER error: stop and report;
   nothing was applied either way.
3. **Only on the owner's explicit yes**, run the PHASE 26 block of
   `prisma/sql/rls_and_triggers.sql` (from the `DO $chk$` guard to the closing `$fn$;`). Expected:
   `Success. No rows returned`. It re-issues the function; it does NOT recompute anything.
   **What a later re-fire does (intended):** whenever the trigger recomputes a sample (a new
   submit, an owner exclusion after close, a repair), it uses the current rule and stamps
   `aggregate_scores."ruleVersion" = 2`; from then on the results screen shows that sample under
   the current rule. Samples nobody touches stay `ruleVersion = 1` and keep rendering exactly as
   before. The app reads the version from the data, there is no cut-over date.
   The close routine's own pass (first close, the cron's repair, a solo owner opening the
   results) SKIPS a sample that has no new-rule data: no aggregate row or a `ruleVersion = 1`
   row, and every submitted evaluation with `cups` NULL (code:
   `refireAggregates(..., { mode: "keep-old-rule" })`). It re-fires a sample that has a
   submitted evaluation with `cups` set or a row with `ruleVersion` other than 1. So it never
   writes or rewrites a score for a pre-deploy sample.
   The "Actualizar" button on a CLOSED or expired session does NOT re-fire (it only re-reads
   the page), so a routine click never rewrites a past score.
   **One remaining exception, a decision the ARCHITECT took (the owner must be told):** when a
   guest claim (`mergeGuestData`) removes or replaces a SUBMITTED evaluation of a sample (a conflict
   between the guest's and the account's evaluation of the same sample, or a participant
   exclusion that differs between the two rows and changes who is included), that sample's group
   score is recomputed, and the only function that exists computes the current rule; an old
   sample in that situation moves to the current rule. Only the samples whose included set
   changed are recomputed; every other sample of those sessions is not touched. A conflict that
   only removes a draft (a submitted evaluation always beats a draft, and both drafts change
   nothing the group score counts) recomputes nothing.
4. **Verify (read-only). HARD STOP: this must run and pass BEFORE step 5; do not merge
   otherwise.** If the live function body does not contain `v_factor` and write `"ruleVersion"`
   (it is still the PHASE 23 body), the old trigger stamps every new sample `ruleVersion = 1`
   while its evaluations already carry `cups`, and the screen would show those samples under
   the old rule with no error anywhere:

   ```sql
   select pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure) like '%v_factor%';  -- t
   select pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure) like '%"ruleVersion"%';  -- t
   select proconfig from pg_proc where proname = 'recompute_aggregate_score';  -- {search_path=public}
   select count(*) from aggregate_scores where "computedAt" > now() - interval '10 minutes';  -- 0: nothing recomputed
   select count(*) from aggregate_scores where "ruleVersion" = 2;  -- 0 right after applying
   ```

   The last count may be non-zero only if someone submitted an evaluation in those minutes.
   **A draft that no longer validates.** A draft saved before the deploy is recomputed under
   the current rule when its cupper submits it. If its stored payload no longer passes the
   derivation, it is NOT blocked: it is submitted with `cups` NULL (scored under the old rule,
   like a row submitted before the deploy) and the server logs
   `legacyDrafts.skipped_invalid` once per row with ids only (search the Vercel logs for it).
5. **Merge and deploy** the PR. Smoke test: (a) an OLD closed session with a flagged cup under
   five cups opens with the same numbers as before the deploy (and the breakdown says it was
   scored under the previous rule); (b) a throwaway solo session of 2 cups: mark one cup
   defective and submit; the results page and the coffee history show the base minus 6.
   Note: a tab left open across the deploy shows the reload notice (Next 16 action ids change
   per build); drafts stay on the device.
6. **Rollback.** Code: revert the PR (the `cups` column can stay, it is nullable and unread by
   old code). Database: re-create the PHASE 23 function with the commented block at the end of
   PHASE 26 in `rls_and_triggers.sql` (the previous body, with one change: it writes
   `"ruleVersion" = 1`, because the column survives a rollback). **The app revert must land
   BEFORE or together with the database rollback**, never after: the new app on the old
   function would show new-rule evaluations under whatever the old function stored. Neither
   direction touches stored scores; rows already stamped `ruleVersion = 2` keep that stamp
   until they are re-fired under the rolled-back function.

---

## §31. Movimiento Sensorial: private reflections, the `warmup_reflections` migration and PHASE 27 (2026-11, S10 WP7)

**What it does:** adds ONE new table, `warmup_reflections` (a person's saved answers to the two
closing questions of a warm-up exercise: `id`, `userId` → `profiles` with `ON DELETE RESTRICT`,
`exerciseId`, `feel`, `discovery`, `createdAt`), and PHASE 27 closes it to the API roles. The rows are
**private to the person**: nobody else reads them, not the teacher, the group, an admin, an export,
the analytics area or an AI prompt. The app reads and writes them only with Prisma as `postgres`,
scoped by the signed-in user id. Account deletion erases them; a guest claim moves them.

**Order matters:** migration FIRST, then the deploy; PHASE 27 any time after the migration (before or
after the deploy; until it runs the table is only protected by Supabase's automatic RLS, which already
denies the API roles, and PHASE 27 makes that explicit and adds the revoke).

1. **Migration.** On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx prisma migrate deploy
   ```
   Expected: `1 migration found … 20261113110000_warmup_reflections … applied` (more lines if other
   migrations are pending). Verify in the SQL Editor:
   ```sql
   select column_name from information_schema.columns
   where table_schema='public' and table_name='warmup_reflections' order by 1;
   ```
   Expected: `createdAt, discovery, exerciseId, feel, id, userId`.
2. **PHASE 27 pre-flight** (read-only): run queries (a) to (c) from the PHASE 27 header in
   `prisma/sql/rls_and_triggers.sql`. Save the output of (b).
3. **Dry run** (fail-safe: one statement, nothing is applied, nothing to replace). Open
   `prisma/sql/dry-runs/phase27_dry_run.sql`, paste the whole file, run it. Expected: a red error
   starting `PHASE 27 DRY RUN: NOTHING WAS APPLIED`. Compare each line with its `(expect ...)` text:
   1a `t`; 1b `0`; every 1c line `f`; 2a, 2b and 3 `refused`; 4 a number and no error. **Any `NOT
   REFUSED`, any `FAILED`, or any OTHER error: stop and report; nothing was applied either way.**
4. **Apply** the `PHASE 27` block as written (`BEGIN … COMMIT`). Expected: `Success. No rows
   returned`. An error starting `PHASE 27 aborted, nothing applied` means the self-check found the
   table in the wrong state: report it.
5. **Verify:**
   ```sql
   select relrowsecurity from pg_class where oid = 'public.warmup_reflections'::regclass;  -- t
   select grantee, privilege_type from information_schema.role_table_grants
   where table_schema='public' and table_name='warmup_reflections'
     and grantee in ('anon','authenticated');                                               -- no rows
   ```
   Then Supabase **Advisors → Security**: nothing new.
6. **Deploy** the branch. No environment variable.

**Smoke test (5 minutes, one registered account, no second account needed):**
1. Open a warm-up exercise (`/app/warmup/…`), choose **Completa**, run it to the end (the `›` button
   skips ahead), write something in one or both boxes and press **Guardar**. The done screen says it
   was saved; the exercise page lists it under **Tus reflexiones** with the date and
   "Solo tú puedes verlas."
2. Delete it with the bin button and confirm; it disappears.
3. Choose **Corta · 1–2 min** and run it: it ends on the done screen without the two questions.
4. On the intro screen turn on **Poco espacio**: the figure moves a small amount and the line "Haz el
   mismo movimiento, más pequeño." shows; on the first exercise **Sentado** also appears.
5. On **Catar ahora** press **Calentar 1–2 min antes**, finish or close it: the form still has the
   name, format and sample count you typed.
6. In a session that has a warm-up, after the cupping started (or after you skipped the warm-up), the
   cup page's left column shows **Movimiento Sensorial · N min**; it opens the player and closing it
   changes nothing.

**Rollback:** roll the code back first (the exercise page lists the reflections and would fail
without the table); the table itself can stay. Do not drop it: that erases people's notes. PHASE 27's
rollback is the commented block at its end (leaving RLS on is the safe state).

---

## §32. Database — apply the `sample_prep_and_reference_mode` migration (2026-11, S10 WP2)

**What it does:** adds five columns, all additive, no trigger, no function, no policy, no index,
no foreign key:

- `session_samples."roastDate"` (DATE, nullable), `"preparationNote"` (TEXT, nullable),
  `"offProtocol"` (BOOLEAN NOT NULL DEFAULT false), `"offProtocolNote"` (TEXT, nullable): the
  owner's optional per-sample prep data (Kim A9).
- `cupping_sessions."referenceMode"` (TEXT NOT NULL DEFAULT `'anchor'`): how the session's
  reference behaves (`anchor` = pinned at 79.00 as before, `free` = scored like any sample).
  Every existing session is `anchor`, so nothing changes for them.

The two NOT NULL defaults are constants, so Postgres adds them without rewriting either table.

**Order matters:** run it BEFORE the deploy. The regenerated Prisma client selects these columns
on the cup, results, print and PDF pages immediately; without them those pages fail.

1. On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx prisma migrate deploy
   ```
   Expected: `… 20261113100000_sample_prep_and_reference_mode … applied`. This migration's name
   sorts after `20261113090000_evaluation_cups` (PR #117); `migrate deploy` applies pending
   migrations in name order whichever PR merges first, and neither depends on the other (so
   the output may list one or two migrations).
2. **Verify** — Supabase SQL Editor:
   ```sql
   SELECT table_name, column_name, data_type, column_default
   FROM information_schema.columns
   WHERE (table_name = 'session_samples'
          AND column_name IN ('roastDate','preparationNote','offProtocol','offProtocolNote'))
      OR (table_name = 'cupping_sessions' AND column_name = 'referenceMode')
   ORDER BY table_name, column_name;
   ```
   Expected: five rows; `referenceMode` default `'anchor'::text`, `offProtocol` default `false`.
3. **Blind-data check (read-only).** The four `session_samples` columns can identify a coffee, so
   they are deliberately NOT in the PHASE 21 column grant and no SQL phase is needed. Confirm the
   browser key cannot read them:
   ```sql
   SELECT column_name, has_column_privilege('authenticated', 'public.session_samples', column_name, 'SELECT') AS readable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'session_samples'
   ORDER BY column_name;
   ```
   Expected: `readable = false` for `roastDate`, `preparationNote`, `offProtocol`, `offProtocolNote`
   (and `coffeeId`); `true` only for `id, sessionId, position, label, revealed, referenceRank, createdAt`.
4. Deploy the branch. No new environment variable.

**Smoke test (5 minutes, throwaway session):** create a group session with three coffees, tick a
reference and pick "Referencia libre"; the three samples get letters in a random order each time you
repeat it, and "Clave de muestras" (collapsed) on step 2 and on the cup page lists letter -> coffee;
cup the reference as another cupper and check its bubbles are NOT locked and its score is not
79.00; open the owner's sample editor, fill "Más datos de la muestra", and check a participant's
`/print` shows none of it until the owner reveals the sample.

**Rollback:** the columns are additive; code rolled back ignores them. Do not drop them while the
new code is deployed. Sessions already created as `free` would be pinned again by older code on the
next save of their reference, so do not roll back the code while a `free` session is mid-cupping.


---

## §33. Close rules: apply PHASE 28, read the idle count, check the idle cron pass (2026-11, S10 WP4a)

**What changes for people** (all three marked `TODO(kim-validar:C3|C5|C9)`: the answers behind
them are simulated, Kim has not confirmed them):

- **Group results only at close (Kim C5).** A participant no longer sees the group's numbers when
  everyone has submitted; only once the session is closed or its closing date has passed. The
  organizer sees them at any time. A participant's own results are unchanged; solo sessions are
  unchanged. The page and the PDF route use `canViewGroupResults`; the database twin is PHASE 28.
- **No re-dating after the deadline (Kim C9).** Once the closing date has passed, the edit page is
  read-only (the date included) and `updateSession` refuses any change with `session_closed`.
- **Live sessions (Kim C3).** The owner reminder for a forgotten live session now goes out after
  24 h without evaluations (was 12 h), and the nightly cron closes the session after **7 days**
  without evaluations ("activity" means an evaluation being saved, nothing else; new pass, close
  reason `idle`). **The backlog rule (review H2):** idle 7 days up to under 30 days = the designed
  flow, the close emails go out; idle **30 days or more** = closed **silently** (no email, still
  finalized; the owner can use "Reenviar"). **Sessions that started before the rule (owner decision):**
  a session STARTED before **2026-11-18 00:00 UTC** (`IDLE_RULE_EFFECTIVE_AT`) is grandfathered: it is
  never closed with emails, only closed silently if it reaches **30 idle days**, and it gets no new
  24 h reminder (its organiser may already have had the old one, "No la cerramos por ti", and must
  not be promised a 7-day close). Sessions started on or after that day follow the designed rule.
  If a finalize step of such a close failed, the
  next day's repair pass is silent too (`repairEmailMode`: live group session, idle 30 days or more
  at the close, no close-email ledger row), so the backlog is not mailed by the repair either.
  **Known and accepted:** an owner who closes by hand a live session idle 30+ days, and whose
  finalize fails before the email step, is repaired without emails; their results page says "Esta
  cata se cerró sola por inactividad y no se enviaron correos. Puedes enviarlos con «Reenviar»." and **Reenviar** sends them. A session whose creator deleted their account is also repaired without
  emails (account deletion closes without them). So the first production run never mails
  people about sessions abandoned months ago, and, because the job is daily, after its first week
  only that backlog can cross 30 days.
- **"Cerrar ahora" (review M2).** If the nightly job fails, the owner of a group session whose
  closing date has passed but that is not closed sees, on the results page, "La fecha de cierre ya
  pasó. La cata se cerrará sola en las próximas horas; puedes cerrarla ahora para enviar los resultados." and a
  **Cerrar ahora** button (same confirmation and the same close routine as the cup panel).
- **Cron order (review M1).** Deadline closes, repairs, reminders, then the idle pass (5 per run,
  oldest first), then the ledger purge (always last). No new close or repair is started after
  ~150 s of the 300 s budget. The idle pass walks up to 25 oldest candidates until 5 closes
  succeeded; a candidate that throws is logged and skipped.

No Prisma migration, no new environment variable, no new cron entry.

### Order

1. **Before the deploy: read the idle counts** (step 2, lines 2a, 2b and 2c). The idle pass closes at
   most **5 sessions per run**, oldest first. **2a** = sessions STARTED on or after 2026-11-18, idle 7
   to under 30 days: closed WITH the close emails, to everyone in them (the line says how many have an
   email). Before the 25th of November 2a is normally 0 (nothing started on or after the 18th can be
   idle 7 days yet). **2b** = every live session idle 30 days or more: closed silently, grandfathered
   or not. **2c** = sessions started BEFORE the rule, idle 7 to under 30 days: left alone; they close
   silently only if they reach 30 idle days (the line gives the date). If 2a is large or surprising,
   tell Ricardo before deploying: at 5 per run it takes N/5 days to drain.
2. **Dry run** (fail-safe: one statement, nothing is applied, NO placeholders). Open
   `prisma/sql/dry-runs/phase28_dry_run.sql`, paste the whole file into the Supabase **SQL editor of
   the production project** and run it. Expected: a red error starting `PHASE 28 DRY RUN: NOTHING
   WAS APPLIED`. Compare each line with its `(expect ...)` text:
   - line 1: how many open group sessions have every participant submitted today, i.e. whose
     participants lose group visibility when PHASE 28 is applied (read it; 0 is fine). It lists up
     to 10 of them by name, date, participants and how many submitted (no ids);
   - line 2a: **sessions started on or after 2026-11-18, idle 7 to under 30 days** and **how many
     participants with an email** would get a close email (the numbers to read in step 1), with up to
     10 by name, last activity and participants. Idle = now minus the later of the start and the last
     saved evaluation, 7 days or more, the same boundary as the code. The top of the DO block holds
     the effective date as one literal (the same instant as `IDLE_RULE_EFFECTIVE_AT`);
   - line 2b: **every live session idle 30 days or more**, which the pass closes silently, listed the
     same way;
   - line 2c: **sessions started before the rule, idle 7 to under 30 days**: "left alone: started
     before the rule; they close silently only if they reach 30 idle days", with name, last activity
     and the date they would reach 30 days (an evaluation saved before then restarts their idle clock);
   - line 3 measures the function installed NOW: before PHASE 28 it equals line 1 (it is the old
     function); once PHASE 28 is applied it reads `0` (run the dry run again afterwards and this is
     the expected value);
   - line 4 is `0`, 5a, 5b and 6 are `0`, 7a `f f`, 7b `t`, 7c `search_path=public`, 7d `t f`.
     (The PHASE 28 block itself also checks the `search_path` setting and aborts if it is lost.)
   **Any other error: stop and report it; nothing was applied either way.**
3. **Deploy**, then **apply PHASE 28** right after. Deploy and SQL may go in either order, because
   both only narrow visibility; applying the SQL right after the deploy keeps the page and the API
   saying the same thing. Run the PHASE 28 block as written (`BEGIN ... COMMIT`) in the SQL editor.
   Expected: `Success. No rows returned`. An error starting `PHASE 28 aborted, nothing applied` means
   the self-check found the function in the wrong state: report it.
4. **Verify:**

   ```sql
   select pg_get_functiondef('public.can_view_group_results(text)'::regprocedure);
   ```

   Expected: no `isDraft` and no `cupperId` in the body. Then Supabase **Advisors → Security**: no
   new warnings.
5. **Smoke test** (two accounts, an open group session where both have submitted): the participant
   sees their own results but the group part says "Los resultados del grupo aparecerán cuando se
   cierre la cata."; the participant's cup screen shows no "x de y enviados" line (the owner's does);
   the owner sees everything; after the owner closes the session the
   participant sees the group results (and the open results screen offers the refresh badge).
6. **Check the idle cron pass** after the first cron run, or by hand (replace the two values):

   ```bash
   curl -s -H "Authorization: Bearer <CRON_SECRET>" https://<your-production-domain>/api/cron/close-expired-sessions
   ```

   The JSON now has `idleClosed` (sessions closed by the idle pass in this run),
   `idleClosedSilently` (of those, the ones idle 30 days or more, closed without email; a grandfathered session only ever appears here),
   `idleExamined` and `idleFailed` (candidates walked, and those whose close threw),
   `repairBudgetTruncated` (the 150 s budget stopped the repairs),
   `idleTruncated` (`true` means the batch of 5 was full and more are waiting for the next run),
   `idleBudgetTruncated` (`true` means the 150 s start budget ran out first), `budgetTruncated`
   (the same for the deadline closes; `truncated` is true for either) and `idleResults` (id,
   `closed`, `emailsQueued`, `silent` when closed silently, and `error` when one failed; a failure
   on one session never stops the others). `idleClosed` should match what you read in step 2
   (2a plus 2b; 2c are left alone), up to the batch of 5 per run. In Vercel
   logs, `cron.closeIdle` (error level) names a session whose close failed. A session closed this way
   shows the neutral results notice ("La cata se cerró.") and the usual close email; it never says
   the organizer closed it.

**Rollback:** the deploy can be reverted freely (no schema change). PHASE 28 has a commented
rollback at its end (the PHASE 21 body of `can_view_group_results`). Run it in one transaction; the
app works under either state.


---

## §34. Database — apply the `close_notice_and_late_contributions` migration (2026-11, S10 WP4b)

**What it does:** four NULLABLE columns, no default, no backfill, no index, no trigger, no policy:

- `cupping_sessions."closingAt"` (TIMESTAMPTZ): the close the owner announced a few minutes ahead.
- `evaluations."acceptedLateAt"` (TIMESTAMPTZ): when the owner accepted a complete draft after the close.
- `evaluations."postCloseNote"` (TEXT) and `"postCloseNoteAt"` (TIMESTAMPTZ): a cupper's text note
  on their own submitted evaluation after the close.

**No SQL phase.** `cupping_sessions` and `evaluations` are granted table-wide to the browser key
(only `session_samples` and `session_participants` are column-level), so the realtime banner
and the owner's reads need nothing more. Participants still read only their own `evaluations`
rows (PHASE 21), so another cupper's note never reaches the browser key.

**Order matters:** run it BEFORE the merge and the deploy. The regenerated Prisma client selects the
columns on the cup and results pages at once; without them those pages fail. Code that predates
the migration ignores the columns, so applying it early is safe.

1. On your machine, with `.env.local` pointing at the project (it is production):
   ```bash
   npx.cmd prisma migrate deploy
   ```
   Expected: `… 20261115100000_close_notice_and_late_contributions … applied` (the output may list
   other pending migrations before it, in name order).
2. **Verify** — Supabase SQL Editor:
   ```sql
   SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE (table_name = 'cupping_sessions' AND column_name = 'closingAt')
      OR (table_name = 'evaluations' AND column_name IN ('acceptedLateAt','postCloseNote','postCloseNoteAt'))
   ORDER BY table_name, column_name;
   ```
   Expected: four rows, all `is_nullable = YES`.
3. Deploy the branch. No new environment variable.

**Limit to know:** the announced close is NOT enforced by the server and no cron acts on it. The
owner's open cup page calls "Cerrar" when the countdown reaches zero; if that page is not open
then, nothing closes and the owner sees "El cierre anunciado ya pasó" with "Cerrar ahora" /
"Cancelar" on return. The cron deadline close and the idle close are unchanged.

**Smoke test (two accounts, a live group session with a complete unsent draft):** the owner opens
"Cerrar sesión" and picks "Avisar y cerrar en 2 min"; the other cupper's cup page shows "El
organizador cerrará la cata en 2 min. Envía tus evaluaciones." (no sound, input never blocked);
"Cancelar" removes it; at zero the owner's page closes. On the owner's results page "Evaluaciones
recibidas tarde" lists the complete draft; "Aceptar" asks to confirm, then the cupper's own results
page says "Tu evaluación de … se incluyó el …" and "Resultados actualizados el …" shows on the
owner's page. A cupper adds "una nota después del cierre" on their sample drill-down; the owner
reads it under "Notas añadidas después del cierre"; nobody else sees it.

**Rollback:** the columns are additive; code rolled back ignores them. Do not drop them while the
new code is deployed.
