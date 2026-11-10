# S8 — Flows audit remediation (2026-11)

> Source of truth for every item here: the verified audits in `docs/audits/flows-2026-11/` (one file per
> flow, findings `F-<flow>-<n>` with evidence `path:line`, verification verdicts in §7) and the
> consolidated report `docs/audits/flows-2026-11/00-REPORT.md`. The expert bars the audits measured
> against live in `docs/expertise/`. Kim's decisions arrive as `docs/product/kim-flows-2026-11/respuestas-kim-2026-11.md`.

Each `S8-NN-*.md` file is ONE implementation session = ONE pull request, in the format of
`docs/prompts/S6-kim-2026-10.md` / `S4-results-hygiene.md`: a ready-to-paste prompt, then the plan the
session must read in full. Work the prompts in the order below; the first three remove live data
exposure and must ship before anything else. Items marked **⚑ Kim** cannot start until the matching
answer (A1, C1, …) is in the answers file; the prompt says what to do meanwhile.

## Universal gate (every prompt inherits it)

- Branch off `main`, one worktree per prompt, one PR. Never commit without being asked.
- Before every commit: `npx tsc --noEmit && npm run lint && npm test`; no new lint errors over the baseline.
  i18n key parity (`node -e` diff of es/en key sets). UI changes add 390×844 + 1280 screenshots to the PR.
- At most one Prisma migration per prompt; SQL for Supabase goes into `prisma/sql/rls_and_triggers.sql`
  as a new PHASE block **and** a click-by-click section in `docs/LAUNCH-RUNBOOK.md`. Ricardo applies both.
  `.env.local` IS production: never run migrations or seeds from a session.
- Invariants (CLAUDE.md) hold unless the prompt says which one it changes and why: one close routine,
  closed = read-only, authz only via `lib/sessionAuth.ts`, scoring never from the client, reference rules,
  guest scope, owner-only physical/extrinsic, PDF gating inside the builder, offline store client-only,
  `ActionResult` for interactive actions.
- **Numbering is allocated at merge time.** The prompts reserve SQL `PHASE 21` (S8-01), `22` (S8-03), `23`
  (S8-04) and runbook §10–§14 (S8-01, 03, 04, 05, 09) in series order; if a prompt lands out of order, take
  the next free number and fix the prompt text in the same PR. Migrations: 02 (commit 2 only), 03, 05, 07,
  09, 11, 12, 14 each carry exactly one; none may be combined.
- Every prompt carries a **Native-readiness clause**: what the change must also hold inside a
  Capacitor/WebView shell (see `docs/expertise/offline-native.md` §3 "Native-readiness").
- `docs/flows.md` is updated in the same PR as any flow change; the audit file's "Keep — works well" list
  is the regression list for that flow.
- Each prompt ends with a **Definition of done** that names the acceptance checks taken from the findings.

## The series

