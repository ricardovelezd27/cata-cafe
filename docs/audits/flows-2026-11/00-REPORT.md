# Independent flows audit — consolidated report (2026-11-06)

> **Scope:** the 18 lanes of the Flowmap board `cata-cafe` v4 (https://claude.ai/artifact/R4tkTWDPXYVJd3mDji91t9),
> audited against the code on `main@dac4328` (branch `claude/flows-audit-improvement-166a78`).
> **Method:** nine expert briefs written first (`docs/expertise/`), then one auditor per flow measuring the
> code against that bar, then one adversarial verifier per domain re-reading every P1/P2 citation.
> **Outputs:** 18 audit files here (`01-…` to `18-…`), the S8 prompt series (`docs/prompts/S8-flows/`), Kim's
> questionnaire (`docs/product/kim-flows-2026-11/`), nine reusable auditor agents (`.claude/agents/flow-auditor-*.md`).
> **Out of scope, parked:** design-system consistency, typography, token drift (see §9).

## 1. In one paragraph

The app's happy paths hold: 90 of 157 findings confirm something the board already knew, and the
verifiers rejected only one claim. What the independent bar exposed is a pattern, not a pile of bugs:
**the database and the public endpoints do not know what the application layer knows.** Closed sessions,
results visibility, blind coding, registered-vs-guest, owner-only data: every one of these rules lives in
TypeScript guards that the public Supabase key, the print page, the coffee profile or a direct
server-action POST can walk around. Add two correctness problems (the SQL trigger and the TypeScript
aggregate disagree below five cups; closing a session silently drops unsent work) and three "store
blockers" for the native app (no account deletion, no privacy pages, magic-link-only auth that a
WebView cannot complete), and that is the whole top ten. Everything else is friction that the prompts
sweep up by file area.

## 2. Numbers (after verification)

| | Count |
|---|---|
| Findings | **157** across 18 flows |
| Severity, final | **11 P1** · 60 P2 · 86 P3 (auditors rated 15 / 79 / 63; verifiers downgraded 27, raised 0) |
| Verdict on P1/P2 | **76 CONFIRMED** · 17 PLAUSIBLE (evidence present, consequence needs a device/second user/config) · **1 REJECTED** (F-grupal-asincrona-6) · 63 P3 not re-verified |
| Relation to the board | 90 `confirms-board` (re-verified, several sharpened or re-rated) · **67 `new`** |
| Size | 94 S · 60 M · 3 L |
| Questions only Kim can answer | **35** findings flagged → consolidated into **45 questions** (18 blocking) in `docs/product/kim-flows-2026-11/01-preguntas-para-kim.md` |
| Cross-flow duplicates resolved | 8 (owner assigned in each §7) |

### Coverage by flow

| Flow | Findings | P1/P2/P3 (as audited) | Confirmed | Plausible | Rejected |
|---|---|---|---|---|---|
| 01-entrar | 10 | 1/5/4 | 3 | 3 | 0 |
| 02-cuenta | 8 | 1/5/2 | 6 | 0 | 0 |
| 03-invitado-qr-claim | 9 | 2/4/3 | 4 | 2 | 0 |
| 04-empezar-cata | 8 | 0/4/4 | 3 | 1 | 0 |
| 05-catar-ahora | 8 | 0/4/4 | 4 | 0 | 0 |
| 06-crear-sesion | 10 | 0/5/5 | 5 | 0 | 0 |
| 07-sesion-solo | 6 | 0/3/3 | 2 | 1 | 0 |
| 08-grupal-en-vivo | 10 | 1/5/4 | 5 | 1 | 0 |
| 09-grupal-asincrona | 7 | 1/5/1 | 4 | 1 | 1 |
| 10-resultados | 10 | 2/4/4 | 5 | 1 | 0 |
| 11-editar-administrar | 12 | 1/7/4 | 8 | 0 | 0 |
| 12-cafes | 10 | 1/5/4 | 6 | 0 | 0 |
| 13-grupos | 10 | 1/6/3 | 6 | 1 | 0 |
| 14-informes-pdf | 7 | 1/3/3 | 3 | 1 | 0 |
| 15-offline-sync | 9 | 1/7/1 | 6 | 2 | 0 |
| 16-movimiento-sensorial | 8 | 0/3/5 | 1 | 2 | 0 |
| 17-insights-admin | 8 | 1/1/6 | 2 | 0 | 0 |
| 18-landing | 7 | 1/3/3 | 3 | 1 | 0 |

