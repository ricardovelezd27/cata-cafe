# 04 · Empezar una cata: entradas y variantes

> **Spec section:** `C:/projects/flowmap/boards/cata-cafe.spec.md` lines 391–489 · **Domain briefs applied:** `session-setup` (+ `cupping-protocol`, `offline-native` as lenses) · **Audited:** 2026-11-06 · **Auditor:** flow-auditor-session-setup (Sonnet 5.5) · **Verification:** done 2026-11-06 (session-setup verifier, Sonnet)

## 1. The flow in five lines (as-is, from the code)

1. A cupping starts from the dashboard header (`app/[locale]/app/page.tsx:179-192`, «Catar ahora» filled + «Nueva sesión» outline), the dashboard empty state, `DashboardIntro` (wizard only), the sessions header (`sessions/page.tsx:200-210`), the group page (`?groupId=`), the WelcomeModal («session» path → `/app/sessions/new`, `WelcomeModal.tsx:18`) and the row action «Duplicar».
2. Only three creators exist: `createExpressSession` (`app/actions/sessions.ts:395`), `createSession`/`createGroupSession` (`:320`, `:438`) and `duplicateSession` (`:715`).
3. Express posts name · format · 1–20 samples, always solo, 1 cup, coffee-less «Muestra A…», then goes to `/cup`. The wizard asks everything (coffee cards, cups 1–5, reference, warm-up, group/closing date) and, for groups, shows a second screen with link + QR.
4. Every link is a `GuestGateLink`; `proxy.ts` and the client share `isGuestAllowedPath` (`lib/guestScope.ts:9-16`). The spec and the code agree on all of this.
5. Only `createExpressSession` refuses anonymous users (`:405`); none of the other creators does.

## 2. Expert bar applied

- **P7 fewer fields beat fewer steps / P1 short list first.** Express is the field budget; the wizard is the "everything" path. Checked: are the two paths clearly labelled, with sensible defaults (checklist 1–4, 10)?
- **P5 never lose entered data; P10/P11 recoverable errors.** Checked: back, refresh, failed create, error copy (6–9, 14, 28).
- **P9 defaults only where most agree.** Cups default and format default (3, 10).
- **P12/P13 keyboard and 44 px targets** with the 14 px root font (16–18).
- **Templates carry structure, not state** (21–22).
- **Lenses.** CVA penalties exist only at 5 cups (`cupping-protocol` P5/P7); a session should be creatable at a table with poor signal (`offline-native` checklist 19).

## 3. Findings

### F-04-1 · A guest can create sessions by direct POST · severity: P2 · status: confirms-board(Invitado anónimo crea sesiones por POST directo)

**Fixed in S8-03** (draft PR from branch `claude/s8-03-guest-guard-email-impl`; not yet merged).

- **Problem** — `createExpressSession` rejects anonymous users (`app/actions/sessions.ts:405`: `if (user.is_anonymous) throw new Error("not_found_or_forbidden")`), but `createSession` (`:320`) and `createGroupSession` (`:438`) only call `requireUser()`, which accepts anonymous sessions (`lib/auth.ts:9`). `proxy.ts` only blocks the pages; a server action is a public POST.
- **Implication** — The guest-scope rule ("guests never create assets under a throwaway identity") is enforced only in the UI. A crafted request creates a solo or group session, with an invite link, under an anonymous id that `mergeGuestData` later has to carry. No data is lost and nobody else's data is exposed, so I rate it P2, not the board's P1 (board says major).
- **Fix** — One shared guard (registered users only) used by every creator, including `duplicateSession`. **Acceptance:** an anonymous token calling each creator gets `not_found_or_forbidden` and creates no row; registered users unchanged; a unit test lists every creator. **Size:** S.
- **Native** — n/a (server rule); the guest-claim flow must keep working from the shell.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — Guest scope: this fix completes it.

### F-04-2 · A failed or interrupted wizard loses everything the owner typed · severity: P2 · status: new

