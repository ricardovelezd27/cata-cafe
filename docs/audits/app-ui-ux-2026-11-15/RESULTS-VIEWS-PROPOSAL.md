# Results: two views, nothing said twice (OR-D, phase 1: proposal, no code)

Source: Ricardo's owner review of 2026-11-21, Message 5, verbatim in
`owner-review-2026-11-21/REVIEW.md`, with pictures 17 to 21. His answer of the same day:

> "If it is the same info but from different perspectives then create a different view type. You may view by coffee (then has a layout) or by cupper (then another layout) but the info is the same. Just not redundant in one view."

Binding rules: `docs/design-system/OVERENGINEERING-LOG.md` (2026-11-21 entries), `DESIGN.md`,
`RESULTS-DESIGN.md`. Nothing here is built until Ricardo approves it.

## Already decided by Ricardo (kept exactly)

1. "Aprendizajes" is removed.
2. **One general reflection per tasting**, not one per coffee. The list under Aprendizajes and the note editor on each coffee's sheet go.
3. **"Each coffee" and its switch are removed.** "Compare" stays.
4. **Compare:** the wheel sits over the same dim family shades as the small wheels (picture 19), with the territories laid over it. On desktop the table sits **beside** the wheel, in two columns like the two top boxes (picture 20).
5. **Order:** the two boxes of picture 20, then "Coffee by coffee", then Compare.
6. **"No clear difference":** the **bar and its legend entry go**, because the log already holds that rule ("no 'joins samples with no clear difference' bar"). **The chips and the sentence are left as they are, waiting on Ricardo** (question 2).

## 1. Inventory: what the Results tab shows today, and where the same data appears again

Tab "Resultados" (for both the participant and the organizer), plus the Panel tab where it repeats it.

| # | Piece | What it shows | Who sees it | Same data also at |
|---|---|---|---|---|
| A | Box "Primera del ranking" | the first coffee's score, its wheel, the families "most found", the no-clear-difference sentence | everyone | **card 1** (the same score and wheel; card 1's descriptor list is the finer level of the same picks); the ranking box (the same score) |
| B | Box "Ranking" | every coffee's score on one fixed 58 to 100 scale, the reader's ring, "n de N incluidos", the no-clear-difference bar and legend | everyone | **every card's score**; Panel matrix, "Grupo" row (organizer) |
| C | "El sabor de cada café", **Each coffee** | one small wheel per coffee and its top families | everyone (with wheel formats) | **every card's wheel** (the same wheel, same coffee) |
| D | Same tile, **Compare** | two or three coffees laid over one wheel, plus a table of counts | everyone, after the close | the cards' wheels (the same counts, compared) |
| E | "Tú y el panel" | above the group on k of m coffees, the mean difference, the reader's alignment | participant of a closed group | Panel alignment (the same measure, for every cupper; organizer) |
| F | "Referencia" tile | the reference's score and hint | sessions with a reference | **the reference card** in Coffee by coffee (the same score) |
| G | "Quiénes cataron" | joined · sent · included · excluded | group sessions | Box B ("n de N incluidos" per coffee); Panel "who counts" line ("k of N included") |
| H | "Tazas con defecto" | defective cups per coffee | when there were defects | each coffee's **sheet** (section 5, defective cups by type) |
| I | "Pendiente en el panel" | late evaluations and notes waiting | organizer | the Panel itself |
| J | "Café por café" cards | per coffee: place, label, score, no-clear-difference chip, wheel, what you marked, "Ver detalle" | everyone | A, B, C (see above) |
| K | "Aprendizajes" | rule-made sentences | closed sessions | (removed by Ricardo) |
| L | "Reflexión" | one note editor per coffee | closed sessions | the same editor on each sheet (removed by Ricardo: becomes one general reflection) |
| P | Panel tab | late evaluations, the cupper × coffee matrix, who counts, notes after the close, the alignment | organizer, admin lens | the matrix's "Grupo" row = B and the card scores (another view: allowed) |

## 2. The views: one perspective each, one layout each

Two views, named by their perspective, **for the organizer and the admin lens only**: the same people who have today's "Resultados | Panel" tabs. The switch replaces those tabs and is the same `PillTabs`, which P5a made real tabs: one Tab stop, arrow keys, the selected tab marked with a tone and a weight, never the action fill. A participant has one view, "Por café", and no tab bar, as today.

| View | Perspective | Who | Layout |
|---|---|---|---|
| **Por café** (By coffee) | each coffee: its score, its flavour, the coffees side by side | everyone | Ricardo's order: two boxes → Coffee by coffee → Compare; then the small facts that repeat nothing (Tú y el panel, Quiénes cataron, Tazas con defecto) and the general reflection |
| **Por catador** (By cupper) | each cupper against the group | the organizer and the admin lens | today's Panel, in its order |

