# Results screens: diagnosis and directions

> Part of the app UI/UX audit of 2026-11-15 (`REPORT.md` in this folder). Diagnosis only: nothing was changed.
> Screens: `/app/sessions/[id]/results` (three tabs and the drill-down dialog) and `/app/sessions/[id]/print`.
> Finding ids (`A-03`, `F-01`, ...) are those of the findings table in `REPORT.md`.

The owner's words (2026-11-15): "we need to make the data useful, we need a redesign especially of the
results dashboard screens, the whole word cloud is unusable, needs to be more wow, eye catching. And a
problem we are having is that there is too much information derived from a tasting, we need to organize
the data."

## 1. The diagnosis in five sentences

1. **The page is organised by type of data, not by coffee or by question.** Scores are in one tab, the
   table and the charts in another, descriptors in a third, and each person's own detail in a dialog. To
   read one coffee you visit three tabs and a dialog.
2. **The same fact is shown many times under different names, and the fact a person came for is often
   not on the first view.** The group score of a sample appears six times under four names; a
   participant's own score is not on the first view of a closed group session at all.
3. **On a phone the page leaves almost no room to read.** A docked header and a docked footer of six
   export buttons leave 194 px of 844 for content, and 17 px of 667 on a small phone (finding `F-01`).
4. **The word cloud answers a question nobody asks ("which words were typed most in total") and cannot
   be read on a phone.** The counted bars right under it already answer the real question ("how many of
   us found this in this coffee").
5. **Three things on the page are wrong, not just untidy**: the cloud adds up two different descriptors
   that share a name (`A-03`), the wheel summary shows typing fragments as if they were notes (`A-13`),
   and a closed session says five cuppers "have not synced yet" two months after the close (`A-12`).

## 2. How this was looked at

- **Real sessions**, read-only through the super-admin lens, names replaced: a combined session with 14
  cuppers and 8 samples (9 submitted), a descriptive one (11 cuppers, 6 samples) and an affective one (12
  cuppers, 6 samples), at 375 x 667, 390 x 844, 768 x 1024 and 1440 x 900, in Spanish and English. Plus
  the test accounts' own solo and one-cupper sessions, closed and open.
- **Measured in the page**: the height of every docked part, each word of the cloud (font size, box,
  contrast against its background), table and chart sizes, the length of the drill-down dialog.
- **Read**: `app/[locale]/app/sessions/[id]/results/**`, `components/results/**`, `lib/wordCloud.ts`,
  `lib/reports/**`, `lib/pdf/cvaFormData.ts`.
- **Not seen** (audited from code): a real participant's view of a closed multi-cupper session (the test
  accounts are not members of any real session), so "Tú y el grupo", the repeated-sample comparison and
  the participant side of `A-02` are from code. A guest's view is from code as well.

## 3. Inventory: what a tasting produces and where it is shown today

O = owner (and the admin lens), P = participant, G = guest. "Times" = how often the same datum appears on
the results route.

