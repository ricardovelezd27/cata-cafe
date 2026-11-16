# Results: the design proposal (package R0)

> Part of the app UI/UX audit of 2026-11-15 (`REPORT.md`, `RESULTS-DIAGNOSIS.md`, `PLAN.md`,
> `DECISIONS.md` in this folder). A proposal and a mock: no app code was changed.
> It builds on what Ricardo decided on 2026-11-16 (decisions 4, 5, 6, 7, 11, 12, 13).
> **The mock:** `mock/index.html` in this folder (one file, invented data, Spanish). Open it in a
> browser; the dark bar at the top holds the controls (who looks, the session's state, the reference,
> the cover, the flavour drawing, the width) and is not part of the design. The same file is
> published as a private page for a phone: https://claude.ai/artifact/MMSXUKTdk281nAio4pnoBg
> Finding ids (`D-09`, ...) are those of `REPORT.md`.

## 0. Decided by Ricardo on 2026-11-16

| # | Choice | His answer | What it means here |
|---|---|---|---|
| 1 | The drawing that replaces the word cloud | "A with C counted list", and: "I am having trouble with the petals option when there are more than 2 coffees, then in the comparisson, the terrain metafor becomes better [...] So get a better way to represent B, as the comparisson layer. Maybe we keep the terrain one for comparison, or we layer them on top of the petals." | The wheel (A) for one coffee, C's counted list under it, and the terrain (B), redrawn, as the comparison layer. Section 6b. **One question is left open there.** |
| 2 | The colours of the flavour families | "b is fine, retune once, but align with the color wheel" | One palette, the flavour wheel's, for the wheel and the picker. Proposed values in section 6c. |
| 3 | A dark cover | "recommendation ok" | No cover now. |
| 4 | Coffee cards on a phone | "a" | A sideways row with numbered steps. |
| 5 | The space for reflection | "a" | The note after close that exists, one per coffee. No migration. |
| 6 | Two cuppers | "Reco is ok" | Quality values per attribute from two cuppers; intensities, shared descriptors, "Tú y el panel", learnings and "diferencia" from three. |
| 7 | "Sin diferencia clara" | "a" | One bar joining the neighbours. |
| 8 | The scale of the ranking | "a" | Fixed, 58 to 100. |
| 9 | The learnings | "ok" | The fourteen rules of section 7; their thresholds go on Kim's list as simulated. |
| 10 | The wording of the alignment | "ok" | As written. |

**Still open (one question):** the comparison layer is drawn in two places, and I recommend keeping
both: territories alone in the overview ("Comparar", up to three coffees, no coffee is the base), and
territories over the petals on a coffee's sheet ("Comparar con", up to two other coffees). Say if you
want only one of them.

## 0b. The ten choices as they were put

Each had options and a recommendation.

| # | Choice | Options | Recommendation |
|---|---|---|---|
| 1 | **The drawing that replaces the word cloud** (section 6) | **A** counted wheel · **B** terrain · **C** counted bars | **A**, with the counted list of C always under it on the coffee's sheet. B is the best at comparing two coffees but its curve between two families means nothing, and three territories turn into a blot. |
| 2 | **The colours of the flavour families** | (a) the nine tokens as they are · (b) retune them once, for the wheel and the picker together | **(b), as its own small package.** Four of the nine tokens are browns a few shades apart, "Ácido / Fermentado" is the same red as an error, and the picker uses a second, brighter palette (`lib/constants.ts`). Until then every petal carries its name and its number, so nothing depends on colour. |
| 3 | **A dark cover for a closed session** (section 9) | (a) no cover · (b) cover at every width · (c) cover from 768 px, paper header on phones | **(a) now.** If you want it: **(c)**. On a 375 x 667 phone the cover moves the first score from 372 px to 603 px down the screen, which is under the fold once the app's own bars are counted. |
| 4 | **Coffee cards on a phone** | (a) a sideways row with numbered steps · (b) a vertical list | **(a).** It is `DESIGN.md`'s rule for equal, optional cards, and the ranking tile above already lists every coffee top to bottom. |
| 5 | **The space for reflection** (section 8) | (a) the note after close that exists today, one per coffee, read by you and the organizer · (b) a new private note for the whole cupping (a migration) · (c) both | **(a) now.** (b) later if you want a private space: it is new data, and the migration is yours to run. |
| 6 | **Two cuppers: where the three-cupper minimum applies** | (a) as drawn: the group's value per quality attribute is visible with two (your decision 6); the group's intensities, the shared descriptors, "Tú y el panel", every learning and every "diferencia" need three · (b) one rule: everything from two | **(a)**, because it is what you said. It leaves one oddity for you to confirm: with two cuppers a person sees the group's dot for "Acidez" (quality) and not for the intensity of acidity. |
| 7 | **"Sin diferencia clara" in the ranking** | (a) one bar that joins the neighbours it applies to, explained once in the legend · (b) a badge on every row, as today | **(a).** On a real session six of seven rows carried the badge. The bar also says which neighbour. Cards and sheets keep the words. |
| 8 | **The scale of the ranking drawing** | (a) fixed 58 to 100 (58 = every attribute at 1, 79 = neutral, 100 = maximum) · (b) 0 to 100 | **(a).** One scale for every session, and the three numbers on it teach the score. A score under 58 (deductions) sits at the left edge with its number printed. |
| 9 | **The learnings** (section 7) | (a) the fourteen rules as written · (b) fewer · (c) none for now | **(a)**, capped at four sentences about the panel and five of your own. Every threshold is my proposal and goes on Kim's list as simulated. |
| 10 | **The wording of the participant's alignment** (decision 7) | "Coincidencia de descriptores: 21 de 34 (62 %). De los descriptores que eligió la mayoría del panel, los que también elegiste tú. No es una nota." | Accept, or give me your words. It is shown on one neutral bar, never as a grade. |

