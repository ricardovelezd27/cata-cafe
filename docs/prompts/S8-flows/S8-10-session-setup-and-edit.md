# S8-10 — Create, edit, duplicate without data loss

> **When:** after S8-01 to S8-03 are merged (it extends their guards and the `requireRegisteredUser` helper); before S8-11 · **Where:** new session, worktree off `main`, one PR (large: commit per step) · **Needs from Ricardo:** nothing to apply (no migration, no SQL); answers B2, B8, A4, C6 can land later, defaults are built.
> **Findings:** 30 (0 P1 · 7 P2 · 23 P3) from `docs/audits/flows-2026-11/04-empezar-cata.md, 05-catar-ahora.md, 06-crear-sesion.md, 07-sesion-solo.md, 11-editar-administrar.md, 12-cafes.md` · **Gated on Kim:** B2, B8, A4, C6

---

## 1. Prompt (copy and paste)

```
Context: Café Sensible (read CLAUDE.md, then docs/prompts/S8-flows/README.md for the universal gate, then
THIS file in full — it is the plan). Then read the audit files it names, finding by finding: every change you
make must map to a finding id and respect that audit's "Keep — works well" list. Theme: nothing the owner
types or sets up may be lost or silently changed — wizard, express, edit page, sample add/remove, duplicate,
coffee forms. Invariants in play: Server Action Contract (`run()` + `ActionResult`), `createSession`'s
`redirect()`, authz only via lib/sessionAuth.ts, closed = read-only with two sanctioned post-close writes,
reference rules (display-only, pin server-side), `usableCoffeeWhere` on every coffee link. Out of scope:
guest guard and input bounds (S8-03), under-5-cups hint (S8-04), closed-guard + RLS (S8-01), offline create
(S8-09), invite revoke (S8-11). Delegation: Sonnet may do steps 4, 9, 12; the lead keeps 1, 5, 7, 8. Work the plan in order, one
commit per step, `npx tsc --noEmit && npm run lint && npm test` before each commit, update docs/flows.md in
the same PR, and finish with the Definition of done checklist in the PR description. Forbid bare `git stash`.
```

## 2. Findings covered

| Id | Severity (final) | Verdict | One line | Audit file |
|---|---|---|---|---|
| F-crear-sesion-1 (owns F-04-2) | P2 | CONFIRMED | Create actions outside `run()`; a throw discards the form (`sessions.ts:320,438`; `NewSessionForm.tsx:495-533`) | `06-crear-sesion.md`, `04-empezar-cata.md` |
| F-sesiones-3 (race half) | P2 | CONFIRMED | `removeSessionSample` races a first evaluation, cascades physical data (`sessions.ts:1115-1140`) | `11-editar-administrar.md` |
| F-sesiones-6 | P2 | CONFIRMED | Rated sample marked reference overwrites ratings unannounced (`referenceRules.ts:174-200`, `EditSessionForm.tsx:173`) | same |
| F-sesiones-7 | P2 | CONFIRMED | Edit save sends unchanged format/cups; lock ignores `startedAt` (`EditSessionForm.tsx:205`) | same |
| F-sesiones-8, F-04-5 | P2, P3 | CONFIRMED | Duplicate copies unusable coffees, keeps one reference (`sessions.ts:731,744,775`) | same, `04-…` |
| F-express-3 | P2 | CONFIRMED | "Asignar café" mints duplicate coffees, non-atomic (`sessions.ts:1308-1330`) | `05-catar-ahora.md` |
| F-crear-sesion-2, 3, 6, 7, 8, 9 | P3 | CONFIRMED | Step 2 in memory; error keys dropped; no draft; UTC dates; label; orphan coffees | `06-…` |
| F-crear-sesion-10 | P3 | CONFIRMED | Sample labels are sequential letters (A4) | `06-…` |
| F-04-6, 7, 8 | P3 | CONFIRMED | Entry labels and targets; UTC dates; express form hygiene | `04-…` |
| F-sesiones-4, 9, 10 | P3 | CONFIRMED | Delete dialog lacks permanence; closed form editable; `updateSession` unvalidated | `11-…` |
| F-express-2, 5, 6, 7, 8 | P3 | CONFIRMED | Express absent from history; unbounded note; handoff loses input; Spanish-only add | `05-…` |
| F-cafes-6, 9, 10 | P3 | CONFIRMED | Coffee actions throw; edit overwrites; no "Catar este café" | `12-cafes.md` |
| F-solo-6 | P3 | CONFIRMED | `submitAllEvaluations` throws on double submit (`community.ts:22-25`) | `07-sesion-solo.md` |