| # | Datum | Shown today | Who | Times | Form |
|---|---|---|---|---|---|
| 1 | My total per sample | Resumen (only before close, or solo); Tabla last column; Gráfico card header; drill-down box; "Tu total" in the comparison | O P G | 4 to 5 | pill, 21 px numeral, sentence |
| 2 | Group score per sample | Resumen row; "Mejor muestra" card; Tabla "Com:"; Gráfico "Puntuación comunidad"; group breakdown; comparison "Grupo" | O; P G once visible | 6, under 4 names | pill, 31.5 px terracotta numeral, 10 px text |
| 3 | Spread (SD) of the totals | Resumen "± x"; owner matrix "DE"; comparison | O P | 3 (not in Tabla, Gráfico or "Mejor muestra") | 10.5 px text |
| 4 | "n de N incluidos" | Resumen row, "Mejor muestra" subtext, Gráfico line, breakdown, matrix | O P | 5 | 11 px text |
| 5 | Participation ("9 de 14") | header line, stat card, banner | O P | 3, all in the first view | text, 31.5 px numeral, banner |
| 6 | "indicativo" / "sin diferencia clara" | Resumen only | O P | 1 | badge |
| 7 | Rank | Resumen | O P | 1 | 21 px muted numeral |
| 8 | Reference and Δ against it | Resumen anchor card and Δ; Tabla Δ twice; Gráfico Δ; "Comparar con" switch | O P | 3 surfaces | 10 px text |
| 9 | The arithmetic of a score, in one line | Gráfico card and drill-down | O P | 2 | 10.5 px text |
| 10 | "¿Cómo se calculó?" | Gráfico (individual and group) and drill-down | O P | 3 per sample | disclosure |
| 11 | Group-scope cups line | Gráfico only | O P | 1 | text |
| 12 | My value per attribute (1 to 9) | Tabla, radar, radar Δ table, drill-down chip, comparison | O P | 5 | number, polygon |
| 13 | Group average per attribute | Tabla second line, radar dashed polygon, Δ table, comparison, coffee page bars | O; P once visible | 4 | 10 px terracotta text, polygon |
| 14 | My intensities (0 to 15) | Tabla, drill-down | O P | 2 | number |
| 15 | Group intensities | the participant's comparison block only | P | 1; **the owner never sees them** | number |
| 16 | Group descriptors per block | cloud, bars, "Ver todos", wheel roll-up, summary sentence, Resumen highlights, comparison | O P | 7 views, 3 counting units | cloud, bar, list, sentence |
| 17 | My descriptors | "Perfiles de sabor" in Tabla and Gráfico; drill-down pills; owner's per-cupper cloud | O P | 3 | white-on-colour pills |
| 18 | My notes, the express note, the market note | drill-down | O P | 1 | text |
| 19 | The value "as it cooled" | drill-down | O P | 1 | number |
| 20 | "No evaluado" / partial evaluation | drill-down, Tabla, Gráfico, matrix | O P | up to 5 | label |
| 21 | Defective cups by type; non-uniform cups | the arithmetic line; Tabla "u:1 d:0" in 9 px red. No group tally by type on results (it exists on the coffee page) | O P | 2, both cryptic | text |
| 22 | Cupper alignment (how close each cupper's descriptors are to the panel's) | owner list with a coloured bar; a participant's own percentage in "Mi desempeño" | O; P own | 2 | bar, percentage |
| 23 | Per-cupper matrix with distance bands | owner section in Resultados | O | 1 | table, cell colour |
| 24 | Exclusions, late evaluations, notes after close | manage list, own notice, a panel on every tab, drill-down slot | O; P own | 2 to 3 | list, banner |
| 25 | Physical evaluation (green bean) | **not on the results screen** (PDF and print only) | O | 0 | |
| 26 | Origin data, prep data | drill-down; the coffee's name in 4 places | O; P once revealed | 1 | definition list |
| 27 | Repeated-sample difference; "Tú vs. grupo" | the last blocks of the drill-down | P | 1 | table |
| 28 | Session facts (date; format and cups per sample are not shown) | header, 11 px | all | 1 | text |
| 29 | Session average; my average against the group's | stat card, "Mi desempeño" | O P | 2 | 31.5 px numeral |
| 30 | Freshness and close facts ("cerrada el", "actualizados el", "Actualizado:") | up to 4 header rows | all | 4 rows | chips, banner |
| 31 | Exports | 6 docked buttons for the owner, 3 for a participant | O P | docked on every tab | buttons |

Counting the variants, the results route places about 38 kinds of data roughly 75 times.

## 4. Who needs what, to answer which question, and when

### The questions each role arrives with, and what they cost today