## 1. The page in one picture

One page, general to particular, for everyone. A participant has no tabs. The organizer has two:
"Resultados" (this page) and "Panel" (their working view, with names).

```
HEADER   session name · date · format · cups · "cerrada el"                 [Exportar]   (S1)
---------------------------------------------------------------------------------------------
1 LA CATA (tiles)        Primera del ranking | Ranking del panel (all coffees, one scale)
  one fact per tile      Tú y el panel       | El sabor de cada café (8 small wheels)
                         Referencia · Quiénes cataron · Tazas con defecto · (Pendiente)
2 CAFÉ POR CAFÉ          one card per coffee, in ranking order      -> its SHEET, one step away
3 APRENDIZAJES           sentences computed from the data, with their numbers
4 REFLEXIÓN              a note per coffee, after close
```

Measured on the mock: no sideways scroll at 375, 768 or 1440 px; no text under 11 px and no chart
text under 12 px; every control at least 44 px tall; on a 375 x 667 phone the first score is 372 px
down (today no score is in the first fold, `F-01`). The whole page is 4,878 px tall on a phone, of
which the tiles are about half; today's Gráfico view alone is 7,079 px.

## 2. The overview, tile by tile

Every tile has the same parts in the same order: a small label, the fact, one line of context, and
at most one drawing or one link. Tiles differ in size because their content does, not for emphasis.

| Tile | What it answers | For whom | What it shows | The rule it keeps |
|---|---|---|---|---|
| **Primera del ranking** | Which coffee did the panel put first, and how firmly? | everyone | "Muestra G", its name once revealed, `88.75 ± 2.9 · 7 de 8 incluidos`, "tú 90.75 · diferencia +2.00", Δ against the reference, and "sin diferencia clara con Muestra C (a 0.75)" when that is so | Ink only (decision 13). It names an order, not a quality. With fewer than 3 included cuppers there is no "first": the tile says why. |
| **Ranking del panel** | Where does every coffee stand, how spread was the panel, where am I? | everyone | One row per coffee on one fixed scale: a filled dot for the group, a ring for me, a whisker for ± the spread, a dashed line at the reference, a bar joining neighbours with no clear difference; the number printed at the end of the row | The score is named here, once for the page: "Puntaje Café Sensible (base CVA). 79 es el punto neutro y 100 el máximo." Numbers are ink; colour marks the series (group, mine) and shape repeats it. References are a line, not a row. |
| **El sabor de cada café** | What did the panel taste, coffee by coffee? | everyone, not in affective sessions | Eight small wheels in ranking order, each with its letter and its most found family ("G · Frutal 7"); a tap opens the coffee | Counts people, n in the caption. Colour on petals only. The same family is always at the same angle. |
| **Tú y el panel** | Was I above or below the group, and did I taste what the others tasted? | the participant, and an organizer who cupped | "5 de 7 muestras en las que puntuaste por encima del grupo · diferencia media −0.46"; "Coincidencia de descriptores 21 de 34 (62 %)" on one neutral bar | A difference in ink with its sign, never coloured (decision 5). Built from the viewer's own row only. Needs 3 included cuppers. |
| **Referencia fija / libre** | What is everything compared against? | everyone, when there is one | Fija: "Muestra E · 79.00 · es un ejercicio de Café Sensible, no del CVA · fuera del ranking". Libre: its average with ± and n, "todos la puntuaron como cualquier muestra" | "79.00" and "fija" only in anchor mode and never in a descriptive session (`referenceExplanation`). With several references the "Comparar con" choice lives in this tile. |
| **Quiénes cataron** | How many cupped, and how many count? | everyone | "7 de 8 incluidos", a row of nine dots (seven filled, one outlined, one dashed), "9 se unieron, 8 enviaron, 1 excluido" | A participant gets counts only. Said once, not three times. |
| **Tazas con defecto** | Was something wrong with a coffee? | everyone, only when there is one | "2 tazas · Muestra D · fenólico · marcadas por 2 de 7 catadores" | The error red appears here and nowhere else on the page. |
| **Pendiente en el panel** | Is there something I must act on? | the organizer | "1 evaluación tardía por decidir y 1 nota después del cierre" and a link to the Panel | Replaces the panel repeated on every tab. |

