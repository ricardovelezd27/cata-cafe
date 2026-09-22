# S2 — Staging vs producción, proceso de migraciones, CI, dominio/HTTPS, smoke test

> **Cuándo:** después de que la muestra de referencia esté desplegada en producción.
> **Dónde:** sesión nueva de Claude Code, rama nueva desde `main` (p. ej. `claude/staging-environment`).
> **Requiere de Ricardo:** pasos manuales en Supabase y Vercel (§ "Pasos manuales"). El agente los deja escritos y se detiene; nunca los intenta por su cuenta.
> **Decisiones ya tomadas (no volver a preguntar):** staging = **segundo proyecto Supabase** (free tier, misma región eu-central-1) + **el mismo proyecto Vercel** usando el entorno *Preview* con variables asignadas a la rama `staging`; el desarrollo local apunta a staging a partir de ahora; producción sigue en `main`.

---

## 1. Prompt (copiar y pegar tal cual)

```
Context: Café Sensible (Next.js 16.2.4 App Router, Prisma 7 with the generated client at app/generated/prisma/client, Supabase auth + realtime + Postgres with RLS, Vercel, next-intl es/en). Read CLAUDE.md first and then docs/prompts/S2-staging-production.md §2–§7 — that file IS the implementation plan; follow it phase by phase and keep its checklists updated as you go.

Production today: one Vercel project deploying `main` to https://cata-cafe-opal.vercel.app, one Supabase project (docs/LAUNCH-RUNBOOK.md names it, ref dpkgcgdywjfmffqnkqsk, eu-central-1) that is ALSO the local dev database. Launch remediation shipped 2026-09-14 (docs/LAUNCH-REPORT-2026-09-14.md, docs/HANDOVER.md). The product meeting of 2026-09 requires develop → test → validate → publish with separate testing and production databases.

Facts already established by the 2026-09-22 audit (verify quickly, do not re-audit):
- No staging concept in code: zero hits for VERCEL_ENV / APP_ENV. Only NODE_ENV binary checks exist (lib/env.ts:33 throw-vs-warn; lib/prisma.ts globalThis cache; app/actions/dev.ts; app/api/dev/sign-in/route.ts; app/[locale]/dev/page.tsx; components/dev/DevRoleBadge.tsx; components/pwa/ServiceWorkerRegister.tsx:20; components/landing/journey/*). Vercel Preview builds run with NODE_ENV=production.
- No CI at all (.github/ has only copilot-instructions.md). vitest has 9 pure-lib test files (tests/**), no `typecheck` npm script.
- No .env.example (.gitignore ignores `.env*`). Canonical variable list: CLAUDE.md "Environment Variables" + README.md "Environment Variables". lib/env.ts REQUIRED_IN_PRODUCTION has 8 names; DIRECT_URL is migrate-only; optional GEMINI_*, ANALYTICS_*, EMAIL_FROM, DB_POOL_MAX.
- prisma.config.ts hard-codes dotenv `.env.local` then `.env`; the 6 DB scripts under scripts/ do the same. Nothing prints which database a command is about to touch.
- vercel.json declares two crons unconditionally; app/api/cron/*/route.ts only check CRON_SECRET.
- lib/email.ts sends whenever RESEND_API_KEY is set and that key is REQUIRED in prod. lib/guestClaim.ts falls back to the service-role key when GUEST_CLAIM_SECRET is unset.
- app/robots.ts and app/sitemap.ts build from NEXT_PUBLIC_SITE_URL with no noindex gate; next.config.ts sends HSTS `max-age=63072000; includeSubDomains` unconditionally; no CSP.
- app/api/health returns 204 with no body BY DESIGN (offline probe) — never reuse it as an environment check.
- A fresh Supabase project needs manual SQL: prisma/sql/rls_and_triggers.sql PHASE 2 … 18b (two overlapping numbering series; PHASE 15 is comment-only; 18 must be followed by 18b; runbook §1 step 7 notes a REVOKE on rls_auto_enable() that errors on a fresh project) + prisma/sql/phase1_indexes.sql + Realtime publication for evaluations AND cupping_sessions (Phase 7) + evaluations REPLICA IDENTITY FULL + anonymous sign-ins (apply PHASE 14 first) + auth redirect URLs. Prisma: 26 migrations (two share timestamp 20260721000000 — deterministic by name), migration_lock.toml present, known checksum drift on prod's _prisma_migrations (runbook §2 warns).
- README.md "Prisma migrations" recommends `migrate dev`; runbook §2 uses `migrate deploy`. docs/HANDOVER.md still says catasensible.ai in one place (correct: cafesensible.ai). Runbook §4 log drain and §5 authenticated smoke test are still owed; §6 domain cutover lacks DNS/SSL detail.

Decisions already made: staging = second Supabase project + the same Vercel project's Preview environment with env vars scoped to branch `staging`; local dev points at staging; production stays on `main`. Do not propose Supabase Branching or a second Vercel project.

Work through the plan's phases in order (P0 code → P1 scripts/CI → P2 bootstrap SQL → P3 docs → P4 handover). Orchestration: you (Fable) design lib/appEnv.ts, the env/cron/email gates, the bootstrap SQL and the CI workflow, and review everything; delegate to Sonnet with explicit file ownership: EnvBanner + i18n, .env.example, the scripts/_env.ts adoption across scripts, README/ENVIRONMENTS docs. Forbid bare `git stash` in every subagent prompt. Do not fix the pre-existing lint baseline in passing unless Phase P1's CI decision requires it. Never print secret values. When you reach a step that needs a dashboard click or a credential, write it into docs/ENVIRONMENTS.md as a checklist item and STOP for Ricardo.
```

