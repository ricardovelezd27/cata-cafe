# 17 · Insights y administración

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 1558–1625 · **Domain briefs applied:** `growth-admin` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-growth-admin (claude-sonnet) · **Verification:** done 2026-11-06 (growth-admin verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

Insights is an admin area under `/app/insights`. `getAnalyticsAccess` (`lib/analytics/access.ts:45`) resolves three levels: super-admin and AI-admin by email allowlist, and a "flagged" user by `Profile.analyticsAccess`. The layout 404s everyone else (`insights/layout.tsx:21`); each page and each server action re-checks (`requireAnalyticsAccess`, `requireAiAdmin`, `requireSuperAdmin`, `requireUsersDirectoryAccess`). Tabs: panel, explorer/pivot, benchmark, chat (AI-admin), Acceso (super-admin), Usuarios with a registered-only CSV export. A monthly cron (`vercel.json`, day 1, 12:00 UTC) emails a KPI digest with an AI narrative. The spec matches the code. There is no view-as/impersonation in this area (the `viewAs` hits are results-page only), so those checklist items do not apply here.

## 2. Expert bar applied

- **P8 deny-by-default, server-side on every request.** Do all pages, actions and routes check? Is the scope of data tied to the level?
- **P9/P10 allowlist and privileged-action log.** Normalised comparison, non-anonymous only, a log line per export or grant.
- **P11 directories expose the minimum.** Mask emails, gate and log the CSV.
- **P13 AI over user data.** Aggregates only, cached, capped, labelled, no prompt text in logs.
- **P14 crons fail closed, idempotent, bounded, with a last-success signal.**
- **Native lens.** Admin on phones, and a file download inside a WebView.

## 3. Findings

### F-insights-1 · Flagged users and AI admins see platform-wide data, including each cupper by name · severity: P1 · status: confirms-board(El nivel con flag ve datos de toda la plataforma, incluso por catador)

- **Problem** — `runInsight`, `runPivot` and `listPivotDimensionValues` only call `requireAnalyticsAccess()` and then query with no scope (`app/actions/analytics.ts:50,57,65,72,81,89`), so the query functions fall back to `scope: AnalyticsScope = PLATFORM_SCOPE` (`lib/analytics/queries.ts:496,621,808`). The `cupper` dimension returns `{ key: row.cupperId, label: row.cupperName ?? row.cupperId }` (`queries.ts:329-331`). The dashboard page, the PDF report route and the AI summary action also call `getDashboardData(locale)` with the default platform scope (`insights/page.tsx:36`, `api/insights/report/route.ts:40`, `app/actions/ai.ts:34`). Only the chat derives scope from the level (`app/actions/aiChat.ts:78-80`: super-admin platform, everyone else own data). So the same AI admin sees own data in the chat but the whole platform in the explorer. The model is inverted.
- **Implication** — Security and trust. Any user the super-admin flags (the flag exists to give a teacher "the base insights") can pivot every cupper's name and scores across all sessions, including blind tastings owned by others. The monthly digest also mails platform totals to every flagged profile.
- **Fix** — One server-side helper derives the scope from the resolved access (platform only for the super-admin, own sessions and evaluations for all others) and every insight entry point uses it: the three actions, dashboard page, report route, dashboard AI narrative and digest recipients (platform KPIs only for the super-admin). The `cupper` dimension is offered and returned only in platform scope, and small platform groups (<3 cuppers) are suppressed. **Acceptance:** a flagged user pivoting by cupper sees only cuppers from sessions they own; `listPivotDimensionValues('evaluations','cupper')` returns only that network; the report PDF for a flagged user contains only their numbers; a unit test covers the helper for the three levels. **Size:** M.
- **Native** — n/a (server-side).
- **Confidence** — verified-in-code.
- **Kim?** yes, see K-insights-1.
- **Invariant check** — Strengthens authz-at-the-server (Prisma bypasses RLS, so TS is the gate). Display-only; scoring and `AggregateScore` untouched.

### F-insights-2 · No audit trail for privileged actions (email export, directory, access grants) · severity: P2 · status: new

- **Problem** — `exportRegisteredUsersCsv` returns every registered email to the browser (`app/actions/analytics.ts:249-258`) with only a comment saying it is "never written to disk or logged"; `setAnalyticsAccess` flips a flag with a plain `prisma.profile.update` (`:268`); `listAnalyticsUsers` returns every email unmasked (`:200-228`). None calls `logInfo`/`logWarn` (`lib/log.ts`) with actor and target. The directory and CSV are open to every AI admin (`requireUsersDirectoryAccess`, `access.ts:104-108`), not only the super-admin.
- **Implication** — Security/trust. After a leak or a mistaken grant nobody can tell who exported the list or when access was granted or revoked. The export is an uncontrolled copy of all customer emails (brief P11).
- **Fix** — Log one structured line per export, grant/revoke and directory load: action, actor user id, target user id (grant), count (export), never emails. Show emails masked in the directory by default with an explicit "mostrar". Decide whether AI admins keep the CSV. **Acceptance:** an export, a grant and a revoke each produce one searchable log line with the actor id; no log line contains an email; masked emails render by default. **Size:** S.
- **Native** — Masking must also hold in the phone card layout.
- **Confidence** — verified-in-code.
- **Kim?** no.
- **Invariant check** — Respects the "never log emails" rule; the co-cupper rule for UUID→email resolution is not applied to this admin directory (intended for admins), so say so in a code comment.

### F-insights-3 · Monthly digest: concurrency, silent failures, no last-success signal, wrong-language link · severity: P3 · status: confirms-board(El digest no es idempotente: comprueba, envía y luego registra)

- **Problem** — `sendInsightsDigest` does `findUnique` (`lib/insightsDigestEmail.ts:224`), sends to all (`:286-`) and only then `digestRun.create` (`:299`), with no failure check. Two overlapping calls both pass the check and double-send; a timeout after sending (`maxDuration = 60`, `route.ts:11`, two AI calls plus N emails) leaves no row, so a retry re-sends everyone; if every send fails a row is still created, so the month is never retried. `period` is `@unique` (`schema.prisma:440`) but only used after the fact. No heartbeat is exposed. Separately, the "open insights" link is hard-coded `/es/app/insights` (`:212`) even for English recipients.
- **Implication** — Robustness. Duplicate emails to admins, or a month silently lost with no signal; English recipients land on the Spanish UI.
- **Fix** — Claim the period first (insert as "running"; a unique violation means already running or ran), record per-recipient outcomes, let a re-run send only to recipients without a "sent" result, leave a fully failed run retryable, show last run and counts on an admin page, and use the recipient locale in the link. **Acceptance:** two simultaneous calls send each recipient at most once; a run with no email key leaves the period retryable; the English email links to `/en/...`. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code (concurrency itself needs-runtime-check).
- **Kim?** no.
- **Invariant check** — The cron contract (503 unset, 401 bad bearer, bounded batch) holds at `route.ts:15-21` and is kept.

### F-insights-4 · Chat writes the question text and tool arguments to the logs · severity: P3 · status: confirms-board(El chat de IA escribe el texto de la pregunta en los logs)

- **Problem** — `console.info(\`[aiChat] user=… q="${trimmedQuestion.slice(0, 120)}"\`)` (`app/actions/aiChat.ts:103-105`) and `args=${JSON.stringify(call.args).slice(0, 200)}` (`:145`), using raw `console.*` instead of `lib/log.ts`. CLAUDE.md says never log AI prompts.
- **Implication** — Privacy/trust; admin questions may name coffees, farms or people and sit in Vercel Logs.
- **Fix** — Log through `logInfo` with action, user id, scope kind, tool name, call and token counts, outcome; no question or argument text. **Acceptance:** no log line from this file contains question or argument content. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** no.
- **Invariant check** — aligns with the Logging rule.

### F-insights-5 · The super-admin address is a personal Gmail fallback in code and is not asserted at boot · severity: P3 · status: confirms-board(El super-admin por defecto es un correo personal fijo en el código)

- **Problem** — `process.env.ANALYTICS_SUPER_ADMIN_EMAIL ?? "ricardo.velez88@gmail.com"` (`lib/analytics/access.ts:11-13`) applies in production too; `REQUIRED_IN_PRODUCTION` (`lib/env.ts:17-26`) does not list it, and the runbook only says "set it explicitly" (`docs/LAUNCH-RUNBOOK.md:205`). The AI-admin list also silently defaults to that one address (`access.ts:30`).
- **Implication** — Security hygiene: a missing variable keeps the top privilege on a fixed address with no warning; changing the owner needs a code change.
- **Fix** — Require the variable in production in `lib/env.ts` (boot fails naming it), keep a dev-only fallback, list it in runbook §3. **Acceptance:** production boot without it fails with a clear message; a unit test covers `missingProductionEnv`. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** no.
- **Invariant check** — extends the boot-time env rule.

### F-insights-6 · Daily chat quota is read, then incremented much later · severity: P3 · status: new

- **Problem** — `findUnique` reads `used` (`app/actions/aiChat.ts:83-87`), the model loop runs (up to `MAX_MODEL_CALLS`, "pro" tier), and only afterwards `upsert … increment` (`:184-200`). Parallel calls all see `used < limit`.
- **Implication** — Cost robustness: the 25/day cap (`lib/ai/chatTools.ts:30`) can be exceeded by concurrent submissions (double click, two tabs).
- **Fix** — Reserve a slot atomically before calling the model and refund it on a pre-call failure, keeping the "not billed if no call succeeded" rule. **Acceptance:** 30 parallel calls produce at most 25 model runs; a provider failure before any success restores the slot. **Size:** S.
- **Native** — n/a.
- **Confidence** — inferred-from-code; needs-runtime-check (parallel calls).
- **Kim?** no.
- **Invariant check** — none touched.

### F-insights-7 · Interactive insight actions throw an opaque "forbidden" instead of returning a result · severity: P3 · status: new

- **Problem** — `runInsight`, `runPivot`, `saveInsight`, `deleteSavedInsight` and others are called from client components but are not wrapped in `run()`; the guards `throw new Error("forbidden")` (`lib/analytics/access.ts:81,88,95,106`) and a Prisma failure in `saveInsight` (`analytics.ts:109`) propagates. In production the client sees only a digest. `exportRegisteredUsersCsv` already follows the contract (`analytics.ts:250`).
- **Implication** — A revoked admin or a transient DB error shows a generic error panel rather than a localized message.
- **Fix** — Wrap the interactive insight actions in `run()` and use `useActionFeedback` on the client. **Acceptance:** a revoked flagged user pressing "Guardar" gets the localized forbidden toast; no error boundary. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** no.
- **Invariant check** — brings the code in line with the ActionResult contract.

### F-insights-8 · CSV export relies on a blob link click, which a WebView will not save · severity: P3 · status: new

**Fixed in S8-15 (PR #…): the users CSV goes through downloadFile; the export button is hidden inside a native shell until the Filesystem+Share branch exists (TODO(native)).**

- **Problem** — `components/insights/UsersDirectory.tsx:55-65` builds a `Blob`, an `<a download>` and calls `a.click()`.
- **Implication** — Native-readiness: iOS WKWebView ignores the `download` attribute and a Capacitor shell needs a Filesystem/Share plugin. The brief also recommends export be desktop-only.
- **Fix** — Hide the export in the native shell (or send it through the native share sheet), unchanged on desktop web. **Acceptance:** in the shell the button is absent or opens the share sheet with the file; desktop unchanged. **Size:** S.
- **Native** — This is the finding.
- **Confidence** — inferred-from-code; needs-runtime-check (a device).
- **Kim?** no.
- **Invariant check** — none touched.

## 4. Keep — works well

- Layout 404 for unauthorised users plus an independent check on every page, action and route: `app/[locale]/app/insights/layout.tsx:21`, `access/page.tsx:22`, `chat/page.tsx:24`, `users/page.tsx:23`, `app/api/insights/report/route.ts:34-37`.
- Chat scope derived server-side from access, never from the client: `app/actions/aiChat.ts:78-80` (the pattern F-insights-1 should reuse).
- Allowlist compared after trim and lowercase; anonymous users have no email so cannot match: `lib/analytics/access.ts:16,28,34`.
- Auth-user listing driven by `nextPage`, with a strict variant for the export that throws rather than truncates (`lib/supabase/adminUsers.ts`); an empty export is a failure (`analytics.ts:255`); CSV neutralises formula injection (`lib/analytics/usersCsv.ts:12`).
- The cron fails closed: 503 when the secret is unset, 401 on a bad bearer (`app/api/cron/insights-digest/route.ts:15-21`).
- AI disclaimer present in the chat (`ChatPanel.tsx:290`) and the digest (`lib/insightsDigestEmail.ts:197`).
- The super-admin cannot change their own flag: `analytics.ts:266`.

## 5. Not verified

- That prompts in `lib/ai/narratives.ts` and tool builders in `lib/ai/chatTools.ts` carry aggregates only (bar P13); I read the chat action, not every builder. Check: grep prompt builders for names and emails.
- Whether Supabase marks the allowlisted email as verified for every sign-in method. Check: sign in with magic link and Google and read `email_confirmed_at`.
- Digest double-send under real concurrency and the 60 s limit with real recipient counts. Check: call the endpoint twice in parallel against a staging DB.
- Real size of the Usuarios directory (`listAnalyticsUsers` loads all profiles without pagination; the auth listing is capped at 50 pages). Check: count production profiles.
- Retention for guest accounts and waitlist rows (bar P12) is outside this flow's code and was not audited.

## 6. Questions for Kim (collected)

- **K-insights-1** — En el análisis de la plataforma podemos mostrar el puntaje de cada catador con su nombre. ¿Quién debería poder verlo? Opciones: (a) solo el dueño de la sesión, para sus propios catadores; (b) los administradores de la plataforma, con nombre; (c) los administradores, pero con catadores anónimos (Catador 1, 2…) y sin mostrar grupos de menos de 3 personas.

## 7. Verification log

- F-insights-1 — CONFIRMED — `analytics.ts:50-89` only calls `requireAnalyticsAccess()`; queries default to `PLATFORM_SCOPE` (`queries.ts:496,621,808`); `cupper` dimension returns names (`queries.ts:329-331`); only chat scopes (`aiChat.ts:78-80`). Whether a flagged teacher should see the platform is a product call (K-insights-1), but cupper names across blind sessions is a privacy exposure. — severity: keep
- F-insights-2 — CONFIRMED — No `log*` call anywhere in `app/actions/analytics.ts`; `exportRegisteredUsersCsv` (`:249-258`), `setAnalyticsAccess` (`:268`), `listAnalyticsUsers` (`:200-228`) leave no trace; AI admins reach CSV via `requireUsersDirectoryAccess` (`access.ts:104-108`). Missing detection, not an active leak. — severity: keep