## 3. A coffee's card and its sheet

**The card** (one per coffee, the reference first and marked "fuera del ranking"): its place and
label, its name once revealed, the score with its context in one line, "tú" and the difference, Δ
against the reference, the small wheel, the three most chosen descriptors as counted bars with "tú"
where I chose them, and one link, "Ver ficha de Muestra G".

**The sheet** (a bottom sheet on a phone, a dialog from 640 px, the sample in the page's address so
"back" and reload keep it). In this order:

1. **The score**: the number, its context, mine and the difference, Δ against the reference, my
   arithmetic in one line ("Base 80.25 · Descuento 6 (1 taza defectuosa) · Puntaje 74.25"), the
   group's when cups were pooled, and "¿Cómo se calculó?" once.
2. **Tú y el grupo, atributo por atributo**: a dot plot on one fixed 1 to 9 scale for every coffee.
   It replaces the 17-column table, the eight radars and the comparison table (`D-10`, `F-08`).
3. **Lo que encontró el panel**: the wheel at full size with every family named and counted, then the
   descriptors as counted bars ("Frutos rojos · boca · 6 de 7", "tú"), then "Elegiste 2 de los 3
   descriptores más elegidos por el panel".
4. **Intensidades**: a dot plot on a fixed 0 to 15 scale.
5. **Tazas con defecto**, by type, when there are any.
6. **El mismo café, dos veces**, when the session repeated a coffee: my own two scores and the
   difference against the tolerance of 2 points. Only I see it.
7. **Mis notas y el café**: my notes, origin and preparation once revealed, and the note after close.

The organizer's sheet adds what it has today: the cupper switch, the sample editor, "Asignar café".

## 4. Every role and state

The mock's "Estado de la sesión" control shows each of these.

| State | What changes |
|---|---|
| **Closed group, participant** | The full page. |
| **Closed group, organizer** | The same page plus the "Pendiente" tile and the "Panel" tab: the per-cupper matrix with a Grupo column and a mark in the cell (▲ over 1 SD, ◆ 2 SD or more, so colour is not alone, `H-09`), what waits for a decision (late evaluation, note, exclusion), and alignment on one neutral bar per cupper (`A-05`). |
| **Open group, participant** | A notice ("los resultados del grupo aparecen cuando se cierre"), "Tus puntajes" in cupping order with only my ring, my own flavour marks, coffee names hidden, no ranking, no learnings, no reflection. Only sent evaluations show a total (decision 10). |
| **Open group, organizer** | The group's numbers (the owner's lens, as today) under a notice that only they see them. Learnings and reflection wait for the close: teaching appears only when a session is closed. |
| **Solo** | "Tu ranking" and "Primera de tu ranking" from my own scores, no whiskers, no "Quiénes cataron"; the wheel shows what I marked; learnings from my own data only. |
| **Descriptive** | No scores, so no ranking tile and no "first". "El sabor de cada café" leads. Cards have no number. **Waits on Kim:** what the group shows for intensities; the mock leaves my own values and says so. |
| **Affective** | No descriptors, so no wheel anywhere. The card carries a small line of the eight quality attributes instead. |
| **Reference, fixed** | The reference tile and card say 79.00 and why; its sheet has no quality plot ("calidad fijada en 5"). Its descriptors are real and shown. |
| **Reference, free** | The reference has an average, a spread and my own score; still outside the ranking; Δ is against its average. |
| **Two cuppers** | No spread, no "first", no learnings about the panel, no "Tú y el panel", no "diferencia". The group's value per quality attribute stays (decision 6). Choice 6. |
| **Fewer than three included on one sample** | That row prints "2 de 8 incluidos" with no ± and is never "first". |
| **Excluded cupper** | One private line at the top ("Tu evaluación no entra en los resultados del grupo... Motivo: ..."). Their own numbers stay; group numbers never include them. |
| **Guest** | As a participant, plus "Guarda tus resultados" as one notice after the tiles: the value first, the ask after. |

## 5. What is removed, and why