---

## 2. Objetivo y resultado esperado

Al terminar:

1. Existe un entorno **staging** completo (DB, auth, realtime, crons inertes, banner, sin indexación) accesible en una URL de Vercel Preview estable para la rama `staging`.
2. Un cambio viaja **dev → staging → producción** con un procedimiento escrito, con guardas automáticas contra escribir en producción por error.
3. Hay **CI** en cada PR: typecheck, lint, tests y comprobación de que el esquema y las migraciones coinciden.
4. Existe un **bootstrap reproducible** para levantar un proyecto Supabase nuevo desde cero (migraciones + SQL manual + configuración), verificado por un script de solo lectura.
5. El **smoke test §5** del runbook se ha ejecutado por primera vez de principio a fin (en staging).
6. El **dominio cafesensible.ai** está publicado con HTTPS, y todo lo que dependía de la URL antigua sigue funcionando.

## 3. Fases e implementación

### Fase P0 — Discriminador de entorno y comportamiento de staging (código, Fable)

| Paso | Archivo | Qué hacer | Criterio de aceptación |
|---|---|---|---|
| P0.1 | `lib/appEnv.ts` (nuevo) | `export type AppEnv = "production" \| "staging" \| "development"`; `getAppEnv(env = process.env)`: `NEXT_PUBLIC_APP_ENV` si es uno de los tres → si `VERCEL_ENV === "preview"` → `"staging"` → si `NODE_ENV === "production"` → `"production"` → `"development"`. Pura, sin imports. `isProduction()`, `isStaging()` helpers. | `tests/appEnv.test.ts` cubre las 6 combinaciones (override explícito, preview sin override, prod sin nada, dev local, valor inválido en NEXT_PUBLIC_APP_ENV → ignorado). |
| P0.2 | `lib/env.ts` | `REQUIRED_IN_PRODUCTION` se mantiene; nueva lista `OPTIONAL_ON_STAGING = ["RESEND_API_KEY"]`. `missingProductionEnv(env, appEnv)` excluye las opcionales cuando `appEnv === "staging"`. `assertProductionEnv` lanza cuando `NODE_ENV === "production"` (staging también falla si falta algo obligatorio: es lo que queremos). | Test existente en `tests/actionsAndState.test.ts` sigue verde; nuevo caso: staging sin RESEND no falla, staging sin DATABASE_URL sí. |
| P0.3 | `lib/email.ts` | Si `!RESEND_API_KEY`: ya es no-op; añadir `logInfo({ where: "email.skipped", reason: "no_api_key", appEnv })` una vez por proceso para que staging deje rastro. Si `isStaging()` y hay clave: prefijar el asunto con `[STAGING] ` para que un correo escapado se reconozca. | Unit test del prefijo si la función de asunto es pura; si no, revisión manual. |
| P0.4 | `app/api/cron/close-expired-sessions/route.ts`, `app/api/cron/insights-digest/route.ts` | Antes de la comprobación del bearer: `if (!isProduction()) return NextResponse.json({ skipped: "non-production" }, { status: 200 })`. Mantener el 503/401 existentes en producción. | `curl` al cron en staging devuelve 200 `{skipped}` sin bearer; en prod sigue 401 sin bearer. |
| P0.5 | `components/layout/EnvBanner.tsx` (nuevo, server component) + montaje en `app/[locale]/layout.tsx` | Banda superior ámbar (tokens MD3: `bg-tertiary-container text-on-tertiary-container` o `secondary-fixed`), texto `env.stagingBanner` en es/en: "ENTORNO DE PRUEBAS — los datos aquí no son reales" / "TEST ENVIRONMENT — data here is not real". Solo cuando `isStaging()`. `role="status"`. No desplaza el header fijo del app shell: revisar `components/layout/*` y `SessionShell` para que el offset se aplique (probar en `/app`, `/cup`, landing). | Captura en `/`, `/app`, `/app/sessions/[id]/cup` a 375px y desktop sin solapamientos. |
| P0.6 | `app/robots.ts`, `app/sitemap.ts`, `next.config.ts` | robots: `disallow: "/"` y sin sitemap cuando `!isProduction()`. sitemap: array vacío cuando `!isProduction()`. Cabecera `X-Robots-Tag: noindex, nofollow` añadida en `headers()` cuando `process.env.VERCEL_ENV !== "production"` (en next.config no hay `getAppEnv` compilado; usar la variable directamente y documentarlo). | `curl -I` en staging muestra `x-robots-tag`; en prod no. |
| P0.7 | `app/api/dev/sign-in/route.ts`, `app/actions/dev.ts`, `app/[locale]/dev/page.tsx`, `components/dev/DevRoleBadge.tsx` | Cambiar la puerta `NODE_ENV !== "development"` por `isProduction()` (es decir, permitido en dev y staging). Mantener la allowlist de emails de prueba y la contraseña fija. **Riesgo asumido y documentado:** en staging existe un login por contraseña para 3 cuentas de prueba; staging no contiene datos reales. | En staging `GET /api/dev/sign-in?email=master@cata.test` inicia sesión; en prod devuelve 404. |
| P0.8 | `components/pwa/ServiceWorkerRegister.tsx` | Mantener el registro en staging (así el smoke test §5 paso offline es realista) pero usar `isProduction() \|\| isStaging()`; dejar comentario. | Sin cambio funcional en prod. |
| P0.9 | `lib/guestClaim.ts` | Eliminar el fallback al service-role key cuando `isProduction() \|\| isStaging()` (ya es obligatorio en prod por env.ts; en staging exigirlo también via `OPTIONAL_ON_STAGING` NO incluyéndolo). | Test: sin GUEST_CLAIM_SECRET en staging → boot falla con mensaje claro. |

