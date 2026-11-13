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
   - `ANALYTICS_SUPER_ADMIN_EMAIL`: recommended, set it to the super-admin address (§17; not
     boot-fatal, the code falls back to a built-in address and logs a warning).
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
should be super-admin. It is NOT boot-fatal: until it is set, the code falls back to the
built-in address and the boot logs one `env` warning. After this PR only the super-admin
sees platform-wide insights, the platform report PDF, the digest and the email CSV export;
AI admins and flagged users see their own data.

**3. Legal pages (owner).** `/privacidad` and `/terminos` already render draft text with a
"Borrador" banner and `noindex`, but nothing links to them. To publish: paste the final
text (es, en) into `lib/legal/privacy.ts` and `lib/legal/terms.ts`, bump
`CONSENT_NOTICE_VERSION` in `lib/legal/config.ts`, flip `LEGAL_PAGES_PUBLISHED` to `true`
and deploy. That turns on the footer links, the login-page links and the notice line under
both waitlist forms.

**4. Retention (decision, no job).** Proposal: keep a waitlist email at most 12 months when
no account exists for it (`WAITLIST_RETENTION_MONTHS`). Nothing deletes rows automatically;
until a job exists, delete old rows by hand when asked. Account deletion should remove the
row too (TODO in S8-07).

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
The new trigger reads `COALESCE(evaluations."cups", cupsPerSample)`, so it is correct under the
OLD app code (which does not write `cups` yet) and under the new one: the stored value is right
first, and the page, which recomputes the same rule in TypeScript, never disagrees with it in
between. Doing the deploy before PHASE 26 would show the new rule on the page while the stored
score (coffee history, profile) still follows the PHASE 23 rule until the next submit.

**Steps** (Supabase SQL editor of the production project; there is only one)

1. **Migration (adds two columns, NO backfill, fires no trigger).** From the checkout you
   choose (`.env.local` IS production) run `npx prisma migrate deploy`. It applies
   `20261113090000_evaluation_cups`: `ALTER TABLE "evaluations" ADD COLUMN "cups" INTEGER`
   (left NULL on every existing row on purpose: **NULL means "scored before the 2026-11 rule"**
   and the app keeps showing those evaluations under the old rule) and
   `ALTER TABLE "aggregate_scores" ADD COLUMN "ruleVersion" INTEGER NOT NULL DEFAULT 1`
   (existing rows are 1 = old rule). Both are metadata-only statements: no row is rewritten
   and `trg_recompute_aggregate` (`AFTER INSERT OR UPDATE OF "isDraft"`) does not fire.
   Check: `select count(*) from aggregate_scores where "ruleVersion" <> 1;` returns `0`, and
   `select count(*) from evaluations where "cups" is not null;` returns `0`.
2. **Dry run** (fail-safe: one statement, nothing is applied). Open
   `prisma/sql/dry-runs/phase26_dry_run.sql`, paste the whole file, run it. Expected: a red
   error starting `PHASE 26 DRY RUN: NOTHING WAS APPLIED`. Read each numbered line:
   - 1: how many `aggregate_scores` rows would change;
   - 2: the same split by cups per sample (1 cup, 2 cups, 3-4 cups, 5+ cups);
   - 3: the largest increase and decrease of `communityScore` (show them to the owner);
   - 4: rows charging more than 6 points per flagged cup: must be `0`;
   - 5: `proconfig` must be `{search_path=public}`.
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
4. **Verify (read-only):**

   ```sql
   select pg_get_functiondef('public.recompute_aggregate_score()'::regprocedure) like '%v_factor%';  -- t
   select proconfig from pg_proc where proname = 'recompute_aggregate_score';  -- {search_path=public}
   select count(*) from aggregate_scores where "computedAt" > now() - interval '10 minutes';  -- 0: nothing recomputed
   select count(*) from aggregate_scores where "ruleVersion" = 2;  -- 0 right after applying
   ```

   The last count may be non-zero only if someone submitted an evaluation in those minutes.
5. **Merge and deploy** the PR. Smoke test: (a) an OLD closed session with a flagged cup under
   five cups opens with the same numbers as before the deploy (and the breakdown says it was
   scored under the previous rule); (b) a throwaway solo session of 2 cups: mark one cup
   defective and submit; the results page and the coffee history show the base minus 6.
   Note: a tab left open across the deploy shows the reload notice (Next 16 action ids change
   per build); drafts stay on the device.
6. **Rollback.** Code: revert the PR (the `cups` column can stay, it is nullable and unread by
   old code). Database: re-create the PHASE 23 function with the commented block at the end of
   PHASE 26 in `rls_and_triggers.sql` (it is the exact previous body). Neither direction
   touches stored scores.