| Role | Question | Cost today |
|---|---|---|
| Participant (closed group) | What did I give each coffee? | Not on the first view once the group results show. Resultados tab, then a sideways scroll of a 1,367 px table inside a 334 px screen; or open a sample and scroll a 1,034 px dialog to its score box (560 px visible) |
| | How far was I from the group, coffee by coffee? | The last block of that dialog |
| | Which coffee did the panel prefer? | Resumen, under four stat cards: no tap, one to two scrolls in a 194 px window |
| | What did the panel taste in each coffee? | Descriptores tab, then a sample filter |
| | What was each coffee? | The small subtext of a ranking row |
| Owner | The ranking, and how firm it is | Resumen: no tap. This is the best-served question on the page |
| | Did the panel agree? Who was far, on what? | Resultados, past the table, to the matrix (on a phone the Gráfico view is 7,079 px tall before it) |
| | Is there something to act on (late evaluation, exclusion, a note)? | A panel repeated on every tab |
| | What did the panel taste in each coffee? | Two taps |
| | Has everyone submitted? | Answered three times in the first view |
| | Give me the documents | Always docked, six buttons |
| Solo cupper | My score per coffee | No tap |
| | My notes | One tap |
| Guest | As a participant | Plus the "save your results" invitation |

### At a glance, on demand, for export, noise

| Datum | Owner | Participant | Guest |
|---|---|---|---|
| Ranking with group score, SD, n and the honesty flags | glance | glance | glance |
| My own score beside the group's | (owner cups too: glance) | **glance: missing today** | glance |
| Reference and Δ | glance, when a reference exists | glance | glance |
| Descriptors per coffee with counts of people | one step | **one step: this is "what did we taste"** | one step |
| Me against the group per attribute | one step | one step, not the last block of a dialog | one step |
| Defects found, by type | glance when there are any, hidden when there are none | glance when any | |
| Per-cupper matrix, alignment, exclusions, late items | one step, in one "panel" place; a badge when something needs action | never | never |
| Arithmetic of a score | on demand, once per sample | on demand | on demand |
| Notes, cooled value, market note | on demand | on demand | on demand |
| Origin, prep, physical evaluation | on demand | on demand, once revealed | on demand |
| Exports | one button | one button | none |
| Session average | **noise**: an average of unlike coffees decides nothing | noise | noise |
| "Mejor muestra" card | noise: it repeats row 1 of the ranking, in a colour the rules forbid (`A-04`) | noise | noise |
| Participation, said three times | once, and only while the session is open | noise after close | noise |
| Alignment percentage in "Mi desempeño" | | noise, and it reads as a grade (decision 7) | |
| The formula, three disclosures per sample | once | once | once |
| The word cloud | noise (see section 5) | noise | noise |

## 5. The word cloud

**What it is meant to tell:** what the panel tasted, with size standing for how often.

**What it does** (`lib/wordCloud.ts`, `components/results/WordCloud.tsx`):

- The default view is every sample and every block together (`DescriptoresTab.tsx:142-145`), so it
  describes the session, not a coffee.
- Size adds up **mentions**, over stages and samples: one cupper who names a word in four stages on four
  samples adds 16. The bars under it count **people**. The summary sentence uses a third rule. One screen,
  three units (`A-11`).
- Words are merged on their lower-cased label, across blocks. The acidity descriptor "Suave" and the
  mouthfeel descriptor "Suave" become one word (`A-03`). On the real session it is the largest word of
  the default cloud, 57 mentions, painted in the acidity colour.
- It keeps the top 30 words and drops the rest without saying so. A sample has about 50 distinct
  descriptors ("Ver todos (52)").
- Font size runs on a square-root scale between 11 and 66 px, words are packed on a spiral, and then
  **the whole cloud is scaled down to fit the card**, so the 11 px minimum is not a floor.
- Colour is the flavour-wheel family, with no legend. Counts appear only in a tooltip, an aria-label, or
  after a tap. The number of cuppers is never shown.

**Measured on the real combined session (Spanish):**