### Fase P1 — Seguridad de scripts, migraciones y CI (Fable diseña; Sonnet aplica a los scripts)

| Paso | Archivo | Qué hacer | Criterio |
|---|---|---|---|
| P1.1 | `.env.example` (nuevo) + `.gitignore` (`!.env.example`) | Todas las variables de CLAUDE.md con comentario de una línea, agrupadas: obligatorias en prod, solo migraciones, opcionales, staging-only (`NEXT_PUBLIC_APP_ENV`). Sin valores. | Diff de nombres contra `lib/env.ts` en un test: `tests/envExample.test.ts` lee el archivo y comprueba que contiene cada nombre de `REQUIRED_IN_PRODUCTION`. |
| P1.2 | `scripts/_env.ts` (nuevo) | `loadScriptEnv()`: carga `process.env.ENV_FILE ?? ".env.local"` con dotenv; extrae el host de `DATABASE_URL`; imprime `→ database host: <host> (ENV_FILE=…)`; si el host coincide con el patrón de producción (leer de `PROD_DB_HOST_PATTERN` en el propio `.env.local`, p. ej. el ref del proyecto prod) y `CONFIRM_PROD !== "yes"`, aborta con código 2 y mensaje. Devuelve `{ host, isProd }`. | Test puro de la función de decisión (`decideScriptTarget(url, pattern, confirm)`) en `tests/scriptEnv.test.ts`. |
| P1.3 | `scripts/backfill-coffee-codes.ts`, `backfill-solo-history.ts`, `import-benchmark-lots.ts`, `import-reference-series.ts`, `report-normalization.ts`, `seed-test-users.ts` | Sustituir `config({ path: ".env.local" })` por `loadScriptEnv()` como primera línea. `seed-test-users.ts` además rechaza producción SIEMPRE (sin override). | Ejecutar cada script con `ENV_FILE=.env.staging` en seco donde aplique. |
| P1.4 | `prisma.config.ts` | `config({ path: process.env.ENV_FILE ?? ".env.local" })` antes del `.env`; comentario explicando `ENV_FILE`. | `ENV_FILE=.env.staging npx prisma migrate status` apunta a staging. |
| P1.5 | `package.json` scripts | `"typecheck": "tsc --noEmit"`, `"db:migrate:staging": "cross-env ENV_FILE=.env.staging prisma migrate deploy"` (añadir `cross-env` como devDependency para Windows), `"db:migrate:prod": "tsx scripts/migrate-prod.ts"` (wrapper que usa `loadScriptEnv()` con `.env.production.local`, exige `CONFIRM_PROD=yes`, imprime `migrate status` y pide que el output no muestre drift antes de ejecutar `migrate deploy`), `"env:verify": "tsx scripts/verify-env.ts"`. | Prueba de guarda: `npm run db:migrate:prod` sin `CONFIRM_PROD` → aborta e imprime el host. |
| P1.6 | `.github/workflows/ci.yml` (nuevo) | Disparadores: `pull_request` y `push` a `main`/`staging`. Jobs: `npm ci` → `npx prisma generate` → `npm run typecheck` → `npm run lint` → `npm test` → comprobación de migraciones con un servicio Postgres 16 (`services: postgres`): `npx prisma migrate deploy` contra la DB vacía del contenedor y después `npx prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --exit-code` (prueba que la historia se reproduce desde cero Y que el esquema coincide). Variables ficticias para `NEXT_PUBLIC_SUPABASE_*` (solo se necesitan en build; no hacemos `next build` en CI por tiempo — documentar; opcional job nocturno con build). **Decisión de lint:** `npm run lint` hoy tiene 4 errores heredados → o bien se arregla primero (recomendado, ver S4 ítem 5) o el job de lint se marca `continue-on-error: true` con un TODO fechado. Preguntar a Ricardo cuál. | Workflow verde en el PR de esta rama. |
| P1.7 | `scripts/verify-env.ts` (nuevo, solo lectura) | Con `loadScriptEnv()`; comprueba y lista: RLS habilitado en todas las tablas `public`; `has_function_privilege('authenticated', 'public.is_session_participant(text)', 'EXECUTE')` y el resto de funciones referenciadas por políticas; `supabase_realtime` contiene `evaluations` y `cupping_sessions`; `evaluations` tiene `REPLICA IDENTITY FULL`; `_prisma_migrations` sin filas fallidas y última = la del repo; número de filas en `profiles`, `cupping_sessions` (para distinguir staging de prod a simple vista). Sale con código 1 si algo falla. | Pasa en staging tras el bootstrap; pasa en prod (solo lectura). |