## 3. Gated on Kim

| Kim id | Question (short) | Default if unanswered | What to do meanwhile |
|---|---|---|---|
| B2 | Rated sample becomes reference: replace, keep aside, or block? | (a) replace, warn first | Count + confirm (step 7); do NOT build "keep originals" |
| B8 | Duplicate with several references: all or only active? | (a) all | Copy all ranks (step 8) |
| A4 | Blind codes: letters in order or random numbers? | (a) letters now | F-crear-sesion-10: leave as TODO, no code |
| C6 | What freezes at "Iniciar cata"? | (b) only adding samples | Lock format/cups from `startedAt`, still allow add (step 6) |

## 4. Plan

**A. Wizard and create actions** (`NewSessionForm.tsx`, `new/page.tsx`, `sessions.ts`)

1. **Create actions to `run()`** — wrap `createSession`/`createGroupSession` bodies in `run("createSession", …)`. `createSession` keeps `redirect()` inside the body: `run()` re-throws it, so success never returns and only failures return `{ ok:false, error }`. Validation keeps the wizard codes (typed union with `ActionErrorCode`); `createGroupSession` returns `ActionResult<{ sessionId, inviteToken }>`. Whitelist `locale` against `routing.locales`. Client: `feedback.run` in the transition, form stays mounted, strip shows, button re-enables, an expired session says sign in again without clearing state. Covers: F-crear-sesion-1, F-04-2.
2. **Every error has copy** — pass the whole `errors` object, add `invalid_warmup` and `not_found_or_forbidden` (es/en), vitest enumerating validator codes against `messages`. Show errors beside the field with focus. Covers: F-crear-sesion-3, 6.
3. **Draft and recoverable step 2** — per-user localStorage draft cleared on success and by `clearLocalDeviceState`; `beforeunload` guard while dirty. Step 2 becomes an owner-only route `sessions/[id]/invite` (`force-dynamic`, no `generateStaticParams`, `requireSessionOwner`, 404 otherwise) reading a new `getLatestInvite` (print page's lookup, `print/page.tsx:61-72`); `createInviteToken` returns it first (S8-11 adds revoke). Covers: F-crear-sesion-2, F-crear-sesion-6.
4. **Wizard hygiene** — group submit label "Crear cata y obtener enlace"; `inputMode="numeric"`, `enterKeyHint`, 44 px targets via arbitrary values (root font is 14px); local-date helper `localDateISO()` for wizard, closing `min` and express name; one wizard label everywhere; express filled + wizard outlined in empty states; "Catar este café" opens `?coffeeId=` validated with `usableCoffeeWhere`, ignored if foreign. Create only referenced coffee cards, inside the session transaction (retry the WHOLE transaction on a code collision). Covers: F-crear-sesion-7, 8, 9, F-04-6, F-04-7, F-cafes-10.

**B. Edit page and sample actions** (`EditSessionForm.tsx`, `edit/page.tsx`, `sessions.ts`, `DeleteSessionButton.tsx`)

5. **Sample removal** — `requireSampleOwner` + `assertSessionWritable`; count evaluations inside the transaction; refuse or confirm with counts when `PhysicalEvaluation`/`ExtrinsicData` exist; keep position re-pack and rank compaction. Delete-session dialog: render the permanence line, split submitted vs draft, participants, live variant, retryable impact failure (`getDeleteImpact`, `:637`). Covers: F-sesiones-3, F-sesiones-4.
6. **`updateSession` and the form** — `run()` + `lib/validate` (`str` ≤120, `oneOf` format, bounded objective); send only changed fields and ignore unchanged format/cups server-side; lock format/cups from `startedAt` as well as the first evaluation (C6 default). Closed: whole form in a disabled fieldset with one notice and link to Resultados; feedback for every non-ok rename/add; Enter guarded by `addPending`; `addSessionSample` computes position inside the transaction, maps P2002 to a retry, uses the locale label helper and the 1–20 cap. Covers: F-sesiones-7, 9, 10, F-express-8.
7. **Reference re-pin warning (B2 default)** — `setReferenceSample` takes `confirmRepin`; when the chosen sample has evaluations and it is absent it returns `conflict`. The edit form fetches the count and confirms ("se reemplazarán las notas de N catadores"); cancel reverts the select (`referenceSeq`). Pin logic untouched. Covers: F-sesiones-6.

**C. Duplicate**

8. **Faithful duplicate** — select every `referenceRank`, remap by position (`applyReferenceByPosition`, active = highest), re-validate each `coffeeId` with `usableCoffeeWhere` (unusable → coffee-less sample, label kept, notice on `/edit`); `DuplicateButton` shows failure text visibly. Covers: F-sesiones-8, F-04-5.

**D. Express and results handoff**

9. **Express form** — keep CTA enabled with "Ponle un nombre", `<form>` + `enterKeyHint="go"`, one-line format description, shared defaults in `lib/expressSession.ts` with remembered last format, "Configurar sesión completa" carries `name/format/n` (bad values ignored), "Catar ahora" empty-state CTA. Covers: F-express-6, 7, F-04-8.
10. **Asignar café** — `CoffeePicker` in the dialog, cup-page sample editor and "Añadir muestra"; create + link in one transaction; `run()`; localized toast, dialog stays open; `usableCoffeeWhere` → `coffee_not_usable`; locale-prefixed revalidation; keep the post-close sanction and `revealed: true`. Covers: F-express-3.
11. **Bounds, history, double submit** — clamp `nota_express` to 500 and cap the serialized module inside `computeEvaluationDerived` (live `invalid_input`, offline non-retryable). History shows closed coffee-less submitted samples as "Sin café asignado" rows (replaced on assign), profile separates catas from cafés. `submitAllEvaluations` → `run()` returning `{ closed, submitted }`, `session_closed` is final state for the owner. Covers: F-express-5, F-express-2, F-solo-6.

**E. Coffee actions**

12. **`createCoffee`/`updateCoffee`/`duplicateCoffee` to `run()`**, `CoffeeForm` uses `useActionFeedback` and keeps values; `updateCoffee` takes an `updatedAt` precondition (`conflict` → "cambió en otro lugar"); no snapshot of past sessions (K-cafes-2 default). Covers: F-cafes-6, F-cafes-9.

## 5. Acceptance (tests to write or checks to run)

- F-crear-sesion-1: forced server error leaves every field intact with a localized strip; solo success still lands on `/cup`; locale `//x` ignored.
- F-crear-sesion-3: vitest fails if a returned code lacks es/en copy. F-crear-sesion-2: reload shows the same token, participants 404.
- F-sesiones-3/6/7/8: closed or physical-data removal asks or refuses; N-evaluation reference choice needs confirm; rename after another cupper evaluated saves; R1+R2 source copies both ranks, anonymized coffee becomes coffee-less.
- F-express-3: picked coffee links without a new row; typed name creates exactly one; foreign id gives `coffee_not_usable`.
- F-solo-6: two submits in a row both reach results without error. F-cafes-9: stale save refused.
- Keep lists: owner-only authz, `warmup_locked`, `planClosesAtChange`.

## 6. Manual steps for Ricardo

- None. Verify on a phone: back-swipe in the wizard, reload on the invite route.

## 7. Risks and rollback

- Widened return types of create actions: grep every consumer. Each step reverts alone.

## 8. Native-readiness clause

- Drafts are client-only and purged on sign-out; `?coffeeId=` and the invite route open from a deep link.

## 9. Definition of done

- [ ] every finding in §2 has a commit referencing its id
- [ ] acceptance checks in §5 pass (`tests/referenceRules.test.ts`, `expressSession.test.ts`, `actionsAndState.test.ts`, new `sessionErrorsCopy.test.ts`)
- [ ] docs/flows.md updated; audit files get `Fixed in S8-10 (PR #…)` under each finding
- [ ] screenshots 390×844 + 1280 for wizard, invite route, edit form, dialogs
- [ ] gated items either done or left as named TODOs (A4 random codes, B2 "keep aside") in the PR description