- **Problem** — `createSession`/`createGroupSession` are not wrapped in `run()`; they return plain `{ok:false,error}` or throw. `NewSessionForm.tsx:495-520` awaits them inside `start(async …)` with no try/catch and no `useActionFeedback`, so a thrown error (pool timeout, unknown Prisma error) reaches the error boundary and the form state is gone. Separately, all state is `useState` (`:268-300`) with no draft, no `beforeunload`, no history guard: a phone back swipe or refresh drops the coffee cards. `createSession` also redirects to `` `/${input.locale || "es"}/…` `` (`:381`) without whitelisting the locale, unlike express (`:408`).
- **Implication** — Whoever is preparing six coffees at the table and hits a transient failure retypes every card. This breaks the Server Action Contract for an interactive action. Trust and robustness.
- **Fix** — Convert the creators to `ActionResult` via `run()` (keep `redirect()` outside as today), keep the form filled and toast the localized error; guard accidental exit while the form is dirty and keep a per-user draft in browser storage (client only). Whitelist the locale. **Acceptance:** a forced server error leaves the form filled with a localized message; back/refresh on a dirty form asks first or restores the draft; locale `//x` is ignored. **Size:** M.
- **Native** — A WebView can be killed in the background: the draft must survive a process restart, and the hardware back button must step back or confirm, not exit.
- **Confidence** — verified-in-code for the missing wrapper and guard; needs-runtime-check for the boundary behaviour (force a throw in dev).
- **Kim?** — no.
- **Invariant check** — Server Action Contract; `createSession` keeps `redirect()` outside the transaction.

### F-04-3 · Starting a cupping offline fails with a generic error · severity: P2 · status: new

- **Problem** — `ExpressForm.tsx:67-74` and the wizard call the server directly; there is no connectivity check and no queue. On a network failure `useActionFeedback.run` falls into its catch and toasts `unknown` (`components/ui/Toast.tsx:110-117`). The pages may load from the service-worker cache, so the user fills the form and only then fails.
- **Implication** — The offline-first promise stops at the door: evaluations survive offline, but the session that holds them cannot be started. A cupper in a lab with bad signal sees "something went wrong".
- **Fix** — Minimum: detect offline and say so, keeping the form ("Sin conexión: se necesita internet para crear la sesión"). Later (needs a spec): client-generated ids so express can be created locally and replayed. **Acceptance:** offline tap shows the specific message and keeps values; reconnecting lets the same tap succeed. **Size:** S for the message, L for queued creation.
- **Native** — Use the shared connectivity probe, not `navigator.onLine`; a native shell needs the same.
- **Confidence** — inferred-from-spec/code; run it with the network off in devtools.
- **Kim?** — yes. «¿Con qué frecuencia catan en sitios sin señal (finca, bodega)? ¿Preferís poder crear la cata sin internet, o basta con avisar claro?»
- **Invariant check** — none touched.

### F-04-4 · The wizard defaults to 2 cups, and CVA penalties exist only at 5 · severity: P2 · status: new

**Fixed in S8-04** (draft PR, branch `claude/s8-04-scoring-impl`): wizard proposes 5 cups, label "Tazas por muestra", numeric keyboard, one-line hint below 5, field hidden for descriptive (TODO(A2) constant `DEFAULT_CUPS_PER_SAMPLE`).

- **Problem** — `NewSessionForm.tsx:274` starts at 2 cups for a combined format, while score penalties only count with 5 cups per sample (CLAUDE.md scoring; `cupping-protocol` P7). The field is labelled «Tazas por café» (`messages/es.json:140`) though it is per sample, and for descriptive it is asked but unused. It is a native `type="number"` spinner (`:676`).
- **Implication** — A professional running the five-cup protocol who leaves the default gets scores with no uniformity/defect deduction, silently different from the SCA calculator. Scoring expectation, not a code bug.
- **Fix** — Decide the default with Kim; show a one-line hint under the field when the value is below 5 ("las penalizaciones por taza solo se aplican con 5"); rename the label to «Tazas por muestra»; hide the field for descriptive. **Acceptance:** hint visible below 5, label per sample, field absent for descriptive, numeric keyboard (`inputMode="numeric"`). **Size:** S.
- **Native** — Numeric keyboard on iOS/Android WebView.
- **Confidence** — verified-in-code; needs-runtime-check whether a hint already exists elsewhere on screen.
- **Kim?** — yes. «Cuando catan en serio con formato CVA, ¿siempre son 5 tazas por muestra? ¿Qué número pondrías por defecto en afectivo/combinado: 5, o 2–3 para sesiones informales?»
- **Invariant check** — Scoring inputs stay server-derived; this only changes the default and the copy.

### F-04-5 · Duplicar arrastra de más y de menos · severity: P3 · status: confirms-board(Duplicar re-enlaza cafés que ya no se pueden usar) + confirms-board(⚑ Duplicar conserva sólo la referencia activa)