### Fase P2 — Bootstrap reproducible de un proyecto Supabase (Fable)

| Paso | Archivo | Qué hacer | Criterio |
|---|---|---|---|
| P2.1 | `prisma/sql/bootstrap_fresh_project.sql` (nuevo) | Efecto neto de PHASE 1…18b + `phase1_indexes.sql`, idempotente: `CREATE OR REPLACE FUNCTION` solo con el **último** cuerpo de cada función (`recompute_aggregate_score` = versión PHASE 6/N4; `handle_new_user` = PHASE 14; `is_session_participant` etc.), `DROP POLICY IF EXISTS` + `CREATE POLICY` para cada política vigente, `ALTER TABLE … ENABLE ROW LEVEL SECURITY` para todas, `REPLICA IDENTITY FULL` en `evaluations`, `ALTER PUBLICATION supabase_realtime ADD TABLE` con guarda `IF NOT EXISTS` (usar `DO $$ … $$` con `pg_publication_tables`), GRANT/REVOKE finales de PHASE 18 + 18b, sin el `REVOKE … rls_auto_enable()`. Cabecera: "generado a partir de rls_and_triggers.sql el <fecha>; ese archivo sigue siendo el libro histórico; cada PHASE nueva se añade a AMBOS". | Aplicado en el proyecto staging recién creado sin errores; `npm run env:verify` pasa; Security Advisor de Supabase sin avisos nuevos. |
| P2.2 | `prisma/sql/rls_and_triggers.sql` | Añadir un bloque de cabecera al inicio que remita al bootstrap y explique la regla "añadir a ambos". | — |
| P2.3 | `docs/ENVIRONMENTS.md` §"Bootstrap" | Procedimiento completo (ver §4 de este documento). | Ricardo lo ejecuta para staging y marca cada casilla. |