| View | Words | Scale applied | Smallest / median / largest word (px) | Words under 12 px | Mentions (min to max) |
|---|---|---|---|---|---|
| 375 x 667, all samples | 30 | 0.55 | 6.1 / 13.1 / 19.4 | 15 | 13 to 57 |
| 390 x 844, all samples | 30 | 0.53 | 5.9 / 13.1 / 19.7 | 15 | 13 to 57 |
| 390, one sample | 30 | 0.59 | 6.5 / 14.2 / 21.8 | 11 | 1 to 9 |
| 390, acidity block only | 8 | 1 | 11 / 28.3 / 36.9 | 1 | all one colour, 2.42 : 1 |
| 768 x 1024 | 30 | 0.68 | 11.2 / 28.8 / 44.9 | 3 | |
| 1440 x 900 | 30 | 1 | 16.5 / 42.4 / 66 | 0 | |

- **Contrast:** on a phone 15 of the 30 words are under 4.5 : 1 (for example "Caramelizado" and "Dulce
  general" 1.97, "Papel" 2.32, "Suave" 2.42, "Herbáceo" 2.61, "Dulce" 2.64, "Chocolate" 2.78). At
  1440 px the larger words pass as large text and 7 still fail.
- **Touch:** each word is a button with no padding; the smallest is 6 px tall.
- **Where it sits:** on a phone, inside the 17 to 194 px window described in `F-01`.

**What a person can read from it:** which words were named most over the whole session; the flavour
family, if they already know the wheel's colours; one count per tap.

**What a person cannot read from it:** how many people agreed (it counts mentions); any difference between
coffees; any count without tapping; the order of words of similar size; ties; anything beyond the 30th
word; the yellow words at all; which "Suave" it is. On a phone, half the words are not legible.

**Displays that answer the real question better:**

1. **Counted bars per coffee: "Frutal, 7 de 8 catadores".** This already exists (`DescriptorFrequency`)
   and is the best thing on the tab. One fix: scale each bar to the number of cuppers, not to the card's
   top word.
2. **A coffees-by-descriptors table** (rows = descriptors or wheel families, columns = coffees, each cell
   = how many people). It is the standard display in sensory work and the only one that compares coffees.
3. **A flavour wheel per coffee** (a sunburst: inner ring = family, outer ring = descriptor, the arc's
   size = people, the number printed on the arc). This is the eye-catching one, and it is honest: it is
   the wheel cuppers already know, and it shows counts.
4. On a participant's coffee sheet: **"elegido por ti y por 5 de 8"** next to each descriptor.

## 6. Every chart and table, against its question

| Display | Question | Does the form fit? | What is wrong |
|---|---|---|---|
| Stat row (4 cards) | How did the session go? | Weak | "Mejor muestra" printed in terracotta (`A-04`); participation repeated; on a descriptive session three of four cards are "—" |
| Resumen ranking | Which coffee did the panel prefer, and how firmly? | Yes | Honest about ties, n, "indicativo" and the reference. Missing: the score's name on this surface, and my own number (`A-07`, `D-09`) |
| "Mi desempeño" | Was I strict or generous? | Partly | The difference is green above the group and terracotta below (`A-05`) |
| Tabla | Every number | No | 17 columns, 1,367 px wide: the score column is off screen even at 1440 (`D-10`); 10 px headers; "u:1 d:0" in 9 px red; no SD or n beside the group value |
| Radar card (Gráfico) | The shape of a coffee, mine against the group | Acceptable (two polygons, fixed axis order, numbers beside) | No fixed scale, so each card draws its own (`F-08`); 9 px ticks; one card is about 670 px tall and eight of them make a 7,079 px page on a phone; animated with no reduced-motion check |
| Descriptor bars | What the panel found in this coffee | **Yes** | Bar length relative to the top word instead of to the number of cuppers |
| Word cloud | see section 5 | No | see section 5 |
| Wheel roll-up under the bars | Which families | Yes in idea | Shows typing fragments ("Nu, Nuec, Nueces, Nue, Nu c") as notes (`A-13`) |
| "Perfiles de sabor" pills | My descriptors | Yes, as a list | White text on family colours down to 2.4 : 1 (`H-01`); not shown for combined sessions |
| Alignment list | Who matches the panel | Bars: yes | A traffic light: green from 75 %, terracotta from 50 %, error red below (`A-05`) |
| Owner matrix | Where the panel disagreed | Yes | The band is carried by cell colour alone; no group-mean column; all "—" on a descriptive session |
| "Tú vs. grupo" | Me against the group | Yes, with neutral wording | It is the last block of the dialog |
| "¿Cómo se calculó?" | How the number is made | Yes | Three copies per sample |
| Print page | The paper form | Yes | Prints a total for a complete evaluation whether or not it was sent (`A-01`) |

## 7. Directions for organising the results

Every direction keeps these rules, which are product rules and not up for discussion here:
no score coloured or named by quality; no animated number; a score always beside its n, its spread, the
reference and "indicativo"; the score named once per surface; group results only when the session is
closed; a participant never sees another cupper's values; no descriptors in the affective format;
references stay out of the ranking; no total while cupping; ties shown as ties.

### Direction 1: one card per coffee (recommended)

The coffee becomes the unit. The first view is the list of coffees in ranking order; opening a coffee shows
everything about it on one sheet.

```
FIRST VIEW (every role)                      ONE STEP AWAY: the coffee's sheet
+------------------------------------+       +--------------------------------------+
| Cata del 26 sep · combinada        |       | Muestra G · Café X             2 / 8 |
| 2 tazas · 9 de 14 enviaron         |       | 92.75   ± 4.8 · 7 de 8 · tú 98.00    |
|                        [Exportar]  |       | Puntaje Café Sensible (base CVA)     |
+------------------------------------+       |--------------------------------------|
| REFERENCIA · Muestra E · 79.00     |       | Tú y el grupo        1 ......... 9   |
| fuera del ranking                  |       | Fragancia      ------o---●---        |
+------------------------------------+       | Aroma          -------●o-----        |
| 1  Muestra G · Café X              |       | Sabor          ----o-----●---        |
|    92.75  ± 4.8 · 7 de 8 · tú 98   |       |--------------------------------------|
|    Frutal 7/8 · Floral 6/8 · ...   |       | Lo que encontró el panel             |
+------------------------------------+       | Frutal   ████████████  7 de 8        |
| 2  Muestra H · Café Y              |       | Floral   █████████     6 de 8        |
|    90.00  ± 6.6 · 8 de 8 · tú 88   |       | Cítrico  ██████        4 de 8  tú ✓  |
|    Dulce 6/8 · Nueces 5/8 · ...    |       |--------------------------------------|
+------------------------------------+       | Mis notas · Origen · Preparación     |
| 3  ...            sin diferencia   |       | ¿Cómo se calculó?                    |
|                   clara con el 2   |       +--------------------------------------+
+------------------------------------+
OWNER ONLY, a second view "Panel": the per-cupper matrix with the group mean, exclusions on the
same rows, alignment, late evaluations, notes after close. A badge on it when something needs action.
MOVED OUT: the stat row, the session average, "Mejor muestra", five of the six footer buttons (one
"Exportar" opens a sheet), the Tabla/Gráfico switch, two of the three formula disclosures, the word cloud.
```

- **First view:** the ranking, each row carrying the number with its context in one line and, for a
  participant, their own number. A descriptive session shows the top descriptors and an intensity strip
  in the same card, and no number.
- **One step away:** the coffee's sheet. "Tú y el grupo" is a dot plot on one fixed 1 to 9 scale (a dot
  for me, a marker for the group), which replaces the table row, the radar and the comparison block.
  Descriptors are the counted bars.