**What moves, what goes** (no information is lost: each removed piece is still shown once in a view):

| Piece | Decision | Why |
|---|---|---|
| C, "Each coffee" | **removed** (Ricardo) | the same wheels as the cards |
| E, "Tú y el panel" | **stays in "Por café"**, after Compare | it repeats nothing in the participant's view (participants never see the Panel) |
| F, "Referencia" tile | **removed** | the reference's card in Coffee by coffee shows the same score; the card stays first, "Fuera del ranking" |
| G, "Quiénes cataron" | **stays, without the "included" count** | "n de N incluidos" is already on every ranking row; "joined", "sent" and "excluded" appear nowhere else |
| H, "Tazas con defecto" | **stays** | it repeats nothing in the view (the coffee's sheet is a separate dialog, opened on demand) |
| J, the score on each card | **removed** (the log's rule: never twice in one view) | box B prints every score on one shared scale; a card keeps its place, label, wheel, what you marked and "Ver detalle" |
| I, "Pendiente en el panel" | **becomes the count on the "Por catador" tab** (the badge `PillTabs` already draws) | the tile pointed at the other view; the count says the same thing in the switch |
| K, L | removed / one general reflection (Ricardo) | |
| A vs card 1 | **question 1** | box A repeats card 1's wheel and families; Ricardo chose both box A and the cards, so the choice is his |

## 3. Mockups (low-fi)

### "Por café", desktop 1440

```
 Session 2                                                        [Exportar]
 Resultados · 30 may 2026 · Cata cerrada 14/09
 ┌ Por café ┐  Por catador ·2                                     ← tabs: organizer and admin lens only
 ─────────────────────────────────────────────────────────────────────────────
 ┌──────────────────────────────┐ ┌──────────────────────────────────────────┐
 │ Primera del ranking          │ │ Ranking del panel                        │
 │ Muestra D                    │ │ 58          79                 100        │
 │ 83.50            (wheel)     │ │ 1 Muestra D ────────●──○──────  83.50    │
 │ tu puntaje                   │ │ 2 Muestra C ────────●○────────  83.00    │
 │ Lo más encontrado            │ │ 3 Muestra B ───────●──○───────  82.25    │
 │ ● Floral ▬▬▬▬▬ 1 de 1        │ │ 4 Muestra A ───────●○─────────  81.75    │
 │ ● Frutal ▬▬▬▬▬ 1 de 1        │ │ ○ tú                                     │
 └──────────────────────────────┘ └──────────────────────────────────────────┘
 Café por café
 ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
 │1 Muestra D│ │2 Muestra C│ │3 Muestra B│ │4 Muestra A│   (reference card first
 │  (wheel)  │ │  (wheel)  │ │  (wheel)  │ │  (wheel)  │    when there is one;
 │           │ │           │ │           │ │           │    no score: box B has it)
 │ Lo que    │ │ …         │ │          │ │          │
 │ marcaste  │ │           │ │          │ │          │
 │ Ver detalle›│ …        │ │          │ │          │
 └──────────┘ └──────────┘ └──────────┘ └──────────┘
 Comparar
 (D Muestra D) (C Muestra C) (B Muestra B) (A Muestra A)       ← pick 2 or 3
 ┌──────────────────────────────┐ ┌──────────────────────────────────────────┐
 │   wheel: dim family shades   │ │ Familia          D        C              │
 │   (picture 19) with the D    │ │                  de 1     de 1           │
 │   and C territories laid     │ │ ● Floral         1        0              │
 │   over it, letters on them   │ │ ● Frutal         1        1              │
 │                              │ │ ● Verde/Vegetal  1        0  …           │
 └──────────────────────────────┘ └──────────────────────────────────────────┘
 ┌ Tú y el panel ─────┐ ┌ Quiénes cataron ───┐ ┌ Tazas con defecto ──┐
 │ (participant only) │ │ 11 se unieron ·    │ │ (only when there    │
 │                    │ │ 11 enviaron ·      │ │  were defects)      │
 └────────────────────┘ └ 3 excluidos ───────┘ └─────────────────────┘
 Tu reflexión sobre esta cata
 [ one text area, up to 500 characters ]            La leen tú y quien organizó.
```

### "Por café", phone 375

```
 Session 2                     [Exportar]
 ┌Por café┐ Por catador ·2
 ┌───────────────────────────┐
 │ Primera del ranking       │
 │ Muestra D                 │
 │ 83.50                     │
 │ (wheel, full width)       │
 │ Lo más encontrado …       │
 └───────────────────────────┘
 ┌───────────────────────────┐
 │ Ranking del panel         │
 │ 58      79          100   │
 │ 1 Muestra D ──●─○── 83.50 │
 │ 2 Muestra C ──●○─── 83.00 │
 │ …                         │
 └───────────────────────────┘
 Café por café
 [ card 1 ][ card 2 ][ ca…     ← the existing sideways row (deliberate)
  ① ② ③ ④                      ← numbered steps
 Comparar
 (D)(C)(B)(A)                   ← chips wrap
 ┌───────────────────────────┐
 │ wheel with shades + D, C  │
 └───────────────────────────┘
 Familia      D     C           ← table under the wheel
 ● Floral     1     0
 …
 Tú y el panel · Quiénes cataron · Tazas con defecto   ← stacked, one column
 Tu reflexión sobre esta cata
 [ text area ]
```

### "Por catador", organizer, desktop 1440 (today's Panel, unchanged in order)

```
 ┌ Por café ┐  Por catador ·2  (selected)
 Evaluaciones recibidas tarde        (when there are any)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ Catador 10 · Muestra B   Guardada antes del cierre        [Incluir]       │
 └──────────────────────────────────────────────────────────────────────────┘
 Análisis por catador (i)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │            Muestra D  Muestra C  Muestra B  Muestra A                     │
 │ Grupo        84.50      83.75      …                                      │
 │ DE            4.7        3.1       …                                      │
 │ Catador 10   83.00      ▲ 89.50    …                                      │
 │ …                                                                         │
 └──────────────────────────────────────────────────────────────────────────┘
 Quién cuenta: 8 de 11 incluidos   [switches per cupper]
 Reflexiones después del cierre     (one block: each cupper's text)
 Alineación (por café filter)       (one neutral bar per cupper)
```

On a phone the matrix keeps today's layout: one coffee at a time with its picker, and the cuppers as a list.

## 4. Data-visualization and phone practice applied

- **What goes first:** the answer to "which coffee came first, and how far ahead" (box A), then all scores on **one shared, fixed scale** (box B, 58 to 100, 79 marked).
- **One number per question:** each box has one headline number. The cards carry no score; box B gives every score on one scale.
- **Comparison on a shared scale:** Compare draws every territory over the same shaded wheel and gives the exact counts in the table beside it. The letters sit on the drawing (direct labels), so the line legend under today's wheel is not needed. **It is removed:** the table's header carries the same letter and name.
- **No legend nobody reads:** the only legend left is the ranking's "tú" ring. The no-clear-difference bar and its legend entry go (log rule).
- **Distinguishable buttons:** every "(i)" (`InfoHint`) follows the button and state rule that OR-B is writing into `DESIGN.md`. Nothing else is added to it.
- **Phone, 375 px:** one column. The only sideways row is the existing Coffee by coffee row, with numbered steps. The Compare table has at most three count columns, so it fits without sideways scroll. The organizer's view switch is one Tab stop with arrow keys (P5a).
- **The view sits in the address:** the existing `?tab=` (P5a) names the view, so a reload, "back" and a language switch keep it. No new key.

## 5. The general reflection: what it needs (nothing built)

Today the note after the close is stored per evaluation (`Evaluation.postCloseNote`), so it is per coffee. One reflection per tasting and person needs **a schema change and a migration**:

- **Where it can live:** solo and express sessions create no `SessionParticipant` row for their owner, so it cannot go on that table without adding rows. The smallest place is **one new table**: session id, person id, text up to 500 characters, a date, one row per session and person.
- **What a new table brings with it:**
  - a migration, which Ricardo runs;
  - a SQL phase keeping it private: read by the person and the session's organizer, never through the API roles, like PHASE 27;
  - entries in the account-deletion manifest and in the guest merge;
  - a test.
- **The old per-coffee notes stay stored and are shown as they are** in the organizer's one notes block, for the tastings that have them. A tasting has either the old notes or the new reflection, never both: a session closed before the change keeps its per-coffee notes read-only and gets no reflection editor; a session closed after it has only the reflection. So the block never shows two lists.

## 6. The critic's verdict

The `overengineering-critic` (Opus) reviewed this proposal against REVIEW.md, the log and DESIGN.md. It ran three rounds:
- **First round: CHANGE, 8 findings, all applied.** The no-clear-difference bar is removed by the log. The card scores repeated box B. No tab for participants. "Tazas con defecto" and the "joined / sent" counts were kept, because they repeat nothing. The notes block keeps one list. One line on the "(i)" button rule was added.
- **Second round: CHANGE, 2 wording fixes, both applied.** The mockup note on who gets tabs was corrected. Section 5 now says why the old notes and the new reflection never meet.
- **What it confirmed:** Ricardo's decided items are kept exactly, nothing appears twice in one view, and both questions are his to answer.

## 7. Questions for Ricardo (one word each, recommendation first)

1. **Box A's wheel?** Box A repeats card 1's wheel and "Lo más encontrado". "Yes, remove them from box A" (recommended): the box keeps the coffee's name and score. "No" keeps them, and then card 1 should lose its wheel.
2. **The "no clear difference" chips and sentence?** "Remove" (recommended), like the bar; or "Keep".