### Fase P3 — Documentación (Sonnet, con lista de archivos explícita)

- `docs/ENVIRONMENTS.md` (nuevo): los tres flujos de §4, §5 y §6 de este documento, en español, con casillas.
- `docs/LAUNCH-RUNBOOK.md`: §6 reescrito con la tabla DNS y la verificación de §6 de este documento; §2 remite a `db:migrate:prod`; nueva nota en §3 sobre variables de Preview por rama.
- `docs/HANDOVER.md`: corregir el dominio, sustituir "Next action" por el estado real, añadir las casillas de este trabajo.
- `README.md`: nueva sección "Environments & deploy" (dev/staging/prod, `migrate dev` solo contra staging, `migrate deploy` en prod vía script guardado), añadir `npm test`, `npm run typecheck`, `env:verify`.
- `CLAUDE.md`: sección "Environments" (appEnv, qué cambia en staging, regla de scripts, regla "PHASE nueva → ambos archivos SQL"), y actualizar la lista de variables con `NEXT_PUBLIC_APP_ENV`, `ENV_FILE`, `CONFIRM_PROD`, `PROD_DB_HOST_PATTERN`.

### Fase P4 — Entrega y pasos manuales (Ricardo)

El agente termina con: PR abierto contra `main` con CI verde, `docs/ENVIRONMENTS.md` con las casillas de §4–§6, y un mensaje final que enumera exactamente qué debe hacer Ricardo y en qué orden.

## 4. Flujo A — Levantar (o reconstruir) un entorno

