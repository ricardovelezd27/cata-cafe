# Insights and AI

### Insights Access Levels (`lib/analytics/access.ts`)
Three levels, all resolved from `getAnalyticsAccess()`:

| Level | Grant | Sees |
|---|---|---|
| Super-admin | `ANALYTICS_SUPER_ADMIN_EMAIL` (required in production, no code fallback; pure parsing in `lib/analytics/adminEmails.ts`) | Everything, incl. **Acceso** (grant management via `requireSuperAdmin`) |
| AI admin | `ANALYTICS_AI_ADMIN_EMAILS` allowlist | `/app/insights` + the **Análisis** (AI chat) sidebar item + the **Usuarios** directory (`requireUsersDirectoryAccess` — shared with super-admin; emails masked server-side, never raw; Acceso stays super-admin-only) |
| Flagged user | `Profile.analyticsAccess` | Base `/app/insights` only, no AI chat, no Usuarios |

**Scope (S8-08):** `scopeFor(access)` (`lib/analytics/scope.ts`, pure, tested) is the ONE place that picks the data scope: super-admin = platform, every other level = `{ kind: "user", userId }`. Every action/page/route/chat/digest that queries analytics derives its scope from it, never from the client. In platform scope `lib/analytics/cupperPrivacy.ts` swaps display names for "Catador XXXX" (key and label from an HMAC of the cupper id, domain prefix `analytics-cupper`, so the label is the same under any filter and no real id leaves the server) and drops cuppers with fewer than 3 evaluations IN THE WHOLE SCOPE (one grouped count in `fetchEvaluationRows`) from the `cupper` dimension; the digest and the CSV export go to the super-admin only. Privileged actions emit `lib/analytics/audit.ts` lines (`where:"audit"`, ids and counts, never an email); the Usuarios directory masks emails ON THE SERVER for everyone but the super-admin (`directoryEmail` in `lib/analytics/scope.ts` + `lib/maskEmail.ts`; AI admins get only `j***@domain` in the payload, no reveal toggle, search matches the masked text; the super-admin gets raw emails and the toggle). `ANALYTICS_SUPER_ADMIN_EMAIL` is REQUIRED in production (`REQUIRED_IN_PRODUCTION` in `lib/env.ts`, boot-fatal; F-insights-5); unset means there is no super-admin (`getSuperAdminEmail()` is null, `isSuperAdminEmail` always false, the AI-admin list falls back to empty, the digest cron answers 503 `no_super_admin` without claiming a period).

Emails for the Usuarios directory are resolved via `lib/supabase/adminUsers.ts` (`listAllAuthUsers`, paginated on GoTrue's `nextPage` — never the `length < perPage` heuristic, which silently truncated to page 1). Anonymous/guest accounts show an "Invitado" badge and em-dash email, with a registered-vs-guest facet and a summary count line.

### AI Narrative Pattern (`lib/ai/`)
- Provider-agnostic seam: `getAiProvider()` in `lib/ai/index.ts` returns the Gemini impl (`lib/ai/gemini.ts`); a Claude impl would slot in there without touching callers.
- All prompts live in `lib/ai/narratives.ts` and receive **only aggregated numbers/labels** — never raw evaluations or emails. Bump `PROMPT_VERSION` when editing a prompt (it invalidates the cache).
- `cachedGenerate()` in `lib/ai/cache.ts` is cache-first over the `insight_narratives` table (sha256 data-hash key) — repeat views never re-bill the provider. Shared by server actions (`app/actions/ai.ts`), the report PDF route, and the digest cron.
- AI is server-only and gated by `requireAnalyticsAccess()`; never call from client components.
- Chat continuity: assistant turns replay a compact `[datos]` digest of that turn's tool-result blocks (`serializeBlocksForHistory` in `lib/ai/chatTypes.ts`, 700-char cap per block) so follow-up questions can reference earlier figures without re-fetching them; `MAX_TEXT_LENGTH` is 3000.

### Reference Data (`reference_series`, `benchmark_lots`)
- Imported from vendored CSVs by `npm run import:reference` / `npm run import:benchmarks` (idempotent per source; see `scripts/data/README.md` for provenance/licenses). Refresh = re-download CSV + re-run.
- Free-text coffee metadata (country/process/harvest/altitude) is normalized **at query time** by `lib/analytics/normalize.ts` (deterministic exact-alias matching only — extend the alias lists there; `scripts/report-normalization.ts` audits live-DB coverage).
- Every UI/PDF/email surface showing derived numbers must render the citation lines from `lib/analytics/referenceSources.ts` (CC-BY / MIT attribution requirements).