- **Moved out:** the items listed in the schematic.
- **Cost: M to L.** It replaces `ResumenTab`, `ScoreTable`, `SampleRadarChart` and `DescriptoresTab` as
  page sections. It reuses `rankSamples`, `DescriptorFrequency`, `SampleDetail` and `SampleComparisons`.
  New parts: `ScoreWithContext` (one line: number, ±, n, flags, reference), `DotPlot`, `CountBar`, an
  export sheet. The owner's panel moves `OwnerParticipantSection` and `CupperAlignment` unchanged. No
  change to scoring, the trigger, the payload gates or any report.

### Direction 2: tabs by question (lighter)

```
[ Ranking ]   [ Cada café ]   [ Tú ]  or  [ Panel ] for the owner
Ranking    = today's ranking + a "tú" column + one line of session facts (no stat row)
Cada café  = the coffee sheets of Direction 1, one after another; a sideways row on a phone
Tú         = participant: all my numbers against the group, one dot plot, one scale
Panel      = owner: matrix, exclusions, alignment, late evaluations
Descriptors live inside each coffee sheet as counted bars. The cloud is deleted.
```

- **Cost: M.** Keeps the tab shell and `PillTabs`; moves components more than it rebuilds them.
- **Trade-off:** less change and less risk, but a coffee is still split between "Ranking" and "Cada
  café", and the person still has to learn three tabs.