1. Supabase → New project `cafesensible-staging`, región `eu-central-1`, contraseña de DB guardada en el gestor de contraseñas.
2. Copiar: Project URL, anon key, service-role key, connection string del **pooler** (puerto 6543, `DATABASE_URL`) y la **directa** (puerto 5432, `DIRECT_URL`).
3. Crear `.env.staging` en local a partir de `.env.example` con esos valores + `NEXT_PUBLIC_APP_ENV=staging`, `NEXT_PUBLIC_SITE_URL=<URL Preview de la rama staging>`, `GUEST_CLAIM_SECRET` y `CRON_SECRET` **nuevos** (`openssl rand -base64 32`), `RESEND_API_KEY` vacío.
4. `ENV_FILE=.env.staging npx prisma migrate deploy` → debe aplicar las 26 migraciones sin drift (esto valida por primera vez que la historia se reproduce).
5. SQL Editor (proyecto staging) → pegar `prisma/sql/bootstrap_fresh_project.sql` → Run. Después Database → Replication: confirmar `evaluations` y `cupping_sessions` en `supabase_realtime`.
6. Authentication → Sign In / Up: activar **Allow anonymous sign-ins**. Authentication → URL Configuration: Site URL = URL Preview; Redirect URLs: `<preview>/auth/callback`, `<preview>/**`, `http://localhost:3000/auth/callback`, `http://localhost:3000/**`. Providers → Email: magic link activo; Google si se usa en prod.
7. `ENV_FILE=.env.staging npm run import:reference && ENV_FILE=.env.staging npm run import:benchmarks && ENV_FILE=.env.staging npm run seed:test`.
8. `ENV_FILE=.env.staging npm run env:verify` → todo OK.
9. Local: renombrar `.env.local` (prod) a `.env.production.local` (solo para `db:migrate:prod`) y copiar `.env.staging` a `.env.local`. **A partir de aquí `npm run dev` habla con staging.**
10. Security Advisor de Supabase (staging) → sin avisos nuevos.

## 5. Flujo B — Un cambio viaja dev → staging → prod

1. Rama de feature desde `staging` (o desde `main` si `staging` está al día). `.env.local` = staging.
2. Cambios de esquema: `npx prisma migrate dev --name <snake_case>` (contra staging). SQL manual: nueva PHASE al final de `rls_and_triggers.sql` **y** en `bootstrap_fresh_project.sql`, aplicada en el SQL Editor de staging.
3. PR → `staging`. CI verde obligatorio. Vercel construye el Preview de `staging` con las variables de esa rama (banner ámbar visible).
4. Prueba en la URL de staging con las cuentas `master@cata.test` / `par1@cata.test` (login por `/api/dev/sign-in`). Para cambios de sesión: checklist §5 del runbook, en staging.
5. Promoción: PR `staging` → `main`. Antes de mergear: `npm run db:migrate:prod` (pide `CONFIRM_PROD=yes`, imprime el host y el `migrate status`; si hay drift, parar). SQL manual nuevo → SQL Editor de **producción**. Después merge → Vercel despliega prod. Orden inmutable: migrar primero, desplegar después, migraciones siempre aditivas.
6. Post-deploy: `curl -I https://cafesensible.ai` (200 + cabeceras), `npm run env:verify` con `ENV_FILE=.env.production.local` (solo lectura), abrir una sesión real y comprobar la pantalla que cambió.
7. Rollback: Vercel → Deployments → anterior → *Promote to Production*. Las migraciones aditivas no se revierten.

## 6. Flujo C — Dominio cafesensible.ai + HTTPS