- **Problem** — `duplicateSession` copies `coffeeId` as is (`app/actions/sessions.ts:775`) without `usableCoffeeWhere`, and selects only `referenceSampleId` (`:731`), stamping `referenceRank: 1` (`:105`). A source with R1+R2 copies R2 as R1 and the earlier reference becomes an ordinary sample. Sharpening the ⚑: the dropped reference is the one cupped first in the source. `DuplicateButton` shows a failure only through `title` (`components/DuplicateButton.tsx:61`), invisible on touch.
- **Implication** — A template silently differs from its source; a copy can link an anonymized coffee and write history against it at close.
- **Fix** — Copy all references by rank, remapped by position; unusable coffees become coffee-less samples with a notice on `/edit`; show the failure text visibly. **Acceptance:** R1+R2 source → copy with both ranks and the same active; anonymized-coffee source → coffee-less sample + notice; failure message readable on a phone. **Size:** M.
- **Native** — n/a.
- **Confidence** — verified-in-code.
- **Kim?** — no (product call: keep all references; Ricardo).
- **Invariant check** — Reference rules: reuse the `lib/referenceRules.ts` helpers; the pointer stays the highest rank.

### F-04-6 · Entries: several buttons, several labels, small targets, wizard-only starts · severity: P3 · status: confirms-board(Los estados vacíos ofrecen sólo el asistente largo) + confirms-board(Catar este café)

- **Problem** — The wizard is reached by «Nueva sesión» (`app/page.tsx:187`), «Crear sesión CVA» (`DashboardIntro`), «Crear primera sesión CVA →» (`es.json:119`) and the WelcomeModal: different words for one screen. The sessions and history empty states (`SessionsTable.tsx:281-290`, `HistoryTable.tsx:213-220`) offer only the wizard. The coffee page has no «Catar este café» (`coffees/[id]/page.tsx:217-243` has edit/duplicate/delete only). The primary header pill is `px-4 py-2 text-sm` (`app/page.tsx:184`), about 31 px at the 14 px root; the row icon buttons are `p-1.5` with a 16 px icon (about 28 px, `SessionsTable.tsx:210`).
- **Implication** — Newcomers land on the long form; thumbs miss targets on a phone.
- **Fix** — Express filled and wizard outlined in every empty state; one label for the wizard everywhere; «Catar este café» opening the wizard with `?coffeeId=`; primary buttons at least 44 px, icon actions at least 40 px. **Acceptance:** computed heights ≥44 px for primaries; empty states carry both; one wizard label across surfaces. **Size:** S–M.
- **Native** — Touch targets match 44 pt / 48 dp.
- **Confidence** — verified-in-code; pixel values need-runtime-check.
- **Kim?** — no.
- **Invariant check** — Guest scope: keep `GuestGateLink` on every new entry.

### F-04-7 · Dates are UTC, so evening cuppings in the Americas get tomorrow · severity: P3 · status: new

- **Problem** — The wizard date defaults to `new Date().toISOString().slice(0,10)` (`NewSessionForm.tsx:271`) and the closing-date `min` uses the same (`:1220`); the express name is built on the server (`express/page.tsx:18`, `defaultExpressName(new Date())`).
- **Implication** — At 21:00 in Chile the session is dated the next day, the closing picker refuses "today", and the express name can carry the server's date.
- **Fix** — Compute the local date on the client for the date field, the `min` and the express prefill. **Acceptance:** at UTC 01:00 / local 21:00 the local date shows; the express name uses the browser date. **Size:** S.
- **Native** — n/a.
- **Confidence** — verified-in-code; run with a TZ override.
- **Kim?** — no.
- **Invariant check** — `closesAt` semantics unchanged (end of day UTC, server side).

### F-04-8 · Form hygiene: disabled submit, unused error copy, diverging defaults · severity: P3 · status: confirms-board(Exprés y asistente no comparten valores por defecto ni textos)