### Direction 3: a stage cover (the "wow" layer, on top of 1 or 2)

```
+------------------ dark stage, the landing's ground --------------------+
|  Cata del 26 sep · cerrada             the panel's flavour wheel        |
|  8 cafés · 9 catadores                 (sunburst: arcs = people,        |
|                                         numbers on the arcs, family     |
|  1  Muestra G   92.75 ± 4.8 · 7 de 8    colours only on the wheel)      |
|  2  Muestra H   90.00 ± 6.6 · 8 de 8                                    |
|  3  Muestra C   85.25 ± 5.6 · 8 de 9                                    |
+---------------------- scroll: the cards of Direction 1 -----------------+
```

- A closed session opens on a dark cover, like the landing: the session's facts, the top of the ranking
  in cream type, and the flavour wheel of the whole panel as the one large drawing. `DESIGN.md` already
  allows the stage for "a session's closing moment (results first shown): once, briefly, never over the
  numbers"; this direction needs that rule widened to "as the cover of a closed session", which is a
  decision (below).
- **Cost: L.** A new sunburst primitive (drawn as SVG, no animation of numbers), a stage wrapper
  (`ArrivalStage` in the plan), contrast and performance work, and a plain fallback.

### Recommendation

**Direction 1 now; the flavour wheel of Direction 3 as a second step, inside the coffee sheet first.**
Direction 1 is what fixes "too much information": it removes about half of what is on the page and puts
the rest where the question is. The wheel is the honest form of "more wow": it is eye-catching, it is the
drawing cuppers already know, and unlike the cloud it shows counts. The dark cover is worth doing only
after the content is in order, and only if the owner wants it.

## 8. Where "more wow" and the rules pull against each other

These are not settled here. They are in the decisions list of the report with options and a recommendation.

| The wish | The rule it meets | Options |
|---|---|---|
| An eye-catching "best coffee" | A score is never coloured or named by quality | (a) drop the card, the ranking's row 1 already says it; (b) keep a neutral "Primera del ranking"; (c) a highlighted winner. (c) breaks the rule |
| Colour on the results | Colour may mark a series, a distance from the group, or a defect, nothing else | (a) the flavour families carry the colour, on the wheel and the bars; (b) the stage cover; (c) colour on scores. (c) breaks the rule |
| Numbers that arrive with a flourish | No animated number | The cover may arrive; the numbers are printed |
| A dark cover on the results page | The stage is for moments with nothing to enter or decide; "never over the numbers" | Widen the rule to a closed session's cover, or keep the stage out of results |
| A participant sees how they compare | With two cuppers, any group average reveals the other cupper (`A-02`) | Show per-attribute group values only from three cuppers, as the comparison block already does |

## 9. What waits on Kim

- Whether a group average of intensities means anything in a descriptive cupping, or only the frequency of
  descriptors does. It decides what a descriptive session's first view shows (`J-05`).
- Whether the order inside a combined step on a phone (descriptors first, quality below the fold) should
  change (`F-06`).
- The thresholds of the history filter ("85+", "75 a 84", "menos de 75"): do they mean anything to a
  cupper, given that scores carry no quality band?
- The comparison blocks ("Tú vs. grupo", the repeated sample) rest on his simulated answers B3 and B6.