| Removed | Why | Where its content went |
|---|---|---|
| The three tabs | A coffee was split over three tabs and a dialog (`D-09`) | One page; the organizer keeps one extra tab for work |
| The stat row and "Promedio de sesión" | An average of unlike coffees decides nothing | "Quiénes cataron"; the average is not replaced |
| "Mejor muestra" in terracotta | A score singled out by colour (`A-04`) | "Primera del ranking", in ink |
| The table of 17 columns | Off screen even at 1440 px (`D-10`) | The card and the sheet's dot plot |
| Eight radars | Each drew its own scale; 7,079 px on a phone (`F-08`) | One dot plot, one scale |
| The word cloud | Counted mentions, merged two descriptors, unreadable on a phone (`H-02`, `A-03`, `A-11`) | The wheel and the counted bars |
| The wheel roll-up with typing fragments | "Nu, Nuec, Nueces" shown as notes (`A-13`) | Only descriptors that map to the wheel are listed |
| "Descriptores destacados" sentences | A third counting rule | The three bars on each card |
| "Mi desempeño" with a green or terracotta difference | Colour by direction (`A-05`) | "Tú y el panel", in ink |
| Two of three "¿Cómo se calculó?" per sample | Repetition | One per sheet |
| Participation said three times, four freshness rows | Repetition (`A-12`) | One line of facts and one tile |
| The late-evaluations panel on every tab | Repetition | The "Pendiente" tile and the Panel |
| The one-item pill used as a switch | `C-11` | Gone with the Descriptores tab |

## 6. The flavour drawing: three candidates

All three are drawn in the mock from the same invented coffee ("Sabores: los tres candidatos"): one
coffee, two coffees compared, and the whole cupping. All count **people**, with n printed.

| | **A. Rueda contada** | **B. Terreno** | **C. Barras contadas** |
|---|---|---|---|
| What it is | The flavour wheel's nine families at fixed angles; each petal as long as the number of cuppers who found that family; a ring per person | The same nine positions joined by one smooth outline over the same rings, like a territory on a contour map | A row per family: a bar as long as the share of cuppers, "7 de 7" beside it |
| Reads on a 375 px phone | Yes: it fits in 311 px with 12 px text, every family named and counted | The shape reads; the number has to be looked for | Yes: it is a list |
| Two coffees | Each family splits into two petals (full and tinted), or two small wheels side by side | Its strength: two translucent territories overlap where the coffees share a flavour | Paired bars; for the whole cupping, a table of families by samples |
| Honest? | Yes: length is the count, on a scale the rings show | Partly: the count is true at nine points; the curve between them is invented | Yes, and the most exact |
| Cost | Hand-drawn SVG from one pure, tested geometry function (about 150 lines); the same function can draw it in the PDF, as `lib/pdf/charts.tsx` already does for its charts. Recharts (in the repo) could draw the petals with a pie of varying radius, but the rings, the labels at fixed angles and the PDF twin would still be hand-made, and it renders in the browser only | The wheel's geometry plus the smoothing (about 40 lines more) | The lowest: it is the plan's `CountBar` |
| Accessibility | Text 12 px or more, in ink; every petal has a name and a number; an `aria-label` with all nine counts; the list under it is its text equivalent | The same labels; the overlap of two colours fails for some colour vision | Best |
| Read in five seconds? | **Yes**: the longest petal is what most people found | **Half**: you see a shape, not a count; three territories are a blot | **Yes**, and it is the least eye-catching |

**Recommendation: A**, at three sizes: a small one on the tile and the card (a shape, with its top
family written beside it), a full one on the sheet, and C's counted list always under the full one.
It is the drawing cuppers already know, it is the eye-catching one, and it counts.