| Paso | Dónde | Qué | Verificación |
|---|---|---|---|
| 1 | Registrador DNS | Apex `cafesensible.ai`: `A 76.76.21.21`. `www`: `CNAME cname.vercel-dns.com`. (Alternativa: nameservers de Vercel `ns1/ns2.vercel-dns.com`, entonces Vercel gestiona todo). TTL 300 durante la migración. | `nslookup cafesensible.ai` devuelve la IP; `nslookup www.cafesensible.ai` devuelve el CNAME. |
| 2 | Vercel → Settings → Domains | Añadir `cafesensible.ai` y `www.cafesensible.ai`; marcar `www → cafesensible.ai` redirect (308). Esperar "Valid Configuration" y certificado emitido (Let's Encrypt automático; puede tardar minutos tras propagar el DNS). | `curl -I https://www.cafesensible.ai` → 308 a apex; `curl -I https://cafesensible.ai` → 200, cabecera `strict-transport-security` presente. |
| 3 | Vercel → Environment Variables | `NEXT_PUBLIC_SITE_URL=https://cafesensible.ai` **solo Production** (Preview conserva la URL de staging). | — |
| 4 | Supabase (producción) → Authentication → URL Configuration | Site URL `https://cafesensible.ai`; Redirect URLs añadir `https://cafesensible.ai/auth/callback` y `https://cafesensible.ai/**`; **mantener** las de `cata-cafe-opal.vercel.app`. | — |
| 5 | Vercel → Deployments | **Redeploy** de producción sin caché de build (`NEXT_PUBLIC_*` se incrusta en build). | La cabecera `x-vercel-id` cambia; `view-source` del landing muestra `og:url` con el dominio nuevo. |
| 6 | Verificación funcional | Login por magic link en el dominio nuevo (correo llega con enlace al dominio nuevo); imprimir hoja QR de una sesión y escanearla; `https://cafesensible.ai/es/opengraph-image` → 200 `image/png`; `robots.txt` y `sitemap.xml` con el host nuevo; LinkedIn Post Inspector + WhatsApp re-scrape. La URL antigua sigue funcionando (Vercel la mantiene). | Casillas marcadas en `docs/ENVIRONMENTS.md`. |
| 7 | Opcional, más adelante | HSTS `preload` solo cuando el dominio lleve semanas estable (es irreversible en la lista de preload). | — |

## 7. Riesgos y gotchas conocidos

- `NEXT_PUBLIC_*` se incrusta en build: cambiar una variable sin redeploy no hace nada.
- `admin.ts` empareja `NEXT_PUBLIC_SUPABASE_URL` con `SUPABASE_SERVICE_ROLE_KEY`, y Prisma usa `DATABASE_URL` aparte: **los cuatro** (URL, anon, service-role, DATABASE_URL/DIRECT_URL) deben cambiarse juntos o la app escribirá en un proyecto y autenticará en otro.
- Drift de checksums en `_prisma_migrations` de producción: `db:migrate:prod` debe mostrar el `status` y detenerse si hay drift; no usar `migrate resolve` sin leer el historial.
- Un `REVOKE` de EXECUTE a `authenticated` en una función usada por una política rompe Realtime (PHASE 18b). `env:verify` lo comprueba.
- Preview de Vercel: cualquier rama genera un Preview con las variables de Preview "por defecto"; las variables **por rama** solo aplican a `staging`. Otras ramas sin variables completas fallarán el boot por `lib/env.ts` — es aceptable y esperado; documentarlo.
- Cron en Preview: Vercel solo ejecuta crons en producción, pero la guarda de P0.4 es la red de seguridad.
- El login por contraseña de staging es un vector si alguien comparte la URL de staging: no meter datos reales en staging, y rotar `DEV_PASSWORD` a una variable de entorno (`DEV_SIGNIN_PASSWORD`) en P0.7.

## 8. Definición de hecho

- [ ] Fases P0–P3 mergeadas en `main` con CI verde.
- [ ] Staging levantado por el Flujo A; `env:verify` en verde; banner visible; robots `noindex`; crons `{skipped}`.
- [ ] Smoke test §5 del runbook ejecutado en staging y registrado en `docs/HANDOVER.md`.
- [ ] Dominio publicado por el Flujo C con las 6 verificaciones.
- [ ] `docs/HANDOVER.md` y la memoria de proyecto actualizadas con el nuevo estado.