| # | File | Theme | Findings covered (P1/P2 unless noted) | ⚑ Kim | Size |
|---|---|---|---|---|---|
| 01 | `S8-01-rls-closed-readonly.md` | **Database policies**: closed = read-only and membership at the SQL layer; read policies that honour results visibility; dead submit actions removed; `closesAt` enforced server-side | F-sesiones-1, F-resultados-1, F-sesiones-2, F-resultados-3, F-grupal-6, F-grupal-7, F-grupal-asincrona-2, F-sesiones-3 (closed guard half) | — | M |
| 02 | `S8-02-blind-leaks.md` | **Blind-tasting and owner-data leaks** in print, results, coffee profile/ficha, history | F-informes-1, F-resultados-2, F-cafes-1, F-informes-2, F-cafes-2, F-cafes-3, F-sesiones-11 (P3), F-cafes-8 (P3) | D6, D8 (defaults given) | S–M |
| 03 | `S8-03-guest-guard-email-abuse.md` | **Registered-only writes and email abuse**: one `requireRegisteredUser`, throttles on every public sender, group-email ledger | F-guest-1, F-04-1, F-crear-sesion-4, F-cafes-7 (P3), F-grupos-1, F-grupos-7, F-grupos-3, F-grupos-2, F-grupos-5 (P3), F-entrar-6, F-landing-2 | — | M |
| 04 | `S8-04-scoring-under-five-cups.md` | **Scoring consistency** below five cups (trigger vs TypeScript), cups default + disclosure, express score label, stale aggregates after edits | F-grupal-1, F-04-4, F-crear-sesion-5, F-express-4 (P3), F-solo-2, F-solo-4 (P3), F-offline-7 | **A1, A2, A3** | M |
| 05 | `S8-05-close-lifecycle.md` | **Closing a session**: unsent drafts, deadline visibility and timezone, close retry, express/solo manual finish, forgotten live sessions | F-grupal-2, F-grupal-asincrona-1, F-offline-1, F-grupal-asincrona-3, F-grupal-asincrona-4, F-grupal-asincrona-7, F-solo-1, F-express-1, F-solo-3 (P3), F-grupal-8 (P3), F-sesiones-12 (P3) | **C1, C2, C3**, C7 | L |
| 06 | `S8-06-auth-deep-links-otp.md` | **Auth**: `next` preserved everywhere, OTP code + confirm page (scanner-safe, WebView-safe), resend with countdown, locale captured and honoured, error copy, support exit | F-entrar-1, F-landing-3, F-entrar-3, F-entrar-4, F-guest-7 (P3), F-entrar-5, F-cuenta-4, F-cuenta-3, F-entrar-7 (P3), F-entrar-8 (P3), F-entrar-9 (P3), F-entrar-10 (P3), F-landing-4 (P3), F-landing-7 (P3), F-entrar-2 (P3) | — | M |
| 07 | `S8-07-account-lifecycle.md` | **Account lifecycle**: delete account (FK audit, owned assets), email change, sign-out scope and warnings, guest identity safety, claim robustness | F-cuenta-1, F-cuenta-5, F-cuenta-2 (P3), F-cuenta-6, F-cuenta-7 (P3), F-guest-4, F-guest-3, F-guest-2, F-guest-9 (P3), F-guest-8 (P3), F-guest-6 (P3), F-cuenta-8 (P3) | **E1, E3**, E4 | L |
| 08 | `S8-08-legal-privacy-admin-scope.md` | **Legal and admin**: privacy/terms pages, consent record, audit log for privileged actions, insights scope for flagged users, super-admin hygiene | F-landing-1, F-landing-6 (P3), F-insights-1, F-insights-2, F-insights-5 (P3), F-insights-4 (P3) | **D4** | M |
| 09 | `S8-09-offline-sync-hardening.md` | **Offline**: replay ordering, persisted conflicts, permanent-error handling, orphaned drafts on claim/sign-out/delete, storage persist, offline create error | F-offline-2, F-offline-3, F-offline-4, F-offline-5, F-guest-5, F-sesiones-5 (P3), F-offline-6 (P3), F-offline-8 (P3), F-offline-9 (P3), F-04-3, F-movimiento-sensorial-4 (P3), F-solo-5 (P3) | C1 (shared with 05) | M |
| 10 | `S8-10-session-setup-and-edit.md` | **Create/edit robustness**: failed create keeps the form, step-2 link persisted, error copy, duplicate rules, reference re-pin warning, format lock, sample removal, validation, express polish, coffee action contract | F-crear-sesion-1, F-04-2, F-crear-sesion-2 (P3), F-crear-sesion-3 (P3), F-crear-sesion-6…10 (P3), F-04-5 (P3), F-sesiones-8, F-04-6…8 (P3), F-sesiones-3 (race half), F-sesiones-4 (P3), F-sesiones-6, F-sesiones-7, F-sesiones-9 (P3), F-sesiones-10 (P3), F-express-2 (P3), F-express-3, F-express-5…8 (P3), F-cafes-6 (P3), F-cafes-9 (P3), F-cafes-10 (P3), F-solo-6 (P3) | **B2, B8**, A4, C6 | L |
| 11 | `S8-11-live-group-robustness.md` | **Live group sessions**: `/join` rules, honest progress counter, waiting-room resume after lock, server-side start check, invite revoke, late joiners, group-email invite path | F-grupal-3, F-grupal-4, F-grupal-5 (P3), F-grupal-9 (P3), F-grupal-10 (P3), F-grupal-asincrona-5 (P3), F-grupos-6, F-grupos-4 (P3) | **C4**, C5, C8 | M |
| 12 | `S8-12-results-reports-honesty.md` | **Results and reports**: origin edit after close, exclusion with reason/author/notice, ranking honesty (n, ties), report stamps and n of N, PDF language, CSV export, coffee sharing links, aggregate rules | F-resultados-4, F-resultados-5, F-resultados-6, F-resultados-7…10 (P3), F-informes-3, F-informes-5…7 (P3), F-cafes-4, F-cafes-5 (P3) | **D1, D2, D3**, D5 | M |
| 13 | `S8-13-warmup-player-resilience.md` | **Movimiento Sensorial**: interstitial only before start, synced-run resume and wake lock, audio resume after lock, pause/skip safety, reflection notes, copy | F-movimiento-sensorial-1, F-movimiento-sensorial-3, F-movimiento-sensorial-2 (P3), F-movimiento-sensorial-5…8 (P3) | **F1**, F2, F3, F4, F5 | S |
| 14 | `S8-14-groups-admin-hygiene.md` | **Groups and admin polish**: email links/unsubscribe, error contract, roster visibility, digest robustness, chat quota, insight action results, landing cap copy | F-grupos-8 (P3), F-grupos-9 (P3), F-grupos-10 (P3), F-insights-3 (P3), F-insights-6 (P3), F-insights-7 (P3), F-landing-5 (P3) | D7 | S |
| 15 | `S8-15-native-readiness-foundation.md` | **Capacitor foundation**: platform seam for download/share/print/open-external, deep-link entry, visibility/online resume helper, storage persist, device test checklist; closes the WebView findings | F-informes-4 (P3), F-resultados-9 (P3), F-insights-8 (P3), F-entrar-8 (P3), F-offline-8 (P3), F-movimiento-sensorial-2 (P3) | E5 | M |