What was taken from the map you sent, and what was not: the quiet ground of rings, the small legend
that teaches the reading as three plain questions ("¿Hacia dónde se estira?", "¿Dónde se quedan
cortos todos?", "¿Dónde coinciden dos cafés?"), and, in B, the overlapping translucent territories.
Nothing of its artwork was copied and the images are not in the repository.

Not tested with a cupper. "Five seconds" is my judgement from the mock.

### 6b. The comparison layer (after the answer to choice 1)

The trouble with petals is real: two coffees fit in one family's sector, three do not. And the first
terrain had its own fault: the line between two families was an invented curve, and each count sat on
a single point. So the terrain is redrawn and used only where coffees are compared.

**The territory, redrawn.** Same rings, same nine angles. Inside each family's sector the edge runs
*on* the ring of its count, as a plateau as wide as the middle of a petal; only the short joins
between two families are curves. Nothing between two counts is interpolated, and a territory's edge
lies exactly where that coffee's petal would end. The centre is wider in this drawing so that zero
and one are told apart.

| Where | What is drawn | Limits |
|---|---|---|
| **Overview, "El sabor de cada café"** | A switch, "Cada café \| Comparar". "Comparar" shows chips for the coffees and, for those chosen, translucent territories over the rings: two in the series colours, the third as a dashed outline. Each carries its letter on its own edge. Under it, the counts as a small table of families by chosen coffees | Up to three coffees; the first three of the ranking to start |
| **A coffee's sheet** | "Comparar con" chips. The open coffee keeps its coloured petals; up to two other coffees are laid on top as outlines in ink (a full line, a dashed line). Where an outline runs outside a petal, that other coffee had more people in that family. The same small table under it | Up to two others, so three coffees in all |

- **Why outlines in ink over the petals:** colour stays the family's; the other coffees are told apart
  by line style and by their letter, so nothing depends on colour.
- **Why a table under every comparison:** with three coffees the labels cannot carry three numbers
  each; the table is the exact reading and the text equivalent.
- **Cost:** one more pure function beside the wheel's (the plateau outline, about 20 lines) and one
  component that takes a base coffee or none. It belongs in package R1.
- **Measured on the mock at 375 px:** chart text 12 px, no label clipped, every chip 44 px.
- **Not yet known:** how it reads with real data, where many families have one or two people. That is
  the first thing to look at when R1 has it on a dev page.

### 6c. The family colours (choice 2: retune once, aligned with the flavour wheel)

`lib/constants.ts` (`L1_GROUP_COLOR`) already follows the flavour wheel's hues, and it is what the
picker paints today; the nine `--color-flavor-*` tokens are the ones that drifted. So the retune is:
the tokens take the wheel-aligned values, and the picker, the wheel, the bars and the charts read the
tokens. Measured against white (a drawn shape needs 3 : 1):

| Family | Wheel-aligned value today | Contrast on white | Proposed |
|---|---|---|---|
| Floral | `#C2368F` | 4.98 | keep |
| Frutal | `#E0472E` | 4.11 | keep |
| Verde / Vegetal | `#4A8F5B` | 3.91 | keep |
| Nueces / Cacao | `#9C6B43` | 4.57 | keep |
| Especia | `#7A2638` | 9.71 | keep |
| Tostado | `#5C4632` | 8.83 | keep |
| Otro | `#6E8B94` | 3.63 | keep |
| Dulce | `#D4922E` | 2.64 | `#CC7F2B` (3.16), a step toward orange |
| Ácido / Fermentado | `#C9A227` | 2.42 | `#98941F` (3.19), a step toward olive |

The two yellows fail 3 : 1 and are the closest pair of the set; the two proposed values pass and sit
further apart. No family is the error red any more. The mock now uses these nine. The final values,
the change to `app/globals.css`, `lib/constants.ts`, `chartColors.ts`, the landing canvas' snapshot
and `DESIGN.md` are one small package of their own (RP below), and the coffee words go past Kim.

## 7. Learnings: sentences computed by fixed rules

No language model, no opinion about the coffee or the person. Each sentence comes from one rule,
prints its numbers, and is simply absent when its threshold is not met. Shown only when the session
is **closed**. Sentences about the panel need the group view and at least 3 included cuppers on the
samples they use; references are left out of them; excluded cuppers are never in a group number.
"Your own" sentences are built on the server from the viewer's own evaluations and anonymous
aggregates, and travel only in that viewer's page. At most four about the panel and five of your
own, in this order.

| Id | Rule | Spanish | English |
|---|---|---|---|
| G0 | The descriptor with the most cuppers on any one sample (whole profile); needs 3 or more people and at least half the cuppers. Not in affective sessions | Lo más compartido de la cata: **{descriptor}** en {muestra}, {k} de {n} catadores. | Most shared in this cupping: **{descriptor}** on {sample}, {k} of {n} cuppers. |
| G1 | Among ranked samples with a spread, the smallest. Only if the largest and smallest differ by 0.5 or more | El panel coincidió más en **{muestra}**: dispersión ± {sd}. ({n} de {N} incluidos) | The panel agreed most on **{sample}**: spread ± {sd}. ({n} of {N} included) |
| G2 | The largest spread, same condition | Donde más se separaron los puntajes fue en **{muestra}**: ± {sd}. | Scores were furthest apart on **{sample}**: ± {sd}. |
| G3 | The first and second have no clear difference (`hasNoClearGap`) | La primera y la segunda del ranking, **{a}** y **{b}**, quedaron a {x} puntos: sin diferencia clara. | The first and second of the ranking, **{a}** and **{b}**, are {x} points apart: no clear difference. |
| G4 | A reference with a score exists: how many ranked samples are above it, and the largest Δ | Frente a la referencia ({ref}, {score}), {k} de {m} muestras quedaron por encima. La más lejana: **{muestra}**, Δ {±x}. | Against the reference ({ref}, {score}), {k} of {m} samples scored above it. Furthest: **{sample}**, Δ {±x}. |
| G5 | A sample with a defective cup among included evaluations; the one most cuppers flagged | En **{muestra}**, {k} de {n} catadores marcaron una taza con defecto ({tipo}: {c} tazas). | On **{sample}**, {k} of {n} cuppers marked a defective cup ({type}: {c} cups). |
| P1 | My largest distance from the group's score; only if 1 point or more | Tu puntaje más lejano del grupo fue en **{muestra}**: tú {x}, grupo {y} (diferencia {±d}). | Your score furthest from the group was on **{sample}**: you {x}, group {y} (difference {±d}). |
| P2 | My smallest distance, if it is another sample | El más cercano fue en **{muestra}**: tú {x}, grupo {y} (diferencia {±d}). | Your closest was on **{sample}**: you {x}, group {y} (difference {±d}). |
| P3 | In how many samples I was above the group, and the mean of my differences | Puntuaste por encima del grupo en {k} de {m} muestras; la diferencia media fue de {±d} puntos. | You scored above the group on {k} of {m} samples; the mean difference was {±d} points. |
| P4 | The quality attribute where my mean difference from the group is largest; only if 0.5 or more | En **{atributo}** puntuaste en promedio {x} por encima / por debajo del grupo. (en {m} muestras, escala de 1 a 9) | On **{attribute}** you scored on average {x} above / below the group. (over {m} samples, 1 to 9 scale) |
| P5 | My own alignment row: of the descriptors most of the panel chose, how many I chose; needs 5 or more such descriptors | Elegiste {k} de los {o} descriptores que eligió la mayoría del panel ({p} %). | You chose {k} of the {o} descriptors that most of the panel chose ({p} %). |
| P6 | The session repeated a coffee and I evaluated both (`compareOwnEvaluations`, tolerance 2) | {a} y {b} eran el mismo café: tus puntajes fueron {x} y {y} (diferencia {d}, dentro / fuera de la tolerancia de 2 puntos). | {a} and {b} were the same coffee: your scores were {x} and {y} (difference {d}, within / outside the tolerance of 2 points). |
| S1 | Solo: my highest and lowest score | Tu puntaje más alto fue **{a}** ({x}) y el más bajo **{b}** ({y}): {d} puntos entre ambos. | Your highest score was **{a}** ({x}) and your lowest **{b}** ({y}): {d} points between them. |
| S2 | Solo, with a reference | Frente a tu referencia ({ref}, {score}), {k} de {m} muestras quedaron por encima. | Against your reference ({ref}, {score}), {k} of {m} samples scored above it. |

Under the section, once: "Estar lejos del grupo no es un error: es un dato para conversar."
Nothing here names another cupper, grades a person, or calls a coffee good or bad. The organizer
sees the panel's sentences and, if they cupped, their own; never a sentence about a named cupper.

## 8. The space for reflection

**What exists:** `setPostCloseNote` writes one note of up to 500 characters on the cupper's own sent
evaluation of a closed session. It is per **coffee**, and the cupper and the session's organizer read
it. It works in solo sessions too.

**Proposal (choice 5 a): the reflection is that note, brought out of the dialog.** The section lists
the coffees with "Añadir nota" and the question "¿Qué te llevas de este café?", and says who reads
it: "La leen tú y quien organizó la cata." No new data, no migration. For a teacher this is a
feature: they read what each student took from each coffee.

**What it cannot do:** hold one thought about the whole cupping, or stay private from the organizer.
That would be new (choice 5 b): a table for one note per person and session, a SQL phase so the
browser key never reads it (as `warmup_reflections` did), an action, a read helper, and entries in
the guest-merge and account-deletion lists. About two days of work, plus a migration and a SQL phase
that you run. The mock shows where it would sit, as a dashed block.

## 9. The cover, with and without

The mock's "Portada oscura" control shows both. With it, a closed session opens on the landing's
dark ground: the session's name and facts in cream, and a still drawing of 128 dots, one per cup
tasted (8 samples, 2 cups, 8 cuppers). No score sits on the dark ground; the first tiles are solid
cream cards that overlap its lower edge.

**The rules it would widen** (`DESIGN.md`, "Where the dots and the dark ground may appear in the app"):

- "A session's closing moment (results first shown): once, briefly, never over the numbers" would
  become "the cover of a closed session's results, every time, with every number on a solid surface".
- "The cup form, results tables, any list, any dialog, any form: never" would need "except the cover
  band above the results".
- "A screen is a stage only when the person has nothing to enter and nothing to decide on it": the
  results page has a note to write and, for the organizer, decisions to take. So this would be a new
  thing in the system, a stage **band** on a paper page, not a stage screen.

**What it costs:** on a 375 x 667 phone the first score moves from 372 px to 603 px (measured on the
mock, without the app's top and bottom bars). At 1440 x 900 it moves from 284 to 410 px and still
shows the whole first row. Hence choice 3: none now, or from 768 px only.

## 10. Where a wish and a rule pull apart

Shown, not decided.

| The wish | The rule | What the mock does | Yours to say |
|---|---|---|---|
| Tiles like a product launch, of different sizes | One anatomy per kind of card; a card is as wide as its content needs | One anatomy, sizes from content | Nothing, unless you want a tile larger for emphasis |
| "Primera del ranking" kept | A score is never named by quality | Names the order, in ink, and says when the order is not firm | Decided (13) |
| A dark cover | The stage rules above | Both shown | Choice 3 |
| Two cuppers is valid | A participant never works out another cupper's values (the comparison's minimum of 3 is tested) | The line of choice 6 | Choice 6 |
| A space for reflection | The existing note is read by the organizer | Says so under the title | Choice 5 |
| Eye-catching flavour colours | Family colours on dots, bars and arcs only, never on text; red is for defects and errors | Petals and bars coloured, text in ink; but one family's token is the error red | Choice 2 |
| Less to read on a phone | Data speaks first | Cards go sideways; the ranking tile keeps every coffee in view | Choice 4 |
| More wow | Numbers are printed; nothing animates | Nothing moves; the drawing carries it | Decided (4) |

Kept everywhere, with no exception: a score in ink with no colour or name by quality; no animated
number; group results only at close; a participant's page never carries another cupper's name, id or
values; every community number with "n de N incluidos" and its flags; the score named once per
surface; references outside the ranking; no descriptors in affective sessions; no total before
sending; teaching only after close.

## 11. The build plan (replaces S2, S3 and S4 of `PLAN.md`)

S1 (one "Exportar" sheet, the header scrolls away, one scroll container) stays as planned and comes
first. Nothing below touches scoring, the trigger, `AggregateScore`, the gates of the payload or any
report.

| Package | Scope | Files | Closes | Size | Needs | Verified by |
|---|---|---|---|---|---|---|
| **RP. The family palette** (decided, choice 2) | The nine tokens take the wheel-aligned values of section 6c; `lib/constants.ts`, `chartColors.ts` and the landing canvas' snapshot read or mirror them; `DESIGN.md`'s table and its "where they may be used" line corrected | `app/globals.css`, `lib/constants.ts`, `components/results/chartColors.ts`, `components/landing/journey/ConstellationCanvas.tsx`, `DESIGN.md` | `H-01` (its palette part) | S | Nothing; before R1's wheel is judged by eye | A test that the tokens and the constants agree and that each passes 3 : 1 on `surface-container-lowest`; the picker and the landing by eye |
| **R1. The parts** | `ScoreWithContext`, `CountBar`, `DotPlot`, the ranking strip, `FlavorWheel` (pure geometry in `lib/`, drawn at three sizes) and `FlavorCompare` (territories alone or over a coffee's petals, section 6b). A dev page that shows them with real data. No change to the results page | `components/ui/ScoreWithContext.tsx`, `CountBar.tsx`, `DotPlot.tsx`; `components/results/RankStrip.tsx`, `FlavorWheel.tsx`; `lib/flavorWheel.ts`; tests | `A-07`, `F-08` (their parts) | M | The type scale (T4) if it has landed; else the sizes of this proposal | Unit tests on the geometry and on the tie bar; the capture run on the dev page: chart text 12 px or more, 4.5 : 1 |
| **R2. The overview and the cards** | The tiles, the cards, the page without tabs for a participant; `ResumenTab`, `ScoreTable`, `SampleRadarChart` and the Tabla/Gráfico switch removed. Two pull requests: tiles, then cards | `results/page.tsx`, `ResultsClient.tsx`, new `SessionOverview.tsx`, `CoffeeCard.tsx`; `lib/reports/overview.ts` (pure: what each tile shows for a viewer); `messages/*.json` | `D-09`, `D-10`, `A-04`, `A-05` (differences), `A-07`, `A-12`, `H-10` | L | S1; `Card`, `Notice`, `SectionHeading` (P2) or local equivalents | Tests on `overview.ts` for every state of section 4, including "a participant's payload carries no other cupper"; the capture run at 375, 768, 1440 in both languages; a score in the first fold at 375 x 667 |
| **R3. The sheet and the wheel** | The coffee's sheet in the order of section 3, the sample in the address; the cloud, `FlavorCloud`, `DescriptoresTab` and the roll-up removed | `SampleDetail.tsx`, `SampleDetailDialog.tsx`, `SampleComparisons.tsx`, `DescriptorFrequency.tsx`; delete `WordCloud.tsx`, `lib/wordCloud.ts` | `H-01` (results), `H-02`, `A-03`, `A-11`, `A-13`, `C-11`, `F-08` | M | R1; URL state (P5) or its own | Reload and "back" keep the sample; the capture run on four sheets; a test that only wheel descriptors are listed |
| **R4. Learnings and reflection** | `lib/reports/learnings.ts` (the rules of section 7, pure, each with its threshold named) and the two sections; the note per coffee brought onto the page | `lib/reports/learnings.ts`, `components/results/Learnings.tsx`, `Reflection.tsx`, `PostCloseNote.tsx`, `messages/*.json` | (new) | M | R2 | A test per rule and per threshold; a test that no sentence carries a name or an id; both languages |
| **R5. The organizer's Panel** | The second tab: the matrix with the Grupo column and a mark in the cell, what waits for a decision, alignment on one bar | `OwnerParticipantSection.tsx`, `CupperAlignment.tsx`, `LateEvaluationsPanel.tsx`, new `PanelView.tsx` | `H-09`, `A-05` (alignment) | M | R2 | The capture run as the organizer; the existing owner-lens tests |
| **R6. The descriptive session** | Its first view and its cards | `overview.ts`, `CoffeeCard.tsx` | `J-05` | S to M | R3, **and Kim's answer** | A descriptive session at three widths |
| **R7. Not now** | Set aside by the answers of 2026-11-16, each for a later yes: the dark cover (choice 3; it needs `DESIGN.md` changed first); a private note for the whole cupping (choice 5 b; a migration and a SQL phase) | | `K-04` | S to M each | | |

Order: `S1 -> RP -> R1 -> R2 -> R3 -> R4`, with R5 beside R3 (other files) and R6 when Kim answers.
The "Comparar" switch of the overview ships with R2 and "Comparar con" with R3.
`A-02` is closed by your decision 6 as accepted; it should be written into `CLAUDE.md` when R2 lands.

## 12. What waits on Kim

Noted here, resolved nowhere.

- What a descriptive session shows for the group's intensities (`J-05`): R6 waits on it.
- Every threshold of section 7 (0.5 of spread, 1 point, 0.5 of an attribute, 3 people and half the
  panel for "most shared", 5 descriptors for the alignment sentence) is my proposal: simulated.
- Whether the wheel should count by family (nine petals, as drawn) or one level down (Bayas,
  Cítrico, ...), and whether the wheel's order of families is the one cuppers expect.
- "Tú vs. grupo" (B3), the repeated sample and its tolerance of 2 (B6), group results only at close
  (C5), "indicativo" and the tie rule (D3): the page builds on these simulated answers.
- Whether "coincidencia de descriptores" is a figure a cupper should see about themselves (you
  decided yes; its wording is choice 10).

## 13. Noticed, not done

- **Two palettes for the flavour families.** `app/globals.css` and `DESIGN.md` have nine earthy
  tokens; `lib/constants.ts` (`L1_GROUP_COLOR`) has nine brighter colours, and those are the ones the
  picker and today's results paint. Decided on 2026-11-16 (choice 2): one palette, the wheel's;
  package RP. The mock's first version used the tokens; it now uses the values of section 6c.
- **`--color-flavor-sour` is `#ba1a1a`, the same value as `--color-error`** (until RP).
- **The note after close is per evaluation.** There is no place for a note about a whole session.
- **A solo cupper's own scores can be flagged "sin diferencia clara".** `assignRanks`
  (`lib/reports/ranking.ts`) applies the one-point floor to "mine" scores too. Read in the code; not
  checked on screen.
- **`lib/wordCloud.ts`** was repaired by package F3; R3 deletes it.
- **`DESIGN.md` still says** the family colours are "only in `CATAPills` and flavor-family labels";
  the mock follows the correction proposed in `REPORT.md` section 10 (dots, bars and arcs).
- If the cover is chosen, the rule change belongs to whoever is editing `DESIGN.md` (package D0).

## How the mock was made

One HTML file with inline CSS and script, no app code, no database: the tokens are copied from
`app/globals.css`, the fonts come from Google Fonts, the drawings are SVG built by a few functions,
and the learnings are computed from the invented data by the rules of section 7. The frame is a CSS
size container, so "Ancho" shows the phone and tablet arrangements on any screen. Coffees ("Ámbar",
"Granate", "Niebla", ...), cuppers ("Catador 2" to "Catador 9") and every number are invented.
