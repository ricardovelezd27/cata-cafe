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
   | `CLOSE_EMAIL_ATTACH_CVA` | *(optional)* `1` | Legacy: also attach each participant's CVA form PDF to the close email. Default (unset) = link to results + personal summary PDF only. |
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

1. Preview: `npx prisma migrate status` — expected: exactly one pending migration,
   `20261110120000_outbound_email_ledger` (plus any S8-01 / S8-02 migrations if those are
   not applied yet). Anything else or drift: stop and paste the output.
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

**When:** any time after the deploy; the new app is correct without it for what users SEE
(group results already ignored deductions under 5 cups), but the STORED score used by the
coffee history and profile only changes once this is applied. No Prisma migration. Apply in the
Supabase **SQL editor of the production project** (there is only one).

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
   expected result. Line 3 must say `0` (no row with 5 or more cups changes). Line 2 is how many
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
   database; there is only one): `npx prisma migrate deploy`. It must report exactly one
   migration applied, `20261111090000_close_lifecycle`.
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