Cross-flow duplicates resolved in the audits' §7 are owned by one prompt only (e.g. F-04-1 ⊂ 03, F-guest-5 ⊂ 09, F-grupal-asincrona-1 ⊂ 05, F-informes-2 ⊂ 02). F-grupal-asincrona-6 was REJECTED and is not scheduled.

## Order and dependencies

```
01 RLS ─┬─ 02 leaks ─┬─ 03 guest/email ─┬─ 04 scoring (⚑ A1) ─ 05 close (⚑ C1) ─ 09 offline
        │            │                   └─ 06 auth ─ 07 account (⚑ E) ─ 08 legal/admin (⚑ D4)
        │            └─ 12 results (⚑ D)                                  └─ 15 native foundation
        └─ 10 setup/edit (⚑ B) ─ 11 live (⚑ C4) ─ 13 warm-up (⚑ F) ─ 14 hygiene
```
Ship 01–03 this week regardless of Kim (no gates). 04, 05, 07, 08, 10–13 have gated items: start their
ungated parts, leave the gated ones behind a clearly named TODO, and finish them when the answers land.

## How a prompt file is shaped

See `_template.md`. Sections: header (when, where, needs from Ricardo) · 1. Prompt (copy-paste) ·
2. Findings covered (id → one line, severity, verdict, owner audit file) · 3. Gated on Kim · 4. Plan
(numbered steps, each with files and the invariant it touches) · 5. Acceptance (from the findings) ·
6. Manual steps for Ricardo · 7. Risks and rollback · 8. Native-readiness clause · 9. Definition of done.
