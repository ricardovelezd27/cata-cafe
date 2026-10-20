# S6 — Stream C notes (cup mobile chrome + session hygiene)

Paragraphs below are written for the lead to merge into `docs/flows.md` and
`CLAUDE.md` in the final S6 docs PR. Each checkpoint is one PR, stacked in
order: C1 → C2 → C3 → C4.

## CP-C1 — Phone cupping chrome (PR #30, `claude/s6-c1-cup-chrome`)

Measured at 390×844 in the browser preview, keyboard closed: **180.5px → 107px**
from the top of the viewport to the first form element (target ≤110).
Screenshots: `side-session-notes/local_a8b6fcec…/S6-C-screenshots/c1-*.jpg`.

### CLAUDE.md — add under "Styling" / app shell rules

- **Cup screen chrome on phones (<640px, S6 CP-C1):** `SessionShell` renders ONE
  header row — hamburger + `mobileBar` (the sample tabs and the `n/N` counter) +
  a chevron that opens `mobileDetails` in flow (session name, format · role,
  "N de M enviaron", reference context, the owner's "Editar muestra"). The
  hamburger still opens the drawer with `MasterControls` / identity / exit. The
  tablet range (640–1023) keeps the stepper + `mobileSampleBar`; desktop (`lg:`)
  keeps its top bar. The shell breakpoint stays 1024.
- **Keyboard collapse:** `hooks/useKeyboardOpen.ts` = a text field has focus AND
  `visualViewport.height` is ≥120px below `window.innerHeight`. `CupClient`
  passes it as `collapsed` and the shell hides the header row + top bar
  (phases) until blur. This is the cross-platform path — iOS Safari ignores
  `interactiveWidget`; `app/layout.tsx` still sets
  `interactiveWidget: "resizes-content"` for Android. Do not gate the collapse on
  resize alone: Safari's toolbar show/hide and pinch-zoom also resize the visual
  viewport.
- **Fixed shell height is `100dvh`** (with `100vh` + `inset:0` fallback).
  `.canvas` is a flex column and `.canvasInner` is `flex: 1 0 auto` so the sticky
  `CanvasFooter` is always at the bottom edge, even when the form is shorter than
  the viewport (that was the blank strip under the green button).
- **`CanvasFooter` phones:** `padding-bottom: max(10px, env(safe-area-inset-bottom))`.
  Keep `env(safe-area-inset-bottom)` and the gesture-zone comment; the extra 12px
  was the only thing removed. `PhaseStepper` has a `compact` prop (40px pills)
  used only by the phone instance.
- **Open item:** real-iOS check by Kim (Safari keyboard events + `100dvh`).

## CP-C2 — Re-pin the reference mid-session (`claude/s6-c2-repin`)

### CLAUDE.md — append to the "Reference Sample" PIN paragraph

- **RE-PIN (S6 CP-C2):** choosing a reference that already has evaluations is
  handled inside `setReferenceSample`'s `$transaction`: `planReferenceRepin`
  (`lib/referenceRules.ts`, pure, vitest-covered) takes every evaluation of the
  NEW reference (any cupper, draft or submitted) whose module JSON is not already
  `isReferencePinned`, applies `pinReferenceAffective` + `computeEvaluationDerived`
  exactly like a live save, and **echoes `isDraft` unchanged into SET** — the
  aggregate trigger is `AFTER INSERT OR UPDATE OF "isDraft" … WHEN NEW."isDraft" =
  false`, so naming the column is what re-fires `recompute_aggregate_score()` for
  submitted rows (verified live: `aggregate_scores.computedAt` advanced and the
  community score moved to 79.00). **This is the ONE sanctioned server-side
  rewrite of a submitted evaluation** (the 79.00 invariant wins over "submitted
  = frozen"); never add a second one. The previous reference is NOT un-pinned —
  its real scores were never stored — so cuppers re-score it; its client lock
  releases because `isCurrentLocked` derives from `referenceSampleId`. Client
  side, `CupClient` no longer skips the pinned "ensure" auto-save when an
  evaluation exists, and `applyReferenceOrder` clears the ensured-set entry for
  the new id so the next visit re-queues it (idempotent; the server pins anyway).
  Offline drafts need nothing: `syncEvaluation` pins by the session's current
  `referenceSampleId` on replay.

### docs/flows.md — §1 session lifecycle, reference box

Add a transition "owner re-picks reference (active session)" → `setReferenceSample`
→ transaction {pointer move, re-pin existing rows of the new reference with
`isDraft` echoed} → trigger recomputes `aggregate_scores` for the new reference →
realtime `cupping_sessions` UPDATE → every client re-orders tabs and locks the
new reference. Closed sessions: refused (`session_closed`).

## CP-C3 — Session hygiene (`claude/s6-c3-hygiene`)

### CLAUDE.md — "Session Lifecycle", replace the `closesAt` sentence "It cannot be edited after creation"

- **`closesAt` IS editable after creation (S6 CP-C3)** from `EditSessionForm`
  (group sessions only). `updateSession` first returns `session_closed` for a
  closed session (it keeps its own `{ ok, error }` shape, so the code is returned,
  not thrown) and then applies `planClosesAtChange` (`lib/sessionState.ts`, pure,
  vitest matrix): `"YYYY-MM-DD"` → END of that day UTC (same rule as the wizard,
  today is valid) and `isAsync = true` — allowed on a live session that already
  started, it just gains an automatic close; `""`/`null` → `closesAt = null`,
  `isAsync = false` (owner closes manually from then on) — allowed even with
  submitted cuppers; a past date → `invalid_closes_at`; solo → `not_group_session`.
  The edit page disables the save button and shows `edit.sessionClosed` on a
  closed session. The wizard hint no longer says "cannot be changed later".

### docs/flows.md — §1 lifecycle

Group: `closesAt` can be set/cleared while `status = active` via Edit session;
setting it flips `isAsync` on (no waiting room / "Iniciar cata" from then on),
clearing it flips `isAsync` off (manual close). Closed sessions refuse every
`updateSession` with `session_closed`.

Verified live on the throwaway session: set 2026-10-25 → `closesAt
2026-10-25T23:59:59.999Z`, `isAsync true`; cleared → `null` / `false`.

## CP-C4 — Realtime for added/renamed samples (pending)