**What "verified" means here.** CONFIRMED = a second agent re-opened every cited `path:line` on this
branch and the consequence follows from the code alone. PLAUSIBLE = the code is as described but the
harm depends on something outside the repo (a Supabase project setting, an iPhone, two concurrent users).
Nothing in this audit was executed against production; §8 lists the runtime checks still owed. The three
P1s with the widest blast radius (RLS read, RLS write, scoring mismatch) were additionally re-read by the
lead session, and the scoring mismatch was reproduced arithmetically (stored 77.50 vs displayed 80.00 on
a two-cup, two-cupper session with one non-uniform cup).

## 3. The ten risks that matter (Problem → Implication → Fix)

1. **Any participant can read every other cupper's submitted scores, and the community score, through the public key** — `F-resultados-1` (P1, confirmed). *Problem:* `evals_submitted_participant` and `agg_select` in `prisma/sql/rls_and_triggers.sql:134,156` grant SELECT to any session participant with no visibility condition; the page hides this, the REST API does not. *Implication:* blind, independent scoring (the product's core promise) can be broken by anyone who opens the browser devtools; teachers' panels lose their meaning. *Fix:* S8-01 — policies mirror `canViewGroupResults` (closed, or all submitted + published) and a cupper reads only their own rows until then.
2. **Closed sessions are writable through the database; membership is never checked on insert** — `F-sesiones-1` (P1, confirmed). *Problem:* `evals_own` is `FOR ALL` on `cupperId = auth.uid()` with no status or membership predicate; the owner can flip `status`. *Implication:* "closed = read-only", the pinned reference and server-side scoring are all bypassable; the aggregate trigger re-fires on tampered rows. *Fix:* S8-01 — write policies require active session + membership; plus removal of two dead submit actions (`F-sesiones-2`, `F-resultados-3`, `F-grupal-6`).
3. **Two scoring engines disagree below five cups** — `F-grupal-1` (P1, reproduced). *Problem:* the latest `recompute_aggregate_score` (`:710`) penalizes non-uniform/defective cups at any cup count; `computeGroupAggregate` (`lib/scoring.ts:209`) only at ≥ 5. The default wizard value is 2 cups and the cup grid accepts flags at any count. *Implication:* the results page shows one community score, coffee history and the coffee profile another, for the same cupping. *Fix:* S8-04 — one rule in both places, chosen by Kim (**A1**), plus a one-off recompute; also fixes stale aggregates after post-submit edits (`F-solo-2`, `F-offline-7`).
4. **Closing silently discards unsent work** — `F-grupal-2`, `F-grupal-asincrona-1`, `F-offline-1` (P2/P2/P1, confirmed). *Problem:* close has no pre-check for complete-but-unsent drafts; offline replay of a closed session returns `"discarded"` and the client paints it green. *Implication:* a cupper who did the work, especially one cupping without signal, loses it with no message and no way back. *Fix:* S8-05 — pre-close warning, post-close notice, surfaced "discarded", and Kim's rule for late contributions (**C1**).
5. **Blind coding leaks through side doors** — `F-informes-1` (P1), `F-resultados-2` (P1), `F-cafes-1`/`F-informes-2`/`F-cafes-3`, `F-sesiones-11` (P3). *Problem:* `/print` serializes coffee name and roast of unrevealed samples to participants; the results page ships owner physical data and pre-release scores in its props; the coffee profile averages open blind sessions and shows other owners' session names and private notes. *Implication:* view-source or a second tab reveals what the session was designed to hide. *Fix:* S8-02 — gate at the data layer (one `viewerTier` applied in `results/page.tsx`, `print/page.tsx`, the ficha loaders), not in the JSX.
6. **Anonymous guests can create sessions, groups and send branded email** — `F-guest-1` (P1), `F-grupos-1` (P1), `F-04-1`, `F-crear-sesion-4`, `F-entrar-6`, `F-landing-2`. *Problem:* `requireUser()` accepts `is_anonymous`; only `createExpressSession` checks it; no public sender is throttled. *Implication:* free accounts minted by QR can spam arbitrary addresses from the app's domain and burn the Resend/Supabase quotas the real cuppings depend on. *Fix:* S8-03 — `requireRegisteredUser()` on every create/send, throttles with a delivery ledger.
7. **There is no way out of an account** — `F-cuenta-1` (P1), `F-cuenta-5`, `F-landing-1` (P1). *Problem:* no delete-account path (and seven `Profile` relations have no `onDelete`), no email change, no privacy/terms pages, no consent record on the waitlist. *Implication:* GDPR exposure today and an App Store rejection (guideline 5.1.1(v)) tomorrow. *Fix:* S8-07 + S8-08, with Kim's rule for what happens to a deleted organizer's sessions (**E3**).
8. **Deep links and language are lost at the door; the magic link is the only key** — `F-entrar-3/4/5`, `F-cuenta-3/4`, `F-entrar-1`/`F-landing-3`. *Problem:* unauthenticated `/app/*` loses `?next=`, the WelcomeModal blocks the destination, `preferred_lang` is never written, the OTP token is consumed by a bare GET. *Implication:* every close email, invite and QR that lands on a signed-out phone drops the user on the dashboard; English users are silently switched to Spanish; a mail scanner can burn the link; inside a Capacitor WebView there is no second path. *Fix:* S8-06 — one `safeNext`, proxy-level `next`, confirm page + 6-digit code, locale captured once.
9. **Admins see more than the owner rule allows** — `F-insights-1` (P1), `F-insights-2`. *Problem:* any flagged profile pivots every cupper's name and score platform-wide; no audit line for CSV exports or grants. *Implication:* a teacher given "insights" for their own class can read other owners' blind tastings. *Fix:* S8-08 per Kim **D4** (default: anonymized cuppers, own data unless super-admin).
10. **Express sessions can never close; solo cannot finish early** — `F-express-1` (P2), `F-solo-1`, `F-grupal-asincrona-7`. *Problem:* auto-close needs every sample submitted, solo has no manual close, the cron ignores sessions without `closesAt`, and a close that fails after the status flip cannot be retried. *Implication:* the most common express use (fewer cups than planned) leaves a session active forever with no history and no reveal. *Fix:* S8-05 — "Terminar cata" for solo/express (a deliberate exception to "no manual solo close") and an idempotent second phase for close.