- **Problem** — Express submit is disabled when the name is empty with no explanation (`ExpressForm.tsx:171`), the page is not a `<form>` so Enter does nothing, and the hint does not say express is 1 cup (`es.json:211`). On the wizard page only 8 error keys reach the form (`new/page.tsx:101-111`), so `invalid_name`, `invalid_closes_at`, `too_many_samples` (all present in `es.json`) fall to `generic`; the UI has no 100-sample cap. Express defaults affective · 6 samples, the wizard combined · 1 sample (`NewSessionForm.tsx:273`, `lib/expressSession.ts:28,18`).
- **Implication** — Small, repeated friction; real server errors read as "no se pudo crear".
- **Fix** — Keep submit enabled and explain what is missing; wrap express in a `<form>` with `enterKeyHint="go"`; pass every error key; one defaults module with a remembered last format. **Acceptance:** tapping with an empty name shows a message; all `session.newForm.errors` keys are reachable; last format remembered. **Size:** S.
- **Native** — Enter-key label and keyboard overlap on the action row.
- **Confidence** — verified-in-code.
- **Kim?** — no.
- **Invariant check** — none touched.

## 4. Keep — works well

- Express budget and recovery: three fields, 48 px controls, form stays filled on failure (`ExpressForm.tsx`), 1–20 enforced in control and server (`lib/expressSession.ts`).
- Express server guard and locale whitelist (`app/actions/sessions.ts:405-408`).
- Wizard and server require only the coffee name; altitude only when typed (`validateSessionInput`).
- Server derives meta and clamps cups 1–5 (`validateSessionMeta`); reference validated by `parseReferenceIdx` and stamped in the same transaction.
- Group step 2: link, QR, «Ir al panel» primary, «Iniciar cata ahora» secondary (`NewSessionForm.tsx:609-640`); the invite stays recoverable in `MasterControls`.
- `GuestGateLink` + shared `isGuestAllowedPath`; duplicate excludes evaluations, participants and closing date, issues a fresh token and lands on `/edit`.

## 5. Not verified

- Whether a cups<5 hint exists on screen (F-04-4): open the wizard on a phone.
- Error-boundary behaviour on a thrown create (F-04-2): throw inside the action in dev.
- Rendered heights at the 14 px root (F-04-6): devtools computed size.
- WelcomeModal ⚑: the first-run path goes to the wizard (`WelcomeModal.tsx:18`); sharpened: that screen requires a coffee name per sample, which the express path avoids. Product decision, no Kim needed.
- Offline load of express/wizard from the service-worker cache: airplane mode after a first visit.

## 6. Questions for Kim (collected)

- **K-04-1** (F-04-3) ¿Con qué frecuencia catan en sitios sin señal? ¿Preferís crear la cata sin internet, o basta con un aviso claro?
- **K-04-2** (F-04-4) En una cata CVA seria, ¿siempre 5 tazas por muestra? ¿Qué número ponemos por defecto en afectivo/combinado: 5, o 2–3 para sesiones informales?

## 7. Verification log

F-04-1 — CONFIRMED — `createSession` (sessions.ts:334) and `createGroupSession` (:460) call only `requireUser()`, which accepts anonymous users (lib/auth.ts:5-12); express alone checks `is_anonymous` (:405). Exploit via a crafted action POST from an allowed guest page is unrun, but the missing guard is certain. — severity: keep (P2; no data exposed). Overlaps F-crear-sesion-4 (guard part): this file owns the guard, 06 keeps the input-bounds part. Fix must also cover `duplicateSession`, as stated; no invariant bent (completes guest scope).
F-04-2 — CONFIRMED — creators are outside `run()`; NewSessionForm.tsx:495-533 awaits them in `start(async ...)` with no try/catch (only `useActionFeedback` is imported, :267); no beforeunload, localStorage or popstate anywhere in the file; the redirect at sessions.ts:381 uses an unwhitelisted `input.locale`. Boundary behaviour on a throw still needs a dev check. — severity: keep (P2). duplicate of F-crear-sesion-1 (and F-crear-sesion-6 for the draft part): 06 should own it; keep only the locale whitelist and draft/back guard here.
F-04-3 — PLAUSIBLE — Toast.tsx:110-117 does toast `unknown` on any non-redirect throw and ExpressForm.tsx has no connectivity check. Whether a failed fetch inside a server action throws or hangs offline needs airplane mode on a device. — severity: keep (P2).
F-04-4 — CONFIRMED — NewSessionForm.tsx:274 `useState(2)`, label "Tazas por café" at messages/es.json:140, penalties gated by `cupsPerSample >= 5` (lib/scoring.ts:209), no hint found. — severity: keep (P2). duplicate of F-crear-sesion-5: 06 owns it (the wizard field). The fix only changes default and copy; scoring invariant intact.
F-04-5 (P3) — no duplicate or citation problem spotted.
