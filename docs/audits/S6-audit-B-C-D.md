# S6 pre-production audit: Streams B, C, D

Scope: `C:\projects\cata-cafe\.claude\worktrees\s6-integration` (branch `s6-integration`, HEAD 9ad9a91 = origin/main + held PRs), plus PR #45 (B6) and PR #39 (D4) read from `gh pr diff`. Read-only: no dev server, no DB writes, no git writes.

Checks run: `npx tsc --noEmit` clean; `npm test` 25 files / 210 tests green; es/en key parity script: 1308/1308 keys, placeholders match, no `invalid_warmup` key anywhere. D4 behaviour was measured by running the PR's `flavorSearch.ts` + `flavorSynonyms.ts` copies against the repo's wheel from a scratch dir (nothing committed).

## Verdicts

| Area | Verdict | Why |
|---|---|---|
| B1 content (Spanish fidelity) | GO | All 5 exercises match Kim's md step by step; every 15 s / 3 s / 7 s / 30 s number, posture, "observa" bullet and the shared texts are present. |
| B2/B3 player + figures + routes | GO with fixes | No state-machine or timer defect found. Several figure/text mismatches (B-3 to B-7) are MEDIUM and should be fixed or shown to Kim before launch. |
| B6 (#45) | CONDITIONAL GO | Code is sound. The migration must be applied BEFORE the deploy (B-1). |
| C1-C3 (on main) | GO with fixes | Real-iOS keyboard behaviour is unverified (C-1); edit-form date vs server validation disagree for west-of-UTC users (C-2); clearing closesAt on an async session strands participants in the waiting room (C-3). |
| D1-D3 (on main) | GO with one HIGH | The "Agregar «palabra»..." row is unreachable for words like "lulo" and "mango" on main (D-1). |
| D4 (#39) | NO-GO as is | Token and prefix dictionary hits outrank exact wheel matches ("nuez moscada", "plátano deshidratado"); Kim has not reviewed it. |

## Findings, severity-sorted

No BLOCKER in code that is already on main.

| ID | Sev | Area | Finding | Evidence | Fix |
|---|---|---|---|---|---|
| B-1 | HIGH (release ordering) | B6 | PR #45 adds `CuppingSession.warmupExerciseId`. The regenerated client lists the column in every `cuppingSession` read that has no `select` (cup page, edit page, results, waiting, crons). If the code ships before the migration, those pages 500. `.env.local` is prod, so the migration can safely run first (nullable `ADD COLUMN`, no default). | `prisma/migrations/20261020120000_session_warmup_exercise/migration.sql`; `schema.prisma` hunk; `S6-B.md` HANDOVER entry | Run `prisma migrate deploy` first, check the column exists, then merge and deploy B6. Add it to the release checklist. |
| D-1 | HIGH | D3 (main) | "Agregar «palabra»..." shows only when `results.length === 0`. Fuzzy search returns junk for unknown words, so the row never appears. Measured on main's `searchFlavors`: `lulo` returns only `chemical:skunky (fuzzy)`; `mango` returns `chemical:bitter` and `dark_chocolate (fuzzy)`. The headline example from the S6 prompt cannot trigger the new flow. | `components/cupping/FlavorPicker.tsx:245` (`showGeneric`) | Append the file-under row whenever the best hit is `fuzzy`, or whenever the query is 3+ chars and no exact/prefix/synonym hit exists. Simplest: always add it as the last row. |
| D-2 | HIGH (D4 only) | D4 (#39) | Dictionary token hits (rank -0.5) and prefix hits (2.6) outrank exact wheel matches. Measured: `nuez moscada` gives nutty first, nutmeg second (before: nutmeg only); `plátano deshidratado` gives "Otra fruta" first (before: "Fruta deshidratada", Kim's own example); `ciruela pasa` gives the fresh-fruit bucket first, prune second; `mantequilla` gives butyric (a defect); `pan` gives panela and honey. `nuezmoscada` in the dictionary is a typo for "nuez moscada". | PR #39 `lib/flavorSearch.ts` hunk (`dictHit(lookupSynonym(tk), -0.5)`); `lib/flavorSynonyms.ts` | Apply token and prefix dictionary hits only when no exact, prefix or synonym wheel hit exists for the whole phrase, or rank them at 3.5 or worse. Drop prefix hits on multi-word terms. Fix the typo. |
| D-3 | MEDIUM | D4 | `addById` now keeps the typed word as a note for every `dictionary` hit, including plain plurals and variants (`uvas`, `limones`, `frutilla`, and `piña` gives chip "Piña Ananas «piña»"). Roll-up notes get polluted. | PR #39 `FlavorPicker.tsx` hunk | Attach a note only when the target is a generic bucket (`other_fruit`, `brown_spice`, `fruity:berry`, ...) or the typed word is not a variant of the node label. |
| D-4 | MEDIUM | D4 | Dictionary conflicts with wheel synonyms: `ciruela` is a wheel synonym of prune but maps to `other_fruit` in the dictionary. 25 terms are redundant with wheel synonyms (dead data). The shadow test checks labels only. Kim to confirm: damasco to peach, uchuva to berry, ginger/cardamom to brown_spice, banana to other_fruit. | scratch run of PR dictionary vs `FLAVOR_WHEEL` | Extend the shadow test to wheel synonyms, delete the redundant terms, and get Kim's sign-off. |
| B-3 | MEDIUM | B figures | Eyes steps 4-6 (left/up/down) put out + hold + return inside 18 s. The keyframes use 45.45 % / 54.55 %, so the eye goes out in 8.2 s, holds 1.6 s and returns in 8.2 s. That contradicts the 15 s legs and the 3 s hold (step 2 takes 18 s out; step 3 takes 10 s back). | `lib/warmup/exercises.ts:317-342` (`LEG+HOLD`, `returns:true`); `components/warmup/figures/figures.module.css:75-92` | Set `durationSec: ROUND_TRIP` (33 s) for eyes-4/5/6. The percentages only hold at 33 s. The ES text keeps "Para tres segundos". |
| B-4 | MEDIUM | B figures | Lead markers are static. They are drawn outside the moving group at the neutral position, so the "punto de arranque" cues (head/shoulders in exercise 4, ear/shoulder/hip in exercise 5) stay behind while the body moves 22 units or 16 degrees. Head-rotate-6 says "oreja IZQUIERDA va hacia delante", but the marker sits on the viewer's right ear (150,60). Exercise 5's return leg ("vuelve iniciando con la oreja izquierda") never moves the marker. | `components/warmup/figures/Mannequin.tsx:227-250` (`leadMarkers`), rendered after the groups | Render lead markers inside the `upper`/`face` group so they travel with it. Mirror the ear marker for head-rotate-6. Optionally swap the marker side for the return leg. |
| B-5 | MEDIUM | B player | The figure during every `pause`, `observe` and `closing` phase is `NEUTRAL` (arm hanging). For the arm exercise the arm is up after steps 2 and 5, so during the 3 s pause the figure shows the arm down, then step 6 starts with the arm up ("Para arriba tres segundos"). The figure jumps. Step 3 ("rest") shows -95 degrees after step 2 ended at -160, and step 4 starts at -160 again. | `components/warmup/WarmupPlayer.tsx:81-87, 203-205`; `ArmRaiseFigure.tsx` cases "rest"/"center" | For a pause, render the previous step's end pose (static, `paused`). For arm "rest", use -160 degrees or the step 2 end pose. |
| B-6 | MEDIUM | B content UX | Kim's "Observa" bullets and the 15-second and progression explainers only appear after the last step (`observe` phase). They are guidance to attend to while moving. The intro shows only the safety rule and the stage chips. | `WarmupPlayer.tsx:299-324, 348-357` | Show "Observa" (and ideally the 15 s sentence) in the intro, keeping the end screen as a recap. |
| C-1 | MEDIUM (unverified) | C1 | `useKeyboardOpen` is logically sound, but iOS Safari behaviour is unverified (acknowledged as an open item). On iOS the layout viewport and `100dvh` do not shrink for the keyboard, so the `position:fixed` shell extends under it. The collapse only hides chrome; a bottom field depends on iOS auto-scroll. Also, the `focusout` handler sets `baseline = current()` while the keyboard is still animating down. If no later `resize` fires, the baseline stays low and the keyboard is never detected again. | `hooks/useKeyboardOpen.ts:44-50` (no-field branch); `components/ui/SessionShell.module.css:6-8` | Real-device check by Kim (iPhone Safari, Android Chrome). Set a `--vvh` custom property from `visualViewport.height` while the keyboard is open and size `.root` with it. Update `baseline` only on `resize` (not on `focusout`), or use `Math.max`. |
| C-2 | MEDIUM | C3 | The edit form uses `min={localDateString()}` (local date), but the server computes end of that day in UTC. For a user west of UTC in the evening (e.g. Chile after about 20:00), "today" is offered, then `planClosesAtChange` rejects it as `invalid_closes_at` (23:59:59Z has passed). The wizard uses the UTC date (`new Date().toISOString().slice(0,10)`), so the two forms disagree. | `app/[locale]/app/sessions/[id]/edit/EditSessionForm.tsx:345`; `sessions/new/NewSessionForm.tsx:1146`; `lib/sessionState.ts:72`; `lib/validate.ts:81` | Use one rule. Easiest: `min` = UTC date in both forms, with the hint saying so. Or accept dates `>= (UTC today - 1 day)`, since the cron closes on D+1 06:00Z anyway. |
| C-3 | MEDIUM | C3 | Clearing `closesAt` always sets `isAsync=false`. On a session created async, `startedAt` is null (only `startSession` sets it), so `sessionHref` sends participants to `/waiting`, and the owner must now press "Iniciar cata". The docs say only "closes manually". | `lib/sessionState.ts:62`; `lib/sessionRouting.ts:24`; `app/actions/sessions.ts:408` | When clearing a date on a session with `startedAt == null`, either keep `isAsync=true` or set `startedAt = now()` in the same update. |
| C-4 | MEDIUM | C2 | Re-pinning the new reference is right, but the previous reference keeps its pinned 79.00 rows with no marker. After the owner moves the reference, un-rescored cuppers leave fake 79.00 scores in that sample's average and ranking. | `lib/referenceRules.ts:64-68` ("never un-pinned"); `app/actions/sessions.ts:738-758` | Flag pinned-only rows on the old reference in results ("sin re-evaluar"), or exclude rows where `isReferencePinned` is true for non-reference samples. |
| D-5 | MEDIUM | D2 | The roll-up resolves `flavorNodeById(did)` without `migrateFlavorId`, while `ancestorsOf` migrates. A legacy or retired id gets no node and is silently skipped, so old sessions' roll-up is missing those picks even though the block ranking (`resolveDescriptor`) counts them. | `lib/resultsAggregation.ts:192` | `flavorNodeById(migrateFlavorId(did))` and add `node.id` from the migrated node. Add a test with a legacy id. |
| D-6 | MEDIUM | D3 | At `maxSelect`, non-selected pills are `disabled` via `wouldExceedLimit`, which ignores that re-filing out of "Otros" frees a slot (`fileWord` drops the emptied chip). A cupper at the limit cannot re-file, and `limitReached` is never shown because a disabled button fires no click. | `FlavorPicker.tsx:231-236, 587` vs `fileWord` | In file-under mode, compute the limit against the base value after removal. Do not disable; show `limitReached` on click. |
| D-7 | MEDIUM | D3 | `selectionWith` drops an ancestor chip's notes when a deeper node is picked. With "archivar bajo", words filed under an L2 vanish when the cupper later picks an L3 under it. | `FlavorPicker.tsx:203-216` (commit c64ee85 behaviour) | Move the pruned ancestors' notes onto the new deeper node instead of deleting them. |
| B-7 | LOW | B figures | Arm-raise-1 (fast "Sube... Bájalo") runs 2 iterations of up-down (the `fast && roundTrip` rule), but the text says once. Head-rotate-5/6/7 and trunk-side-4..7 end at the left extreme, then the next step's figure starts at centre. Eyes-2 (18 s linear) has no visible 3 s hold. | `components/warmup/figures/shared.ts:20-28`; `figures.module.css` | Set `iterations=1` for arm up-down. Add hold keyframes for eyes right. |
| B-8 | LOW | B copy | `invalid_warmup` has no `session.newForm.errors` entry, so a bad id shows the generic error. `player.doneBody` ("Vuelve a la cata...") shows in the library route too. | `messages/*.json` | Add the key in both languages. Pass a neutral done copy when not inside a session. |
| B-9 | LOW | B6 | The overlay opens for returning cuppers who already have evaluations, if the owner adds a warm-up mid-session (hint says "before the first sample"). Closed is checked, evaluations are not. In `EditSessionForm` an obsolete stored id, toggled off then on, sends the stale id and gets `invalid_warmup`. The `Select` is not disabled when `closed`. | `components/session-moments/WarmupMoment.tsx`; `CupClient.tsx:1896-1903`; PR #45 `EditSessionForm.tsx` | Gate on "no evaluation yet" or accept it. Reset `warmupId` to the first exercise when toggling on with an unknown id. |
| B-10 | LOW | B CSS | At 320 px wide the controls row needs about 306 px of 280 px; the icon buttons can squash. No overflow at 390 px. EN strings fit (stage label, "Next"). Landscape phones use the two-column layout with a scrolling body. | `WarmupPlayer.module.css` `.controls` | `flex-shrink:0` on `.iconBtn`; wrap `.controls` below 340 px. |
| B-11 | LOW | B a11y | The aria-live text region repeats the step text while the SVG `<title>` also carries it (double read). | `WarmupPlayer.tsx:231-263` | Drop `title` from the figure when the live region is present. |
| C-5 | LOW | C2 | `assertSessionWritable` runs before the transaction, so a concurrent close can slip a reference change onto a closed session. The 15 s tx timeout can exceed a short function limit; this action has no `maxDuration`. | `app/actions/sessions.ts:716, 758` | Re-check status inside the tx; set `maxDuration` on the edit and cup pages. |
| D-8 | LOW | D1 | The hide-singles control is a one-item `PillTabs` (`role=tab`) used as a toggle, so it is not announced as a switch. Group bars now show 1-person descriptors by default (was hidden), which changes the anonymity posture; the `descEmptyAll` copy says "2 or more", which is now inaccurate. | `results/DescriptoresTab.tsx:178-186`; `docs/notes/S6-D.md` (PR #39) | Use an `aria-pressed` button. Fix the copy. Confirm the default with Kim. |
| D-9 | LOW | D2 | `ancestorsOf` is a copy of the walk in `cvaFormData.buildFlavorGroups` (not deduplicated, as noted in `S6-D.md`). Roll-up note dedupe is exact-string within a cupper, then lowercase across cuppers. | `lib/descriptors.ts`, `lib/pdf/cvaFormData.ts` | Switch `buildFlavorGroups` to the helper later. |
| D-10 | LOW | D3 | The file-under hint says "grupo o subgrupo", but L1 is navigation-only (`selectable = level >= 2`), so only L2/L3 are valid targets. | `FlavorPicker.tsx` `fileUnderHint`, line ~586 | Reword to "subgrupo". |

## B: warm-ups detail

1. **Content fidelity (ES vs Kim's md): PASS.** Compared all 5 exercises, step by step:
   - Ex1: steps 1-6, 15 s legs, "tres segundos", the "punto de apoyo" sentence, 3 observe bullets, "3 minutos".
   - Ex2: 7 steps, "tres segundos" on the right and left, "Para." on up/down, curved quotes around "hacia atrás", 2 bullets, 5 min.
   - Ex3: 8 steps including the 7 s return twice, the nose and ear cues, 2 bullets, 7 min.
   - Ex4: 8 steps including the "un centímetro" step, 3 bullets, 8 min.
   - Ex5: 8 steps including "pasando por el centro", 3 bullets (heat in the hands), 8 min.
   - Safety rule, "Los 15 segundos", "La evolución" and the two closing questions are verbatim. The 30 s closing is `WARMUP_CLOSING_HOLD_SEC`. The 3 s stillness between steps is the player's addition (`WARMUP_STEP_PAUSE_SEC`).
   - `durationMin` (3/5/7/8/8) matches Kim. Player time (steps + 3 s pauses + 30 s) sits inside that budget for all five; `tests/warmup.test.ts` enforces it.
   - EN is a draft (`WARMUP_EN_STATUS = "draft-pending-kim"`). Not a defect.
2. **State machine.**
   - Transitions (`intro, step, pause, ..., observe, closing, done`) are correct. `goPrev` from the first step returns to the intro; from `pause` it returns to the step just finished; from `observe` to the last step. `goNext` at `done` is a no-op.
   - Skip, Escape and X all call `onSkip`. `isLast` swaps Next for Finish.
   - Pause and resume: the user pause resets per phase by design. A hidden tab pauses the countdown and the figure (`paused` includes `hiddenPaused`) and resumes.
   - Reduced motion: no auto-advance, countdown still visible, figures static with an arrow.
   - Figure remounts per step via `key={step.id}`, so every animation restarts from neutral.
   - Keyboard: left/right/space/Esc. A focused button or link keeps Space and Enter. Form fields are ignored.
3. **Timer.**
   - `useCountdown` measures wall-clock `Date.now()` deltas, so there is no drift.
   - One run-loop effect owns rAF (cancelled before re-arming), a completion timeout and a 250 ms interval fallback. Cleanup clears all three and banks elapsed time; no leak on unmount mid-countdown.
   - `finished` guards a double `onComplete`.
   - The resetKey-in-render pattern restarts the countdown per phase; the accumulated time is tagged with its key.
4. **Figures and CSS.**
   - `--warmup-duration`, `--warmup-delay`, `--warmup-iterations`, `--warmup-ease` and `--warmup-amp` are set inline on the `<svg>` by `timingStyle` and consumed by `.anim`.
   - One iteration (2 for "fast" round trips) with `fill-mode: both`; the 3 s `holdBeforeSec` is realised as `animation-delay` (the `from` frame is shown during it, correct for arm-raise-6).
   - The reduced-motion media rule is present (`.anim, .breathe, .lead { animation:none }`), plus the JS static end pose.
   - Mirror semantics are documented: "derecha" moves to the viewer's right. Directions map as follows:
     - Eyes: right/left/up/down move the pupils on the correct axis; left/up/down return to centre.
     - Head: right-left slides the features by 13 with a hold between.
     - Trunk forward/back: clockwise rotation in the profile view (forward = right).
     - Trunk side: translation by 22.
     - Arm: up/down on the right arm.
   - Mismatches are listed in B-3, B-4, B-5, B-7. "Ojos cerrados" is visibly different (closed lids plus ghost pupils; the face crop uses a thinner stroke).
5. **Routing.**
   - `/app/warmup` exports `generateStaticParams` (locale is its only dynamic segment; OK).
   - `/app/warmup/[slug]` is `force-dynamic` with no `generateStaticParams`; unknown slugs return `notFound()`.
   - `dev-player`, `dev-figures` and `dev-moment` call `notFound()` when `NODE_ENV === "production"`, before reading any data. Their folder names win over `[slug]`.
   - `isGuestAllowedPath` allows `/app/warmup(/|$)` and rejects `/app/warmups`; the test covers it. The dashboard card is a plain `Link`, which is correct because the route is guest-reachable. A client figure imported into the server dashboard page works.
6. **B6 (#45).**
   - Validation: `parseWarmupId` uses `v.oneOf(..., WARMUP_IDS)` (mapped to `invalid_warmup`) in create, group-create and update; `updateSession` sends the field only when changed; `duplicateSession` copies it.
   - Wiring: `cup/page.tsx` passes `warmup` to `CupClient`, which mounts `WarmupMoment` as a sibling of the shell. It shows once per (kind, session) per device through the `useSyncExternalStore` seen-set; the server snapshot is "seen", so there is no SSR flash.
   - An exercise id removed from code makes `warmupById` null, `WarmupMoment` returns null and the cup page does not crash.
   - The focus-trap change depends on `[open, onDismiss]`; `dismiss` is a stable `useCallback`, so no focus thrash.
   - The migration is a single nullable `ADD COLUMN`. See B-1 for ordering.
7. **Mobile and desktop (read from CSS).**
   - Below md, `.root` is `position:fixed; inset:0; height:100dvh; z-index:60`. `.inner` pads the top with the safe-area inset. The figure column is `flex:0 0 42dvh`. Controls are docked with `calc(12px + env(safe-area-inset-bottom))` padding, as in `CanvasFooter`.
   - At 390x844 the figure box is about 280 px tall (about 210 px wide), and the body scrolls.
   - At md and above: two columns, 1100 px max, figure 44 % and sticky, and `.inline` lays out in flow with `min-height:620px`. Below md the library route is also full-screen, so the back link is hidden by design; X leaves.
   - Only issue found: B-10 (320 px wide).
   - All CSS custom properties used exist in `app/globals.css`. No hex literals in `components/warmup/**` or `app/[locale]/app/warmup/**`.

## C: cup chrome and hygiene detail

- `SessionShell`: the collapsed rule hides `mobileBarSlot`, `detailsToggle` and `mobileDetails` at max-width 640 px and the topBar at max-width 1023 px. The hamburger row stays. The max-width 640 vs "<640" wording differs by 1 px; harmless.
- `CanvasFooter`: `max(10px, env(safe-area-inset-bottom))` up to 640 px, and 12 px plus the inset above. `viewportFit:"cover"` is set in `app/layout.tsx`. The column-flex fix at max-width 1023 px (`canvasInner flex:1 0 auto`) is sound.
- `setReferenceSample` (`app/actions/sessions.ts:708-773`):
  - Auth and guards: `requireUser`, `requireSessionOwner`, `assertSessionWritable`, and a same-session `findFirst({id, sessionId})`.
  - The pointer move and the re-pin run in one `$transaction` with `timeout: 15000`.
  - `isDraft` is echoed into SET by `planReferenceRepin`, which re-fires the aggregate trigger for submitted rows.
  - Descriptive-only returns before the loop (`isPinnedModule` false).
  - Rows already pinned are skipped; combined and affective are handled.
  - Residual points: C-4, C-5.
- `planClosesAtChange` matrix: group-only rule, past date, "today", equal-to-stored no-op, clear, and closed session are all handled correctly. The unchanged compare uses the UTC slice and matches what the edit page shows. Timezone edge: C-2. Clearing side effect: C-3.
- `EditSessionForm` sends `closesAt` only when changed, and sends the group fields only for group sessions. It disables save when closed. Name, date, objective and groupId are always re-posted (harmless; groupId is re-validated server side).

## D: descriptors detail

- **Additivity.**
  - `blocks` and `summary` are unchanged; `stages` and `rollup` are optional new keys.
  - `closeEmail`, the `lib/reports/*` types and the PDFs only read known block ids; the tests pass (including `closeEmail`, `reports`, `rollup`, `wordCloud`).
  - `rollup` covers "desc" blocks plus "general" and has no "gusto" entry (the UI must tolerate that).
- **`buildFlavorCloud`.**
  - Stage mentions are summed (fragancia 1 + aroma 1 = 2); entries merge on a case-insensitive label key; `capWords` defaults to 30.
  - `sharedLabelKeys` uses per-cupper-deduped `blocks` counts. By design a word named by two cuppers on different samples is still "single" per sample.
  - Merge by label can merge across families (taste "Dulce" vs a wheel node of the same name); acceptable.
- **Toggle persistence.** `cata_results_hide_singles` is read through `useSyncExternalStore` (server snapshot false, storage event for other tabs, try/catch around storage); hidden for solo sessions. See D-8.
- **`ancestorsOf`.** Correct for L1 (empty), L2 (L1), L3 (L1, L2), unknown and CATA ids (empty), retired ids (migrated first) and `unmapped:x` (folds to "other"). The roll-up adds the node itself for L1 and L2 only, so an L3 is counted at L1 and L2 and an L2 at L1 and L2. See D-5.
- **FlavorPicker.**
  - Stored shape `<stage>_desc` and `<stage>_desc_notes[nodeId]` is unchanged and written atomically in one `onChange`. `DescriptiveForm` and `CombinedForm` are untouched, and the offline store reads the same blob.
  - Re-filing moves the note and drops an emptied chip; "Ninguna encaja" files under "Otros"; the nudge counts words in "other" and "fruity:other_fruit".
  - Issues: D-1, D-6, D-7, D-10.
- **D4 dictionary (static checks).**
  - Every target id exists (111 wheel nodes) and no L1 is targeted.
  - No duplicate folded terms. No term equals a node label.
  - 25 terms duplicate wheel synonyms, and `ciruela` conflicts with one (D-4).
  - Ranking problems: D-2, D-3.

## Hygiene checks

- **es/en parity.** Equal key sets and equal placeholders on the integration checkout. No identical untranslated `warmup.*` or `results.help.*` strings. `invalid_warmup` is not present in either language (B-8).
- **Hex literals.** None in the files touched by B, C or D. `FlavorPicker` still uses legacy alias classes (`brown-*`, `green-*`) in old lines; the D3 additions use MD3 tokens.
- **`useTranslations` in client components.** None. `playerStrings.ts` mentions it only in a comment.
- **New `"use server"` exports.** None in B, C or D on the integration checkout. `parseWarmupId` in #45 is a non-exported helper. `setReferenceSample` and `updateSession` start with `requireUser()`.

## Suggested release order

1. Apply the B6 migration (B-1).
2. Fix D-1 (small, and it makes D3 usable) and, if time allows, B-3 and B-5.
3. Merge #45.
4. Hold #39 until D-2 and D-3 are fixed and Kim reviews the dictionary.
5. Ask Kim to check the keyboard behaviour on a real iPhone and Android (C-1) and the date picker in a west-of-UTC timezone (C-2).