## 4. Themes the prompts are organised around

| Theme | Why it is one theme | Prompts |
|---|---|---|
| The database does not know what the app knows | Every TS guard (closed, visibility, membership, registered) has no SQL twin | 01, 03 |
| Blind integrity has side doors | Gating happens in JSX, not in the data loaders | 02 |
| Two engines, one number | Trigger vs TypeScript; stale aggregates after edits | 04 |
| Closing is a cliff | No warning, no retry, no manual finish, UTC days | 05 |
| The door loses things | `next`, locale, token, modal | 06 |
| No exit | delete account, change email, legal pages | 07, 08 |
| Offline is honest but lossy at the edges | discarded, conflicts, orphans, permanent errors | 09 |
| Forms forget | failed create wipes the wizard; step 2 in memory | 10 |
| Live rooms do not recover | lock the phone, late joiners, counters | 11, 13 |
| Results imply more than the data supports | ranking with n=1, no "n of N", exclusion with no trace | 12 |
| WebView is one test, not twelve bugs | print/download/storage assumptions | 15 |

## 5. Native-app viewpoint (Capacitor, decided path)

Nothing in the audit argues for a rewrite; it argues for **seams**. Six findings only matter inside a
WebView (`F-informes-4`, `F-resultados-9`, `F-insights-8`, `F-entrar-8`, `F-offline-8`,
`F-movimiento-sensorial-2`) and the verifier was right to collapse them: they are one `lib/platform/`
abstraction (download, share, print, open-external, resume-after-foreground, storage persist) and one
afternoon on a real iPhone. The two things that would block a store build are not WebView bugs at all:
auth with no code fallback (S8-06) and no account deletion (S8-07). Build S8-06 and S8-07 before any
Capacitor shell; build S8-15 as the shell's first commit.

## 6. What Kim decides (summary; full text in `01-preguntas-para-kim.md`)

18 blocking questions, grouped: **A** cups and penalties below five (A1 drives S8-04), defaults (A2);
**B** the pinned 79.00 reference and re-pinning rated samples (B1–B4); **C** what happens to unsent work
at close, forgotten live sessions, late joiners, when the group becomes visible (C1–C5); **D** origin
edits after close, exclusion rules, minimum n and ties, admin visibility of names (D1–D4); **E** shared
devices, big-event capacity and email-at-join, deleted organizers (E1–E3); **F** when the warm-up
happens (F1). Every question carries a default so no prompt is blocked indefinitely.

## 7. Rejected and re-rated (so nobody re-argues them)

- **REJECTED** `F-grupal-asincrona-6` (results open before everyone cupped): a not-yet-cupped invitee cannot open `/results`; what remains is P3 flicker as people join.
- **P1 → P2**: `F-entrar-1` (link-only login — Google is an exit; same defect owned by `F-landing-3`), `F-guest-2` (event capacity is a runbook gap), `F-grupal-asincrona-1` (rows persist; lost from results, not erased), `F-cafes-1` (session names, never cupper identity, gated by `resultsPublished`).
- **P2 → P3** (23): mostly "recoverable with a reload/second button" or "needs a deliberate double action" — listed in each file's §7 with the reason.
- **Severity raised by auditors over the board**: `F-grupal-1` (scoring correctness), `F-sesiones-2`/`F-grupal-6` (submit after close); both survived verification (the latter at P2/P3 split).

## 8. Not verified — the runtime checks still owed

| Check | Settles | Cheapest way |
|---|---|---|
| REST read/write with a participant JWT | F-resultados-1, F-sesiones-1 exploitability | `set local role authenticated` probe on a staging DB, or one PostgREST call on a test session |
| Two-cup session with a flagged cup | F-grupal-1 end to end | dev session, compare results page vs `aggregate_scores` row |
| Owner closes while a participant edits | F-grupal-2 experience | two browsers |
| Lock an iPhone in the waiting room / warm-up | F-grupal-5, F-movimiento-sensorial-2/3 | real device |
| Mail scanner consuming the magic link | F-entrar-1 / F-landing-3 frequency | count `exchange_failed` redirects in Vercel logs |
| Supabase anonymous per-IP limit before a 50-person event | F-guest-2 | dashboard setting + runbook line |
| WKWebView IndexedDB persistence | F-offline-8 and the WebView theme | Capacitor dev build, 7-day wait or storage inspector |
| 20 concurrent guest claims | F-guest-6 | staging load test |

## 9. Future meta-audits (explicitly parked)

1. **Design-system consistency** — tokens vs hex literals, radius/spacing drift, `md:`/`lg:` breakpoint discipline, legacy alias classes; the `normalize` and `polish` skills exist for it. Several audits noticed hard-coded Spanish and un-tokenized colours in passing and did not log them.
2. **Accessibility** — the auditors logged aria/focus gaps only where they met them (login, forms, dialogs); a WCAG 2.2 pass over the cup screen and results is owed.
3. **Performance** — PDF render fan-out, results page payload size, realtime subscription count per room.
4. **Copy and i18n** — three audits found hard-coded Spanish in client components and ICU placeholders at risk; the `clarify` skill plus an es/en parity script would make it a one-day job.
5. **Test coverage** — the audits name the tests to write; a coverage audit should follow S8.

## 10. How the briefs were made (to refresh them)

Nine Sonnet research agents, each with the `deep-research` skill's researcher method, a domain scope, the
flows served, the app's constraints and the brief shape in `docs/expertise/README.md`. Each brief tags
weakly sourced principles (`[practice]`, `[inference]`, `[secondary]`, `[verify]`); the auditors were told
those carry less weight. Known thin spots: the cupping brief could not read the SCA-102…105 PDFs (numbers
come from study guides); the results brief ran a shallow search; no primary source was found for
WKWebView storage eviction, synced-clock design or lost-mailbox recovery. Refresh = re-run the research
prompt in this section's spirit with a new date, diff, keep what holds.

## 11. Files

- Audits: `docs/audits/flows-2026-11/01-…18-*.md` (`_template.md`, `_how-to-audit.md` are the method).
- Expertise: `docs/expertise/*.md` + agents `.claude/agents/flow-auditor-*.md` (now un-ignored in git).
- Prompts: `docs/prompts/S8-flows/README.md` + `S8-01…15`.
- Kim: `docs/product/kim-flows-2026-11/01-preguntas-para-kim.md`, `02-respuestas-kim-plantilla.md`.
- Flowmap: the board itself was not edited; `boards/cata-cafe.spec.md` remains the as-is reference. The
  Kanban view in `C:/projects/flowmap/app/kanban.js` was restyled to the Flows tokens (local, unpublished).
