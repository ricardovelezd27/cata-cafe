# App UI/UX audit, 2026-11-15

> Café Sensible, everything past the landing page, against `DESIGN.md` with the rubric
> `docs/design-system/AUDIT-RUBRIC.md`. Audit of 2026-11-15, written 2026-11-16. Owner: Ricardo.
> **A diagnosis: no app code, style or data was changed.** Nothing here is implemented until the owner
> has read it. Companion files in this folder: `RESULTS-DIAGNOSIS.md` (the results screens),
> `PLAN.md` (work packages and the missing primitives), `DECISIONS.md` (what only the owner or Kim can
> settle), `shots/` (screenshots).

## 1. The ten-minute read

**Score: 20 of 40** (ten dimensions, 0 to 4 each). The landing scored 11 of 20 before its redesign,
so the app stands about where the landing stood.

**88 findings**, one per cause: **3 P0, 29 P1, 49 P2, 7 P3**. Every P0 and
P1 was checked a second time against its evidence by someone who had not written it. That pass
confirmed two of the P0s (the third, J-01, was seen failing on the server), lowered seven findings to
P2, narrowed three, set one P0 candidate aside (it was an effect of the audit tool) and corrected
several numbers. Its verdicts are kept with the audit's working notes.

**What is good.** The cupping screen keeps the two hardest product rules: no total is shown while
cupping, and a save that did not reach the server is never shown as done. The ranking on the results
page is honest about ties, small panels and the reference. The message files in Spanish and English
match key for key (2,059 each). The list screens built with `DataTable` and `PageHeader` (sessions,
coffees, history) are the closest to the system. The error boundary keeps the shell and offers a way
forward.

**The three P0s.**

1. **A-01. A cupper can see their own total before sending.** With the eight ratings filled, the
   results page, the print page and the PDF all show the total of an unsent draft. The rule says the
   total appears after "Enviar".
2. **A-03. The word cloud adds up two different descriptors that share a name.** Acidity "Suave" and
   mouthfeel "Suave" become one word, the largest on the real session's cloud.
3. **J-01. One session with a mistyped closing date (year 20228) breaks the sessions list** for
   whoever has it in their list. This is a data and validation bug found in passing, not design; it
   is listed so it is not lost.

**The five things that matter most across the whole app.**

1. **One CSS rule cancels the styling of every heading** (B-01). A rule written outside Tailwind's
   layers beats every colour and weight class on `h1` to `h4`: 79 colour classes and 33 bold classes do
   nothing. It is one line to fix, and it changes what every title looks like, so the title colour has
   to be decided first.
2. **The type scale was never reconciled with the 14 px root** (B-02). Body text paints 12.25 px, 515
   uses paint under 12 px, and there are 32 font sizes. Together with the shared controls that paint
   under 44 px (F-04) and the rating bubbles at 28 px (F-02), this is why the app feels small in the
   hand.
3. **The page has no frame and no shared parts for the things every screen has** (F-09, F-10, D-07,
   B-04, E-05): no page container (seven widths, three alignments), no spacing scale (13 gap values),
   no `Card` (129 hand-written cards in 43 recipes), no section heading, no notice. About 120 buttons
   and 31 pills are hand-made (C-05, D-08).
4. **Three colour systems are live at once** (E-01, E-02): 251 hex literals of the palette from before
   the tokens, 426 legacy alias classes and 166 legacy variables, next to the tokens. Insights and the
   cupping form hold most of them.
5. **The keyboard and the words were never designed as a whole** (H-03 to H-08, I-01, I-03): on the cup
   page the first ten Tab presses land on hidden controls and the slider's focus is invisible; the
   organiser has four names, "Cerrar sesión" means two things, and the cup form is Spanish in English.

**The results screens** have their own file. In short: the page is organised by type of data instead
of by coffee, so the same number appears up to six times while a participant's own score is missing
from the first view; on a phone 17 to 194 px are left to read it in (F-01); and the word cloud cannot be
read on a phone and counts the wrong thing (H-02, A-03, A-11). The recommendation is **one card per
coffee**, with counted bars ("7 de 8 catadores") and a flavour wheel in place of the cloud.

## 2. How the audit was done

- **A team of five experts and a lead**, each with their own brief and the rubric: flow, desktop,
  mobile, data visualization, branding. A second pass by two independent checkers went through every P0
  and P1. The lead consolidated: where two experts scored the same dimension of a screen, the lower
  score stands; where their levels disagreed, the second pass decided.
- **Seen on screen:** 39 of the rubric's 44 screens and parts (the other five are in the table below) at 390 x 844, 768 x 1024 and 1440 x 900
  in Spanish and English, with measurements also at 375 x 667. A headless browser took each screenshot
  and measured the page: painted sizes of headings and text, touch targets, contrast against the real
  background, primary buttons in the first fold, overflow, docked parts, tables. Reduced motion was on.
- **Read-only.** The local server uses the production database, so the browser aborted every request
  that was not a GET: nothing could be created, edited or sent. Three test accounts were used with the
  owner's agreement (an owner, a participant, an account with no data), and real closed sessions were
  viewed through the read-only super-admin lens with every person, session, coffee, farm and producer
  name replaced before a screenshot was kept. Placeholders such as "Catador 58" or "Café 300" in the
  screenshots are the tool's, not the app's.
- **Evidence** is a file and line, a measured value or a screenshot in `shots/`. Measurement files stay
  outside the repository; a finding quotes the value.
- **Screenshots:** 275 files for 38 screens and parts, named `<screen id>.<phone|tablet|desktop>.<es|en>[.<state>].png`
  with the screen ids of the Flowmap; `shots-manifest.json` lists each with its state and a caption. Every
  screen has its main state in both languages at the three sizes; other states are in Spanish. No image of
  the Users and Access pages is kept, and none of a real session's print sheet (it shows origin data).
- **Two things in the screenshots come from the method, not from the app's normal state.** A whole
  screen is shown in one tall image, although the app scrolls inside its shell (the first fold is what
  the measurements describe). And many signed-in screens show the badge "1 borradores sin
  sincronizar": the cupping page of a test session tried a first save, the tool blocked it, and the app
  correctly kept it as pending. That badge adds about 24 px to the top of those screens.

### Not seen (audited from the code, or not at all)

| What | Why | How it was handled |
|---|---|---|
| An anonymous guest: `/join/[token]` name form, the guest's results, the guest gate dialog, `/auth/claim` with a token | Becoming a guest creates an account in production | From code; the join page was seen as a visitor and as a signed-in newcomer |
| A participant's view of a real multi-cupper closed session ("Tú y el grupo", the repeated sample) | The test accounts are in no real session | From code; the owner's and the admin's view were seen |
| The wizard's second step (invite link after creating) | Reaching it creates a session | From code |
| Real offline: replay, sync conflicts, the offline banner | Would need writes | From code; the "pending" state was seen because saves were blocked |
| A live synced warm-up; the warm-up player while it runs | The player was audited on 2026-11-14; a synced run needs two people | The library and exercise pages were seen; the player was not scored |
| `/app/insights/explorer` and `/app/insights/chat` working | The explorer loads its data with a POST, which the tool blocks; chat needs the AI key | Scored from code only; not a finding |
| A real phone, a real keyboard on a phone, 200 % zoom, a screen reader, a 900 px window | Not available to the tools | Stated in each finding that depends on it |
| Toasts | No write could succeed or fail for real | Not scored |

## 3. Score per dimension

The app's score per dimension is the lead's, read from the screens' scores (their mean is in the
notes) and weighted toward the screens people use most: cupping and results.

| Dimension | Score | Notes |
|---|---|---|
| A. Product rules on screen | 2 | Mean of the screens 2.6. The cup page keeps "no total while cupping" and save honesty; the results path breaks two rules (A-01, A-03) and several smaller ones |
| B. Hierarchy and type | 2 | Mean 2.0. Heading styles cancelled by one rule; body text at 12.25 px; six routes without an h1 |
| C. Actions | 2 | Mean 2.1. Several primaries per fold on the dashboard; about 120 hand-made buttons; three buttons that do not do what they say |
| D. One way to do a thing | 2 | Mean 2.1. Six tab recipes, 43 card recipes, results split by data type; the `DataTable` lists are right |
| E. Surfaces, colour and tokens | 2 | Mean 2.2. Three colour systems live; Insights is the worst; the newer screens are clean |
| F. Layout and devices | 2 | Mean 2.1. Results on a phone scores 0; no page frame; a tablet gets a stretched phone |
| G. Motion | 3 | Mean 2.9. No animated number, nothing moves by itself while cupping; reduced motion is not honoured |
| H. Accessibility | 1 | Mean 1.9. The cup page cannot be used with a keyboard; 28 px rating bubbles; text and chips under the contrast floor |
| I. Words | 2 | Mean 2.4. The two languages match in structure; no glossary; the cup form is Spanish in English |
| J. States | 2 | Mean 2.1. Honest save and error states; most empty lists are a plain line; a descriptive session has no designed result |

**Total: 20 of 40.** Mean of the screens' own means: 2.3 of 4.

Findings by dimension and level:

| Dimension | P0 | P1 | P2 | P3 | Total |
|---|---|---|---|---|---|
| A | 2 | 6 | 5 | 0 | 13 |
| B | 0 | 3 | 3 | 0 | 6 |
| C | 0 | 4 | 6 | 1 | 11 |
| D | 0 | 2 | 10 | 1 | 13 |
| E | 0 | 0 | 5 | 1 | 6 |
| F | 0 | 5 | 9 | 1 | 15 |
| G | 0 | 0 | 1 | 0 | 1 |
| H | 0 | 6 | 3 | 1 | 10 |
| I | 0 | 2 | 4 | 1 | 7 |
| J | 1 | 1 | 3 | 1 | 6 |
| All | 3 | 29 | 49 | 7 | 88 |

## 4. Scores per screen

0 = failing, 4 = exemplary. An empty cell was not judged (not seen, or the dimension does not apply).
Where two experts scored a cell, the lower score is shown. The landing is the reference and is not
scored. K is a dimension of opportunities and has no score.

| Screen | A | B | C | D | E | F | G | H | I | J | Mean |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/auth/login` | 3 | 2 | 3 | 2 | 1 | 3 | 3 | 2 | 3 | 3 | 2.5 |
| `/auth/confirm` | 3 | 2 | 4 | 2 | 3 | 3 | 3 | 3 | 3 | 3 | 2.9 |
| `/auth/claim` | 3 | 2 | 3 | 3 | 2 |  |  |  | 2 |  | 2.5 |
| `/join/[token]` | 3 | 2 | 2 | 2 | 1 | 3 | 3 | 3 | 3 | 2 | 2.4 |
| `/join/coffee/[token]` | 2 | 2 | 2 | 2 | 1 | 3 | 3 | 3 | 3 | 1 | 2.2 |
| The onboarding dialog | 2 | 2 | 2 | 1 | 2 | 2 | 3 | 2 | 2 |  | 2.0 |
| `/app` | 2 | 1 | 1 | 2 | 2 | 2 | 3 | 1 | 1 | 2 | 1.7 |
| `/app/sessions` |  | 3 | 2 | 2 | 3 | 2 | 3 | 2 | 3 | 0 | 2.2 |
| `/app/sessions/new` | 3 | 2 | 2 | 1 | 3 | 1 | 2 | 1 | 2 | 3 | 2.0 |
| `/app/sessions/express` | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 2 | 3 |  | 2.9 |
| `/app/sessions/[id]/edit` |  | 3 | 2 | 3 | 3 | 1 | 3 | 1 | 3 |  | 2.4 |
| `/app/sessions/[id]/invite` | 3 | 3 | 2 | 2 | 2 | 2 | 3 | 2 | 3 |  | 2.4 |
| `/app/sessions/[id]/waiting` | 3 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 1 | 3 | 1.8 |
| `/app/sessions/[id]/cup` | 3 | 1 | 1 | 2 | 1 | 2 | 2 | 0 | 1 | 3 | 1.6 |
| `/app/sessions/[id]/results` | 1 | 1 | 1 | 2 | 2 | 0 | 2 | 1 | 2 | 2 | 1.4 |
| `/app/sessions/[id]/print` | 2 | 1 |  |  | 1 | 3 | 3 | 3 |  |  | 2.2 |
| `/app/coffees` |  | 3 | 2 | 2 | 3 | 2 | 3 | 1 | 3 | 1 | 2.2 |
| `/app/coffees/new` |  | 2 | 2 | 2 | 3 | 1 | 3 | 2 | 3 |  | 2.3 |
| `/app/coffees/[id]` | 2 | 1 | 2 | 2 | 2 | 2 | 3 | 2 | 3 | 1 | 2.0 |
| `/app/coffees/[id]/edit` |  | 3 | 2 | 3 | 3 | 1 | 3 | 2 | 2 |  | 2.4 |
| `/app/groups` |  | 2 | 2 | 2 | 2 | 2 | 3 | 2 | 2 | 1 | 2.0 |
| `/app/groups/[id]` |  | 2 | 2 | 2 | 3 | 2 | 3 | 1 | 2 | 1 | 2.0 |
| `/app/profile` |  | 0 | 1 | 2 | 3 | 2 | 3 | 2 | 3 | 2 | 2.0 |
| `/app/profile/history` | 3 | 3 |  | 2 | 3 | 2 | 3 | 2 | 3 | 3 | 2.7 |
| `/app/warmup` |  | 3 |  | 3 | 3 | 3 |  | 2 | 2 |  | 2.7 |
| `/app/warmup/[slug]` |  | 2 |  | 3 | 3 | 2 |  | 3 | 3 |  | 2.7 |
| The player in its three modes |  |  |  |  | 3 |  |  |  | 3 |  | 3.0 |
| `/app/insights` |  | 1 |  | 1 | 0 | 2 | 3 | 2 | 2 |  | 1.6 |
| `/app/insights/explorer` | 3 | 2 |  | 1 | 1 |  |  |  | 2 |  | 1.8 |
| `/app/insights/benchmark` | 3 | 2 |  | 1 | 0 | 2 | 3 | 2 | 2 |  | 1.9 |
| `/app/insights/chat` |  | 1 |  |  | 1 |  |  |  | 2 |  | 1.3 |
| `/app/insights/users` |  | 2 |  |  | 2 | 2 | 3 | 2 | 3 |  | 2.3 |
| `/app/insights/access` |  | 1 |  |  | 1 | 1 | 3 | 0 | 3 |  | 1.5 |
| Sidebar |  | 2 | 2 | 3 | 3 | 3 |  | 1 | 1 |  | 2.1 |
| Bottom navigation |  |  |  | 2 | 3 | 1 | 3 | 1 | 3 |  | 2.2 |
| Top bar |  | 2 |  | 2 | 3 | 2 | 3 | 1 | 1 |  | 2.0 |
| The guest gate dialog | 3 |  | 3 |  |  |  |  |  | 3 |  | 3.0 |
| The pending-drafts badge | 3 |  |  |  |  | 2 | 3 | 1 |  | 3 | 2.4 |
| The error boundaries |  | 2 | 4 |  | 3 | 3 | 3 | 3 | 3 | 3 | 3.0 |
| The two not-found pages |  | 2 |  |  | 3 | 3 | 3 | 3 | 3 |  | 2.8 |
| `/privacidad` |  | 3 |  |  | 3 | 3 | 3 | 3 | 2 |  | 2.8 |
| `/terminos` |  | 3 |  |  | 3 | 3 | 3 | 3 | 2 |  | 2.8 |
| `/aviso-legal` |  | 3 |  |  | 3 | 3 | 3 | 3 | 2 |  | 2.8 |

## 5. The known drift, confirmed

The baseline is section 7 of the rubric (counted 2026-11-14). The landing, generated code and the
landing page itself are excluded.

| What | Baseline | Now |
|---|---|---|
| Legacy colour alias classes | 423 | **426** in 47 files (`text-brown-mid` 151, `text-brown-dark` 88, `green-dark` 59) |
| Legacy colour variables in CSS modules | 164 | **166** in 14 files |
| Legacy radius classes | about 30 | **15**, in 8 files. They paint 21, 28 and 42 px, not the 24 to 48 px `DESIGN.md` states |
| Hex literals in components | `Avatar` and about a dozen files | **251** in 41 files; 138 of them in Insights. About 48 are sanctioned (charts, the stage field, emails, the print twin, the Google mark) |
| Inline styles | about 30 files | **207** in 30 files; about 33 carry a design value, the rest are computed |
| A rating tinted by its value | `AffectiveBubbles` | Confirmed on screen (A-06). The same idea also colours a difference by its sign and the alignment bar (A-05) |
| Type scale against the 14 px root | 32, 24, 20 px listed; 26.25, 21, 17.5 painted | Confirmed, and wider: body 12.25 px, 32 distinct sizes, 294 arbitrary sizes (B-02) |
| No shared section heading on paper | to size | 43 `h2` in 16 recipes, 21 `h3` in 14, 31 recipes for an uppercase label (B-04, B-05) |
| No card primitive | to count | 129 hand-written cards, 43 recipes (D-07) |
| "Container max 1280 px, outer margin 48 px" | to measure | Not built: no maximum, 21 px of padding, seven widths (F-09) |
| Dev routes | to confirm | `/dev` and `/app/warmup/dev-*` exist as pages and are not linked from the navigation. Not audited |
| Also counted | | 85 `bg-white` and similar; 10 shadow literals; 0 default Tailwind palette classes; 0 old font variables |

## 6. Findings

One row per cause. "From code, not seen" marks what could not be reached on a screen. The id's letter is
the rubric's dimension. Sizes: S = one file, M = one screen, L = a pattern across screens.

| Id | Screen | Viewport and language | Rule | What | Evidence | Level | Fix | Size |
|---|---|---|---|---|---|---|---|---|
| A-01 | `/app/sessions/[id]/results`, `/app/sessions/[id]/print` and the CVA PDF, open session, complete but unsent draft | All, ES and EN | The total is not shown while cupping (PRODUCT.md) | A cupper who fills the eight ratings and opens the results before sending sees their total: the results page shows it for a complete draft, and the footer's "Ver formulario" and "Descargar PDF" print it on the sheet. The results of an open session are reachable from the profile history, the invite page and by address. | `lib/evaluationState.ts:72-76` (`canShowMyScore` is true for a complete draft); `lib/reports/ranking.ts:153`; `lib/pdf/cvaFormData.ts:900-911` (no draft check); `ResultsClient.tsx:1379-1399`; `cva-pdf/route.ts:96` (from code, not seen) | P0 | One gate, "the evaluation was sent", for the results page, the print page and the PDF. Decision 10 | S |
| A-02 | `/app/sessions/[id]/results`, closed group with exactly 2 included cuppers, participant | All | A participant never sees another cupper's values (CLAUDE.md, B3) | Tabla and Gráfico show the group average per attribute with no minimum number of cuppers, so with two cuppers "2 x average - mine" is the other person's rating. Only the comparison block is gated at 3. | `ScoreTable.tsx:386,395`; `SampleRadarChart.tsx:179,195`; gate only in `lib/reports/personalComparison.ts` (from code, not seen) | P1 | One gate where the payload is built (`gateSampleForViewer`): per-attribute group values from 3 included cuppers. Decision 6 | M |
| A-03 | `/app/sessions/[id]/results`, Descriptores (cloud and summary sentences) | All, ES and EN | Data speaks first; a number is never misstated | The cloud merges words on their label across blocks: acidity "Suave" and mouthfeel "Suave" become one word. On the real session it is the largest word of the default cloud (57 mentions), in the acidity colour. | `lib/wordCloud.ts:94-103` (`labelKey`); measured on `app-sessions-id-results.*.closed-group-combined-descriptores` | P0 | Key by descriptor id, or merge only inside one block | S |
| A-04 | `/app/sessions/[id]/results` ("Mejor muestra"), `/app` ("Puntuación promedio"), `/app/coffees/[id]` (lifetime score) | All, ES and EN | No quality bands; terracotta is an accent only | The one score among the stat cards is painted terracotta (92.75, 79.00) while counts are ink. The colour does not change with the value, so it is not a quality band, but it singles a score out by colour. | `components/dashboard/StatCard.tsx:23`; `app/[locale]/app/page.tsx:242`; `app.desktop.es.png`; `app-sessions-id-results.phone.es.closed-group-combined-resumen.png` | P2 | A score's value is always `on-surface`; drop `accent` for scores | S |
| A-05 | `/app/sessions/[id]/results` ("Mi desempeño", radar Δ, alignment list) | All | No quality bands; "far from the group is not an error" | A difference is green when above the group and terracotta when below; the alignment bar is a traffic light (green from 75 %, terracotta from 50 %, error red below). | `ResumenTab.tsx:317-318`; `SampleRadarChart.tsx:428-429`; `CupperAlignment.tsx:31-36`; seen at 1440 | P1 | Δ in ink with its sign; alignment on one neutral bar (or the sanctioned distance tones) | S |
| A-06 | `/app/sessions/[id]/cup` (affective, combined) | All | No quality bands (open question in DESIGN.md) | The selected rating bubble is terracotta from 7 and error red up to 3, through legacy colour variables. Seen: 7 terracotta, 1 red. | `AffectiveBubbles.tsx:28`; `AffectiveBubbles.module.css:10-13`; `app-sessions-id-cup.phone.es.small-m-aff-pending.png` | P2 | One selected colour. Decision 5 | S |
| A-07 | `/app/sessions/[id]/results` (Resumen, Tabla, Gráfico) | All, ES and EN | A score sits next to its context and is named once per surface (PRODUCT.md) | The first view (Resumen) never names the score: "Puntaje Café Sensible (base CVA)" appears only in the table header, the drill-down, the owner matrix and the formula. The group score has four names ("Com:", "Puntuación comunidad", "Comunidad", "Grupo"). Tabla shows the group value with no spread and no n; Gráfico shows n but no spread. | `ResumenTab.tsx:171`; `ScoreTable.tsx:107-113`; `SampleRadarChart.tsx:299-315`; messages `results.table.cvaScore`, `results.radar.score`, `results.table.communityShort` | P1 | New primitive needed: `ScoreWithContext` (number, ±, n, flags, reference); one word for the group score | M |
| A-08 | `/app/sessions/[id]/cup`, a save that did not reach the server | 375 x 667, ES | Save status honesty (CLAUDE.md) | The state is honest (amber, never green), but its label is absolutely placed over the step tabs at 10 px and cut at 232 px: "Guardado en este dispositivo · pendiente de si…". Taps still reach the tabs under it. | `SessionShell.module.css:130-147,255`; `app-sessions-id-cup.phone.es.small-m-aff-pending.png` | P2 | Put the state in the flow of the header row, 12 px minimum, never cut "sin sincronizar" | S |
| A-09 | `/app` | All, ES and EN | Trust through precision | The stat "Sesiones CVA: sesiones realizadas" counts open sessions too (8 shown for an account with 6 open and 2 closed). | `app/[locale]/app/page.tsx:321-336`; `messages/en.json:165`; `app.phone.en.png` | P1 | Count closed sessions, or label it "sesiones" | S |
| A-10 | `/app/sessions/[id]/cup` to `/app/sessions/[id]/results`, open group session | All | Value before friction; a label says what happens | "Enviar y ver resultados" lands on "Los resultados del grupo aparecerán cuando se cierre la cata", with no word on when, no mention of the email, no next step. | `messages/es.json:485,878,1261`; `ResumenTab.tsx:343-346` (from code, not seen) | P2 | "Enviar" in group sessions; the waiting card says an email will come and shows the person's own evaluation | S |
| A-11 | `/app/sessions/[id]/results`, Descriptores | All | Trust through precision: one unit per view | Three counting units on one screen: the cloud counts mentions, the bars count people, the summary sentence has its own rule. The help text admits it. | `lib/wordCloud.ts:90-92`; message `results.help.nube.body` | P2 | People everywhere, each count printed with its n | M |
| A-12 | `/app/sessions/[id]/results`, closed group | All, ES and EN | Trust through precision | A session closed two months earlier says "Mostrando resultados de 9 de 14 participantes. 5 aún no han sincronizado." They did not submit; nothing is syncing. | `results/page.tsx:590`; `app-sessions-id-results.desktop.es.closed-group-combined-resumen.png` | P1 | After close: "5 no enviaron" | S |
| A-13 | `/app/sessions/[id]/results`, Descriptores (wheel roll-up) | All | Data speaks first | Typing fragments are listed as notes under a flavour family: "Nu, Nuec, Nueces, Nue, Nu c", "Fru, Ci, Citri, Ba, Baya". | `app-sessions-id-results.phone.es.closed-group-combined-descriptores.png`; `components/results/DescriptorFrequency.tsx` | P1 | List only words that map to the wheel; find where the fragments are saved (FlavorPicker or the aggregation) | M |
| B-01 | App-wide (every `h1` to `h4` and `.font-serif` styled with Tailwind classes) | All, ES and EN | Tokens live in one place; Type scale | An unlayered rule sets colour, weight and family on every heading and beats every layered utility: 79 colour classes and 33 bold classes on headings do nothing. `PageHeader`'s green title paints ink; a title written as a `div` stays green, so the colour depends on the tag. | `app/globals.css:314-320` (workaround at `:322-331`); measured: every h1/h2/h3 paints rgb(31,27,25) at weight 500, e.g. `measure/app.desktop.es.json`, `measure/auth-login.desktop.es.json` | P1 | Move the rule into `@layer base`; then set the title colour once (decision 2) | S |
| B-02 | App-wide | All, ES and EN | Typography: the root font size; Type scale | Body text paints 12.25 px (474 uses of `text-sm`), captions 10.5 px (341); 515 uses paint under 12 px, down to 7.5 px scale labels and 9 to 10 px captions on the cup page; 32 distinct font sizes and 294 arbitrary `text-[..px]` classes. | scan of `app/**` and `components/**`; `measure/app-sessions-id-cup.phone.es.descriptive-solo-owner.json` (10 px x13); `AffectiveBubbles.module.css:43,61`; 10 px x126 in the results table | P1 | One paper type scale as named tokens, floor 11 px (decision 1) | L |
| B-03 | App-wide: `/app/profile`, `/app/sessions/[id]/results`, `/app/sessions/[id]/cup`, `/app/sessions/[id]/print`, `/app/insights`, `/app/coffees/[id]` | 1440 and 390, ES | `PageHeader` for every page top; hierarchy | `PageHeader` is used on 9 of 36 pages. Six routes have no h1 (the results title is a 17.5 px `div`; the cup page's only headings are 11 px h3s). Page titles paint at 26.25, 21, 32 and 17.5 px by page. | `ResultsClient.tsx:843`; `insights/layout.tsx:27`; `coffees/[id]/page.tsx:266`; measure `h1Count: 0` | P1 | `PageHeader` everywhere; a visually hidden h1 on cup and print | M |
| B-04 | `/app`, `/app/sessions/[id]/results`, `/app/coffees/[id]`, `/app/insights`, `/app/groups/[id]`, `/app/profile` | 1440, ES | Hierarchy is a step | Steps that are equal or inverted: dashboard section title 26 px beside the 26.25 px page title; results h2 = h3 = 17.5 px; coffee profile h2 10.5 px caps over 15.75 px h3s; Insights 21 px title then 10.5 px caps. | measure `headings` of each screen; `insights/page.tsx:20` | P2 | New primitive needed: paper `SectionHeading` | M |
| B-05 | App-wide (111 places) | All | Type scale: section label 11 px | 31 recipes for an uppercase label: 9, 10, 10.5, 11 and 12 px, seven tracking values, three weights. The most common (42 uses) paints 10.5 px. | scan (`heads.js` labels) | P2 | One label utility | M |
| B-06 | App-wide tables and stat cards: `/app/coffees`, `/app/insights/users`, `/app/profile/history`, `/app/sessions/[id]/results` | 1440, ES | Numbers in `tabular-nums` | Numeric cells are centred, not right-aligned, and mostly not tabular: coffees 7 columns, users 16, the owner matrix 49 cells; `nonTabularCount` 14 on `/app`, 22 on Insights, 30 on benchmark. | `components/ui/DataTable.tsx`; measure `nonTabular` | P2 | `align: "right"` and `tabular-nums` for numeric columns in `DataTable`; `tabular-nums` on matrix cells | S |
| C-01 | `/app`, `/app/sessions` (empty) | All, ES and EN | One action per fold; an ask appears once | "Start a session" is offered up to five times on `/app` (six with onboarding): two filled buttons in the first phone fold ("Catar ahora" at y 131, the intro card's "Nueva sesión" at y 651) and in the first desktop fold (y 21 and y 330), plus an outlined link to the same wizard. An empty sessions list shows a filled "Catar ahora" twice. | `app/[locale]/app/page.tsx:181-192,284-295`; `DashboardIntro.tsx:161-167`; `measure/app.phone.es.json` (`primaries`); `app.desktop.es.png`; `app-sessions.phone.es.empty.png` | P1 | One primary per fold; the intro card and the empty state point to the header action in words | M |
| C-02 | `/app/sessions/[id]/cup`, notes stage | All | Interactive control vocabulary; confirm what cannot be undone | The "Resultados" item of the module switcher submits the evaluation while the notes stage is open; for a solo session the last submit also closes it. No confirmation when nothing is missing. | `CupClient.tsx:2432-2447,1816-1893`; `app/actions/community.ts:162-191` (from code, not seen) | P1 | The item only navigates; the footer button is the one submit | S |
| C-03 | `/app/sessions/[id]/waiting`, participant | All, ES and EN | A label says what the button does | A full-width filled "Iniciar cata" only checks whether the session has started and answers "Aún no ha comenzado"; the page redirects by itself when it starts. | `WaitingRoomClient.tsx:344-364,419-435`; `app-sessions-id-waiting.phone.es.participant.png` | P1 | Remove it, or a ghost "Comprobar ahora" | S |
| C-04 | The onboarding dialog | All | Value before friction: no dead end | "Unirme a una sesión: tengo un código de invitación" leads to `/app/sessions`, which has no field for a code. | `components/onboarding/WelcomeModal.tsx:18-22` (from code, not seen) | P1 | Say "abre el enlace o escanea el QR", or add a paste-link field | S |
| C-05 | App-wide (about 120 places) | All | Buttons: `Button` / `ButtonLink` only | Hand-rolled buttons with their own padding, radius and weight: cup page about 40, wizard 12, groups 12, coffees 9. Primary actions paint 32, 35, 37, 39, 46 and 48 px tall instead of 44. | `app/page.tsx:183`; `DashboardIntro.tsx:163`; `NewSessionForm.tsx:1709-1715`; `WaitingRoomClient.tsx:420-433`; `coffees/page.tsx:131`; `groups/[id]/page.tsx:410-415`; measure `primaries` | P2 | `Button` / `buttonClasses()`; new primitive needed: a docked-action size for the cup footer and master controls | L |
| C-06 | `/app/sessions` (empty), `/app/coffees` (empty), `/app/groups` (empty) | All | An ask appears once; an empty list has one action | An empty sessions list shows the header pair and the empty-state pair together (two filled "Catar ahora"); the coffees and groups empty states have no action at all. | `sessions/page.tsx:221-236`; `SessionsTable.tsx:297-311`; `CoffeesTable.tsx:480`; `app-sessions.phone.es.empty.png` | P2 | One rule: the header carries the action; the empty state points to it | S |
| C-07 | `/app/sessions/[id]/results`, closed | All | One action per fold: do not offer what does nothing | "Actualizar" (terracotta outline, top right) is shown on a closed session, where a refresh changes nothing by product rule. | `ResultsClient.tsx:866-881`; `app-sessions-id-results.desktop.es.closed-group-combined-resumen.png` | P2 | Hide it once the session is closed or expired | S |
| C-08 | `/app/sessions/new`, `/app/coffees/new`, `/app/coffees/[id]/edit`, `/app/sessions/[id]/edit` | 375 x 667 and 1440 x 900, ES | The main action is reachable; one place for the main action | The only submit sits 770 to 1,050 px below a 667 px fold (y 1617, 1700, 1439, 1722) and at y 1495 to 1531 at 900 px tall, not docked; the wizard's five sections carry no numbers. Across the app the main action sits in four different places. | measure `primaries` in `app-sessions-new.phone.es.small-m.json`, `app-coffees-new…`, `app-coffees-id-edit…`, `app-sessions-id-edit…` | P2 | A sticky action bar for forms (the `CanvasFooter` recipe); numbered sections | M |
| C-09 | `/app/coffees/[id]`, `/app/sessions/[id]/edit` | All | Every destructive action goes through `ConfirmDialog` | "Publish results" and "make public" are confirmed by tapping twice within 3 seconds, with no dialog; the remove-sample dialog is not marked destructive. | `PublishResultsToggle.tsx:20-26`; `CoffeeVisibilityToggle.tsx:34-38`; `EditSessionForm.tsx:812-831` (from code, not seen) | P2 | `ConfirmDialog`, marked destructive where it is | S |
| C-10 | `/app/sessions/[id]/cup`, footer | 375 and 768, ES | One primary; terracotta is an accent only | The "next" button is green for the next sample and terracotta for the next stage; "Siguiente Etapa → Aroma" wraps to two lines (208 x 64) in Spanish. | `CanvasFooter.module.css:395-398`; `measure/…m-comb-group-participant.json` | P2 | One green primary; the stage change is said in the label | S |
| C-11 | `/app/sessions/[id]/results`, Descriptores | All | Interactive control vocabulary | "Ocultar descriptores de una sola persona" is a one-item `PillTabs` used as a switch. | `DescriptoresTab.tsx:188` | P3 | A switch | S |
| D-01 | App-wide: `/app/sessions/[id]/results`, `/app/sessions/[id]/cup`, every `DataTable` list | All, ES and EN | Keep the reader's place | The results tab, the cup page's sample and step, every table's filter, search, sort and page, and an open dialog live only in component state: a language switch, a reload or "back" resets them (results goes back to Resumen; only Tabla/Gráfico and the comparison basis are remembered). There is no language switch on the cup page or on sign-in. | `LocaleSwitchLink.tsx:31-33`; `ResultsClient.tsx:458`; `CupClient.tsx:561-571`; `DataTable.tsx:227-231`; `SampleDetailDialog.tsx:143` (from code, not seen) | P2 | View state in the URL (`?tab=`, `?sample=`, `?step=`, `?q=`); a history entry when a dialog opens | M |
| D-02 | App-wide (6 recipes) | All | One gesture per kind of content; nothing built twice | Six ways to move between sibling views: results `PillTabs`, Insights underline tabs (hex colours), `PhaseStepper`, `SampleTabs`, `ModuleSwitcher`, onboarding dots; plus `SegmentedControl`. | `ResultsClient.tsx:950-958`; `InsightsTabs.tsx:36-53`; `PhaseStepper.tsx:58-108`; `SampleTabs.tsx:58-78`; `WelcomeModal.tsx:275-287` | P2 | Two recipes: route level = underline links; inside a page = `PillTabs`, whose selected state does not use the action fill | L |
| D-03 | `/app/insights`, `/app/insights/explorer`, `/app/insights/benchmark` | All, ES | Say where the person is | In Spanish no Insights tab is ever marked active: the code compares the unprefixed path with `/es/...`. English works. The same bug was already fixed in `navItems.ts`. | `InsightsTabs.tsx:22-40`; `measure/app-insights-benchmark.phone.es.f-tabs-active.json` (all `active:false`) against the `.en.` file | P2 | Use the shared `isActive()` | S |
| D-04 | The onboarding dialog, `/app/sessions/[id]/cup`, `/app/sessions/[id]/results`, `/app/insights` | 375, ES | Progress follows the direction of travel; a step carries its number | Onboarding shows three bare 8 px dots. The cup stepper (546 px in 375), the sample tabs (724 in 247), the results filters (889 and 619 in 354) and the Insights tabs scroll sideways with no count and no sign that more exists; the notes stage and "Enviar" are not steps of the stepper. | `WelcomeModal.tsx:275-287`; `PhaseStepper.tsx:31-53`; measure `hScrollers` in `…small-m-*` | P2 | Numbered `.rail-step`; a "2 / 5" counter; an edge fade or a `Select` for filters on phones | M |
| D-05 | `/app/sessions/new` | All, ES | One way to do a thing | "Cafés a evaluar: + Agregar otro café" and "Muestras: + Agregar muestra" add the same object under two names in two sections. | `NewSessionForm.tsx:1100,1424`; `app-sessions-new.phone.es.png` | P2 | One list of samples, each with an optional coffee | M |
| D-06 | App-wide: `/app/coffees/[id]`, `/app/coffees/new`, `/app/sessions/new`, `/app/sessions/[id]/invite`, `/app/profile/history`, `/app/sessions/[id]/results` | All | Pages open the same way | A back link exists on 4 pages only; the group owner view hand-makes one; the others have none. | grep `backHref`; `groups/[id]/page.tsx:395-401` | P3 | `PageHeader backHref` on every detail and create page | S |
| D-07 | App-wide (68 files) | All | One anatomy per kind of card; nothing built twice | There is no `Card` component: 129 hand-written cards in 43 recipes (9 backgrounds, 13 paddings, 20 with a shadow and 109 without). The results Resumen alone has 18 cards on 4 backgrounds. | scan (`heads.js` cards); worst files `ResultsClient.tsx` 13, `profile/page.tsx` 5, `CupClient.tsx` 5, `ResumenTab.tsx` 5 | P2 | New primitive needed: `Card` and its sibling `Notice` | L |
| D-08 | App-wide (about 31 places), `/app` | All, ES and EN | Shared kit: `Badge`, `StatusPill`, `ScorePill` | About 20 hand-made badges and 11 hand-made pill buttons. The dashboard has its own status map with hex colours and hard-coded BORRADOR / ABIERTA / CERRADA, a copy of `StatusPill`. | `app/[locale]/app/page.tsx:14-23,367,375`; `FormatBadge.tsx`; `coffees/[id]/page.tsx:268`; `HistoryTable.tsx:123,216`; `BetaBadge.tsx:8` | P2 | `Badge`, `StatusPill`, `ScorePill`, `Button size="sm"` | M |
| D-09 | `/app/sessions/[id]/results` | All, ES and EN | Data speaks first; one place for one thing | The page is organised by type of data, so one coffee is split over three tabs and a dialog. About 38 kinds of data are placed about 75 times: the group score 6 times, participation 3 times in the first view, descriptors in 7 views, the formula 3 times per sample. A participant's own score is not on the first view of a closed session; "Tú y el grupo" is the last block of a 1,034 px dialog. | `lib/reports/ranking.ts:160-185`; `SampleDetailDialog.tsx:226`; inventory in `RESULTS-DIAGNOSIS.md` | P1 | Reorganise by coffee (`RESULTS-DIAGNOSIS.md`, direction 1) | L |
| D-10 | `/app/sessions/[id]/results`, Resultados (score table, owner matrix) | 390, 768 and 1440, ES and EN | Every list is a `DataTable`: table from `md`, cards below | The score table has 17 to 19 columns and is 1,367 px wide: it scrolls sideways in 334 px on a phone, in 738 at 768, and still in 1,186 at 1440, where the score column is off screen. Nothing says more columns exist. The matrix is 859 px in 710 at 768. | measure `tables` (`19c8r 1367/1186`); `ScoreTable.tsx:201,298` | P1 | A card per coffee with the score first; one block at a time through the existing `SegmentedControl` | M |
| D-11 | `/join/[token]`, `/join/coffee/[token]`, `/auth/confirm` | All, ES and EN | Nothing built twice; an error says what to do | Three recipes for one kind of card: a red title that is not a heading with two text links under 24 px; a single red line with nothing to do; a serif h1 with one button. | `join-token.phone.es.invalid.png`; `join-coffee-token.phone.es.invalid.png`; `auth-confirm.phone.es.no-token.png` | P2 | One arrival card: h1, one sentence on what to do, one `ButtonLink` | S |
| D-12 | `/app/sessions/[id]/cup` (the drawer of the cupping screen) | 375, ES | One dialog; names of controls | The drawer does not close when an item is picked, has no Escape and no focus trap, and its labels are hard-coded English ("Open navigation"). | `SessionShell.tsx:64-79,119-121`; `app-sessions-id-cup.phone.es.small-m-aff-notes.png` | P2 | Radix dialog (as `ResponsiveDialog`); close on select; translated labels | S |
| D-13 | `/app/insights/access`, `/app/sessions` | All | Every list is a `DataTable` | The access list is one unpaginated list 26,722 px tall, with no search. On a phone, a session card has a 21 px title link and three 40 px icon actions side by side. | `AccessManager.tsx`; measure `innerScrollExtra` 26,722; `measure/app-sessions.phone.es.small-m.json` | P2 | `DataTable` with search and pagination; the whole card is the link, actions in a menu | M |
| E-01 | App-wide (41 files): `/app/insights`, `/app/insights/explorer`, `/app/insights/benchmark`, `/app/sessions/[id]/cup`, `/auth/login`, `/join/[token]`, `/app/sessions/[id]/waiting` | All | No hex in a component; Color Palette | The palette from before the tokens is still live as 251 hex literals: old green `#3D5A3E`, `#E8E0D0`, `#FDFBF7`, old amber `#C17817`, `#8B7355`, and off-brand purple and blue. Insights holds 138 in 18 files with its own chart palette (error red as a series colour); the cup stepper 11, `Avatar` 9, the sign-in and join cards 8, the PWA theme colour 2. | `PhaseStepper.tsx:60-88`; `Avatar.tsx:3-11`; `FormatBadge.tsx:2-4`; `auth/login/page.tsx:44`; `join/[token]/page.tsx:169`; `WaitingRoomClient.tsx:424-427`; `app/manifest.ts:11-12`; `InsightChart.tsx:22-28` | P2 | Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes | L |
| E-02 | App-wide (47 files and 14 CSS modules) | All | Backward-compat aliases are for old code only | 426 legacy alias classes (`text-brown-mid` 151, `text-brown-dark` 88, `green-dark` 59, `brown-light` 32, `red-defect` 30, `cream` 27) and 166 legacy variables in CSS modules. By area: cupping 166, Insights 152, arrival 53, offline 21. | worst files: `PhysicalEvalForm.tsx` 46, `CupClient.tsx` 41, `FlavorPicker.tsx` 27, `PivotBuilder.tsx` 23; modules `AffectiveBubbles` 24, `MasterControls` 23, `CupToggleGrid` 22, `SessionShell` 20 | P2 | A mechanical rename to the role names; decide `green-mid`; delete the alias block; a test that fails on a new one | M |
| E-03 | `/app/sessions/[id]/cup`, `/app/sessions/[id]/waiting`, offline and cupping dialogs (8 files) | All | Border radius tokens | 15 legacy radius classes, which paint 21, 28 and 42 px (not the 24 to 48 px DESIGN.md states) on buttons, banners and a dropdown. | `CupClient.tsx:3103,3137,3181`; `OfflineBanner.tsx:120`; `SyncConflictModal.tsx:57,65`; `EvaluationGuardModal.tsx:91,99,107`; `WaitingRoomClient.tsx:423` | P2 | `Button`, `rounded-card`, `rounded-input` | S |
| E-04 | App-wide | All | No literal in a component | About 33 inline styles carry a design value, 294 arbitrary font sizes, 10 shadow literals (3 Tailwind `shadow-md/lg`, 7 in modules), 8 pixel radii where `--radius-pill` exists, 85 `bg-white` / `text-white` / `border-white`. | `PivotTable.tsx:94-219`; `PhaseStepper.tsx:40-100`; `InsightCardComposer.tsx:309-353`; `groups/page.tsx:132`; `IntensitySlider.module.css` | P2 | Tokens and classes | M |
| E-05 | `/app/sessions/[id]/results`, `/app/sessions/[id]/cup` | All | Terracotta is an accent, not a notice colour | 14 notice banners are painted in terracotta (`border-secondary/30 bg-secondary-container/20`): nine on results, five on the cup page, for plain information such as "Vista de administrador". The descriptor counter turns old amber, then old red, at its limit. | `ResultsClient.tsx:967-1145`; `CupClient.tsx`; `CATAPills.tsx:27-31` | P2 | New primitive needed: `Notice` (info, warning, error) | M |
| E-06 | `/app/sessions/[id]/cup` (docked footer) | All | Glass on paper: overlays and side panels only | The docked cupping bar blurs 8 px of the form behind it. | `CanvasFooter.module.css:13-14` | P3 | An opaque surface with a hairline, or amend the rule | S |
| F-01 | `/app/sessions/[id]/results`, every tab | 375 x 667, 390 x 844, 768 x 1024, 1440 x 900, ES and EN | White space has a ceiling; data speaks first; one action per fold | On a closed group session the docked header (269 px) and the owner's docked footer of six stacked export buttons (272 px; a participant has three) leave 17 px for content at 375 x 667 and 194 px at 390 x 844; no score is in the first fold. At 1440 x 900 the header (253) and footer (68) leave 64 % of the screen; at 768 the footer row is cut. Two nested scrollers. | `measure/app-sessions-id-results.phone.es.small-m-dock.json`; `app-sessions-id-results.phone.es.small-first-fold.png` (375 x 667, what is seen without scrolling); `ResultsClient.tsx:838-959,1379-1449` | P1 | One "Exportar" button that opens a sheet; the header scrolls away, only the tabs stay; one scroll container | M |
| F-02 | `/app/sessions/[id]/cup` (affective, combined) | 375, 390 and 1440, ES and EN | Touch targets 44 x 44 px | The nine rating bubbles paint 28 x 28 px with 3 px gaps on phones (and 28 px at 1440): the most-tapped control of the app. | `AffectiveBubbles.module.css:39-46,57-63`; `measure/app-sessions-id-cup.phone.es.small-m-aff.json` | P1 | 34 px bubbles with a 44 px hit area (a transparent `::before`, as the slider does); the form flush to the screen on phones | S |
| F-03 | App-wide (14 places): `/app/sessions/[id]/cup`, `/app/sessions/[id]/results`, `/app/sessions/new`, `/app/coffees`, `/app/insights/access`, Top bar | 375, ES | Touch targets: 24 px is the floor never crossed | Controls under 24 px: descriptor sub-pills 21 px, cloud words 6 to 19 px, "Editar muestra" 15 px, checkboxes 14 x 14, "Ver →" 28 x 14, the "EN" switch 13 x 14, access switches 35 x 21 (510 of them), "Omitir introducción" 18 px, the unsynced-drafts link 18 px. | measure `targetsUnder24Count`: coffees 25, results Descriptores 40, access 510, new session 12 | P1 | New primitive needed: `TextAction` (a link-styled button in a 44 px box); 44 px minimum for chips and checkboxes | L |
| F-04 | App-wide (shared kit, about 15 screens) | 375 and 1440, ES | Touch targets: sizes written in pixels (the root is 14 px) | The shared kit paints under 44 px: dialog close 32, `InfoHint` 33, row icon actions 27, inputs and selects 39 to 42 (`h-11` paints 38.5), `Button size="sm"` 32 to 37, `SegmentedControl` 37, `PhaseStepper` 40, `SampleTabs` 39, descriptor pills 26, sidebar items 36. | `ResponsiveDialog.module.css:98`; `SessionShell.module.css:286`; `PhaseStepper.tsx:92`; measure `targetsUnder44` | P2 | Raise the minimum once, in `Button`, `Select`, `SearchInput`, `PillTabs`, `SegmentedControl` and the dialog close (`min-h-[44px]`) | L |
| F-05 | `/app/sessions/[id]/cup` | 375 x 667, ES | White space has a ceiling; calm before complexity | The cupping chrome takes 203 to 247 px of 667 (30 to 37 %; 291 with details open). The form is a card inside a padded canvas: 62 of 375 px go to frames, which is what shrinks the bubbles and cuts the scale labels to "EXTREMADAMENTE BA…" at 7.5 px. | `measure/app-sessions-id-cup.phone.es.small-m-aff*.json`; `SessionShell.module.css:254` | P2 | Timer link into the header row; one-line footer labels; the form flush on phones; the sample key in the details panel | M |
| F-06 | `/app/sessions/[id]/cup`, combined, step 1 | 375 x 667, ES | The main action is reachable without scrolling | The quality bubbles (y 591 to 619) sit behind the sticky footer (top 603): the cupper scrolls to rate quality on every sample. | `measure/app-sessions-id-cup.phone.es.small-m-comb.json` | P2 | Collapse the picked descriptors to one line on phones, or change the order inside the step (waits on Kim) | M |
| F-07 | App-wide content grids: `/app`, `/app/coffees/[id]`, `/app/profile`, `/app/insights`, `/app/sessions/[id]/results`, `/app/sessions/[id]/cup`, `/app/groups` | 768 x 1024 and windows of 900 to 1100 px, ES | Breakpoint rule; a tablet is a small desktop | 19 content arrangements switch at `lg` (1024) by window width and ignore the 210 px sidebar: a tablet gets the phone arrangement stretched, and a 1000 px window gets a narrower layout than a 1024 px one. Six grids have a third or fourth layout; the cupping shell has four bands of its own (640, 768, 1024). | grep of `lg:` arrangement classes; `SessionShell.module.css:24,28,72,171,186`; `groups/page.tsx:127,155,190`; `app.tablet.es.png` | P1 | Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only | L |
| F-08 | `/app/sessions/[id]/results`, Resultados (Gráfico) | All | Trust through precision; white space has a ceiling | The radar has no fixed scale, so each card draws its own; ticks are 9 px; one card is 661 to 676 px tall and eight make a 7,079 px page on a phone. | `SampleRadarChart.tsx:347`; measured (`v-` measure files) | P1 | A fixed 1 to 9 scale; one dot plot instead of eight radars | M |
| F-09 | App-wide (the page frame) | 1440, ES | Layout: container and outer margin | The shell sets no maximum width and 21 px of padding (14 below 1024): "Container max 1280 px, outer margin 48 px" is not built. Seven content widths and three alignments are in use; forms sit in a 588 px left column with 621 px empty beside them. | `app/[locale]/app/layout.tsx:171`; measure `main` | P2 | New primitive needed: `PageContainer` (wide, form, narrow), one alignment | M |
| F-10 | App-wide (vertical rhythm) | 375, 768 and 1440, ES | White space has a ceiling: one scale, never set per section | 13 distinct gap values and 7 card paddings: page header to first section 0, 14 to 17, 21, 28 or 35 px by page; section to section 17.5, 21, 27.5 or 35; heading to content 3.5 to 21. | layout measurements (`d-layout` gaps) | P2 | The paper spacing scale of `PLAN.md` as classes | L |
| F-11 | `/app`, `/app/sessions/[id]/results`, `/app/insights`, `/app/sessions/[id]/edit`, `/app/sessions/[id]/invite` | 1440 and 768, ES | A card is as wide as its content needs | Stat cards stretched to the row (387 x 111 for about 150 px of content); "Mi desempeño" is 467 x 827 holding three numbers; edit sections are 1,188 px wide for short inputs; the invite card is 1,188 x 366 for one link and a 206 px QR. | layout measurements (`cards`); `app.desktop.es.png` | P2 | Stat cards capped at 240 px in an auto-fill grid; forms in the form container | M |
| F-12 | Sidebar, Bottom navigation, Top bar, `/app/sessions/[id]/cup` | 768 x 1024, ES and EN | A tablet is a small desktop (a question for the owner) | A tablet gets the phone shell (top bar and a 5 or 6 tab bottom bar) until 1024; the warm-up disappears from the navigation, and "Cambiar de cuenta" and sign-out are not in the shell. The cupping screen shows its own 220 px sidebar from 641 px, so the two halves of the app disagree at 768, and the bubbles' "Final" box is cut. | `navItems.ts:51`; `TopBar.tsx:20-25`; `BottomNav.tsx:19`; `SessionShell.module.css:88-115`; `app.tablet.es.png`; `app-sessions-id-cup.tablet.es.combined-solo-owner.png` | P2 | Decision 3: an icon rail from 768 | M |
| F-13 | `/app/coffees` | 768, ES | Breakpoint rule | At 768 the nine-column table is 855 px in 738, scrolls sideways, and the name column is about 45 px wide: names break one word per line and rows are 107 to 137 px tall. | measure `tables` (`9c10r 855/738`); `app-coffees.tablet.es.admin-all-coffees.png` | P2 | Hide origin, process and variety between 768 and 1023 (`Column.hideOnMobile` exists) | S |
| F-14 | Bottom navigation, Top bar | 375 to 1023, ES and EN | Touch targets; names | Six tabs for an analytics user (62 px each), 10.5 px labels, the active tab marked by colour only. The top bar paints 49 px and its one control is the 13 x 14 px language switch. | `BottomNav.tsx:27-40`; `TopBar.tsx:16-24` | P2 | Five tabs at most; 12 px labels; a 44 px box for the switch | S |
| F-15 | `/app`, `/app/sessions/[id]/cup`, `/app/coffees/[id]` | 375 and 1440, ES | Calm before complexity | Polish: long Spanish footer labels wrap to 64 px ("Enviar y ver resultados"); the open timer adds 44 px of chrome; the explainer card fills the first fold of `/app` for returning users; prose runs 96 to 110 characters per line. | `measure/…small-m-aff-notes.json`; `…small-m-aff-timer.json`; layout measurements (`paras`) | P3 | Shorter labels; a collapsed explainer; `max-w-[68ch]` on prose | S |
| G-01 | `/app/sessions/[id]/cup`, `/app/sessions/[id]/waiting`, `/app/sessions/[id]/results`, loading skeletons | All, reduced motion on | Reduced motion: nothing pins, slides or pulses | Not guarded by `prefers-reduced-motion`: the save pulse, smooth auto-scroll of the step and sample rows, the waiting room's bounce, skeleton pulses, the radar (600 ms) and the bars. No number is animated and no total is shown while cupping. | `SessionShell.module.css:172,186`; `PhaseStepper.tsx:33`; `SampleTabs.tsx:46`; `WaitingRoomClient.tsx:405`; `SampleRadarChart.tsx:366`; `DescriptorFrequency.tsx:124` | P2 | One global reduced-motion reset; `scrollIntoView` honours it; chart animation off | S |
| H-01 | App-wide (4 places): `/app/sessions/[id]/results`, `/app/sessions/[id]/cup`, `/app`, `/app/coffees` | All, ES | Text contrast 4.5 : 1 | Flavour-family colours used as text and as pill backgrounds: 1.97 to 4.11 : 1 ("Caramelizado" 1.97, "Ácido/Fermentado" 2.31, "Dulce" 2.64). Also the dashboard step numerals 1.7, the cup stepper's step numbers 4.27 at 11 px (from hex `#8B7355`), the coffees process cell 3.34 at 10.5 px. | measure `lowContrast` in `…closed-group-combined-descriptores`, `app-sessions-id-cup…small-m-comb`, `app.phone.es.small-m`; `PhaseStepper.tsx:84` | P1 | Family colours for dots and bars only; a neutral pill with a coloured dot; the stepper on tokens | M |
| H-02 | `/app/sessions/[id]/results`, Descriptores (word cloud) | 375, 390 and 768, ES and EN | Text size and contrast; touch targets | The cloud is scaled to 0.53 at 390 px: words paint 5.9 to 19.7 px, 15 of 30 under 12 px; 15 of 30 are under 4.5 : 1, the lowest at 1.97; each word is a button as small as 6 px; no count and no number of cuppers is shown. At 1440 it is legible (16.5 to 66 px). | measured in the page (`v-` measure files); `components/results/WordCloud.tsx`; `lib/wordCloud.ts` | P1 | Replace it with the counted bars and a counted flavour wheel (`RESULTS-DIAGNOSIS.md`) | M |
| H-03 | `/app/sessions/[id]/cup` | 1440, ES | Focus: every focused element is visible; order follows reading order | The app shell stays in the tab order under the full-screen cupping layer: the first 10 Tab presses land on invisible controls, "Cerrar sesión" among them; the first visible stop is press 11. | `SessionShell.module.css:1-10`; `app/[locale]/app/layout.tsx:147-179`; focus walk `…d-focus-affective` | P1 | Make the shell `inert` while the cupping screen is mounted | M |
| H-04 | `/app/sessions/[id]/cup`, `/auth/login`, every form | 1440, ES | Focus: a visible ring on every interactive element | The intensity slider keeps keyboard focus on an input at opacity 0 with no focus style: focus cannot be seen. Fields show a 25 % ring (about 1.5 : 1) or only a border change; notes use `outline: none`; `Button` relies on the browser default. | `IntensitySlider.module.css:17`; `LoginForm.tsx:171`; `Select.tsx:28`; `SearchInput.tsx:27`; `Notes.module.css:23` | P1 | One focus token (2 px `primary-container` outline, 2 px offset) on every control | M |
| H-05 | `/app` (recent sessions) | 1440, ES | Text contrast | Hovering a recent session turns the row dark green while its text stays dark (about 1.3 : 1): the name cannot be read; the border change also shifts the row 3 px. | `app/[locale]/app/page.tsx:308`; `app.desktop.es.d-hover-recent.png` | P1 | Hover `bg-surface-container-low`, as `DataTable` rows | S |
| H-06 | App-wide: Sidebar, Bottom navigation | All | Focus order; names | No skip link (10 shell stops before the page on every screen, sign-out is stop 10); neither navigation marks the current page with `aria-current`; the `<nav>` landmarks have no label. The landmarks themselves exist. | `Sidebar.tsx:31-53`; `BottomNav.tsx:22-43`; `layout.tsx:171` | P2 | A "Saltar al contenido" link; `aria-current="page"`; labelled navs | S |
| H-07 | `/app/sessions/new`, `/app/sessions/[id]/edit`, `/app/insights/access` | All, ES | Names: every control has an accessible name | In the wizard and the edit form the labels are not tied to their fields: the date and cups inputs have no name, and the warm-up and group switches take theirs only from a neighbouring text. On the access page each switch loses its name under 640 px, where its label text is hidden. | `NewSessionForm.tsx:291,1063,1589`; `EditSessionForm.tsx:431,444,495,520`; `AccessManager.tsx:105-111` | P1 | `htmlFor` or `aria-labelledby` to the visible label; a hidden label on phones | S |
| H-08 | `/app/sessions/[id]/cup`, `/app/sessions/[id]/results` | 1440, ES and EN | Toggles and tabs | The rating bubbles are nine Tab stops per attribute (72 per sample) with Spanish-only names; `PillTabs` and `SegmentedControl` claim `tablist` with no arrow keys, no `aria-controls` and no panel. | `AffectiveBubbles.tsx:30-38`; `PillTabs.tsx:28-47`; `SegmentedControl.tsx:18-28` | P2 | A radio group and real tabs: one Tab stop, arrow keys | M |
| H-09 | `/app/sessions/[id]/results` (owner matrix), Bottom navigation | All | Colour is never the only carrier of meaning | The distance band of a matrix cell is its background colour only; the active bottom tab is colour and stroke only. | `OwnerParticipantSection.tsx:339-386`; `BottomNav.tsx:27-40` | P2 | A marker in the cell; `aria-current` and a bar on the tab | S |
| H-10 | `/app/sessions/[id]/results`, `/app/coffees`, `/app/sessions` | 1440 | Table semantics | Row headers are `td`; no caption; the actions column header is empty; row checkboxes are 14 x 14; sort buttons are 14 px tall. | `ScoreTable.tsx:298`; `OwnerParticipantSection.tsx:345-386`; `DataTable.tsx:64,174,427,473-480` | P3 | `th scope="row"`, a hidden caption, a 24 px label around the checkbox | S |
| I-01 | App-wide (words) | ES and EN | The same word for the same thing | The organiser is "maestro" (18), "organizador" (15), "dueño" (5), and in English organizer, master, owner and host. "Cerrar sesión" means sign out and close a cupping. "Iniciar cata" names three actions. The score is puntaje (78), puntuación (12), calificación (5); the event is sesión, cata and catación. | `messages/es.json:12,66,208,567,647,737,741`; counts by script | P1 | A glossary in DESIGN.md with a test (decision 9) | M |
| I-02 | Sidebar, Top bar, `/auth/login`, `/auth/confirm`, `/auth/claim`, `/join/[token]`, `/privacidad` | All, ES and EN | Spanish first; one brand | Four names for the product: "cafesensible.ai" (landing), "Cata Café Sensible" (shell, a 14 px span that is not a link), "Cata Café" (dashboard copy, group invitations), "Café Sensible" (titles, PDFs, the score's name). Sign-in, confirm, join, claim, not-found and legal show no brand mark. | `Sidebar.tsx:27`; `TopBar.tsx:18`; messages `brand.name`, `dashboard.intro.why`; `auth-login.desktop.es.png` | P2 | One name and one shared `Wordmark` (decision 8) | S |
| I-03 | `/app/sessions/[id]/cup`, `/app/sessions/[id]/results`, `/app` | EN | English mirrors the Spanish structure | English shows Spanish: the cup form's section titles and attribute labels ("Impresión Global", "Sensación en Boca"), the physical and origin forms, "Sin marcar", the results table and radar labels, the dashboard's ABIERTA / CERRADA / COMBINADO pills, "1 samples". 71 inline `locale === "es"` dictionaries bypass the message files (which themselves match: 2,059 keys each). | `AffectiveForm.tsx:149`; `CombinedForm.tsx:162,303`; `lib/constants.ts:20-27`; `PhysicalEvalForm.tsx:88-218`; `ScoreTable.tsx:49`; `FormatBadge.tsx:7-11`; `app.phone.en.png` | P1 | Message keys for every label; plural forms | M |
| I-04 | `/app`, `/app/sessions/[id]/waiting`, The onboarding dialog | ES and EN | A first screen has a word budget; drawings, not emoji | The dashboard title carries an emoji and its intro card has an 11-word title and 60 words of body (404 words on the page); the waiting room has 21 words under a 52.5 px emoji used as a picture. | `measure/app.desktop.es.json`; `app/page.tsx:282`; `WelcomeModal.tsx:115`; `app-sessions-id-waiting.phone.es.participant.png` | P2 | Rewrite to the budget; a still formation instead of the emoji | S |
| I-05 | App-wide (copy) | ES and EN | Spanish first; one voice | 23 em dashes in Spanish app copy and 27 in English; Title Case mixed with sentence case ("Siguiente Muestra", "Resultados de la Sesión"); "roster", "insight" and "benchmark" in Spanish; a masculine "Bienvenido" beside "Catador/a"; the legal pages use usted, the app tú. | message scan (`msgs.js` tone); `FlavorPicker.tsx:35-56`; `CupClient.tsx:2464` | P2 | A copy pass and copy rules in DESIGN.md | M |
| I-06 | App-wide (error messages, plurals), The pending-drafts badge | ES and EN | An error says what happened and what to do | 9 of 27 error codes do not say what to do (`invalid_token`, `token_expired`, `not_found`, `invalid_input`, ...). Plurals are wrong: "1 borradores sin sincronizar", "1 samples", "1 muestras". The badge calls the same thing "borradores" on one page and "notas" on another. | `messages/es.json` `errors.codes`; `app-sessions-id-results.desktop.es.closed-group-combined-resumen.png`; `app-groups-id.desktop.es.owner.png` | P3 | A next step in each message; ICU plurals; one word for an unsent draft | S |
| I-07 | `/app/coffees/[id]` | All | Nothing said twice | The coffee page has three lists of scores and seven sentences in a row in the lifetime card; attribute bars start at 0 on a 1 to 9 scale. | `coffees/[id]/page.tsx:298-535`; `app-coffees-id.desktop.es.many-sessions-admin.png` | P2 | One score block: number, context, arithmetic on demand | M |
| J-01 | `/app/sessions` | All, ES and EN | An error keeps the person's work and offers a way forward; a task is not blocked | One session with a closing date in the year 20228 makes the whole sessions list fail with "Algo salió mal" for anyone whose list includes it (seen through the admin lens; the owner's and participants' lists run the same code). A date field accepted a five-digit year, and one bad row takes down the list. The cron will never close that session. | `app/[locale]/app/sessions/page.tsx:60`; server log "RangeError: Invalid time value"; `edges-error-boundaries.desktop.es.sessions-list-failed.png`; session `cmt7ih71p000204jlfm9fm764` | P0 | Outside the design work: correct the row, refuse years beyond four digits, format dates defensively | S |
| J-02 | App-wide empty lists: `/app/groups`, `/app/coffees/[id]`, `/app` | All | Every list has a designed empty state with one action | `EmptyState` is used 5 times; 22 empty lists print a plain line. | `groups/page.tsx:125,188`; `coffees/[id]/page.tsx:405,452,485`; `app/page.tsx:353,399` | P2 | `EmptyState` with one action | M |
| J-03 | App-wide (loading) | All | A screen that waits shows a skeleton or a status | Skeletons exist for `/app` and `/app/sessions/[id]` only; error boundaries for `/app` and the cup page only (the boundary itself works and keeps the shell). | `app/[locale]/app/loading.tsx`; `app/[locale]/app/sessions/[id]/loading.tsx` | P3 | Route-shaped skeletons for results and cup | S |
| J-04 | `/app/sessions/[id]/cup` | All | An error keeps the person's work; say what happened | Browser back is guarded, but "Salir a sesiones" and "Resultados" bypass the guard, and on a phone the exit is inside the drawer. A close reaches a participant only as a redirect (2 to 30 s, never offline), with no message. | `CupClient.tsx:1355-1416,1558-1606,2717-2725`; `cup/page.tsx:83-85` (from code, not seen) | P2 | One guarded exit, visible on phones; a "La sesión se cerró" notice before the redirect | S |
| J-05 | `/app/sessions/[id]/results`, descriptive session | All, ES and EN | Data speaks first: every format has a designed result | A descriptive session's Resumen is three "—" stat cards, six "Sin puntaje" rows and a legend about 79 points; its one useful line is truncated at about 40 characters; Gráfico is empty, the matrix is all "—", and the owner never sees the group's intensities. | `app-sessions-id-results.desktop.es.closed-group-descriptive-resumen.png`; `ResumenTab.tsx:371` | P1 | A first view for descriptive sessions: descriptors and intensities per coffee (waits on Kim for what an intensity average means) | M |
| J-06 | `/app/insights/explorer` | All | An error keeps the person's work and offers a way forward | The explorer loads its data with an action called without a guard: when that request fails (seen with the audit tool, which blocks it; a dropped connection would do the same) the whole page is replaced by "Algo salió mal" instead of a notice. | `components/insights/ExplorerBuilder.tsx:96-113`; `app-insights-explorer.desktop.es.png` | P2 | The shared `useActionFeedback` pattern: a toast, the page stays | S |

## 7. Platform-level improvements

What is wrong or missing across the whole app, one cause each (26 of the findings are
app-wide). The order is the order of `PLAN.md`.

**Tokens and base styles**

- **Base rules outside the layers** (B-01): move the heading rule into `@layer base`; decide the title
  colour once.
- **One paper type scale** as named tokens with a floor (B-02, B-05), instead of 32 sizes.
- **One colour system** (E-01, E-02, E-03, E-04): rename the 426 alias classes and 166 variables,
  replace the old hex palette, delete the alias block, and extend the landing's source scans to the app
  so new drift fails a test.
- **One focus indicator** on every control, fields included (H-04).
- **One reduced-motion reset** (G-01).

**Shared primitives that are missing**

- `PageContainer` and the **paper spacing scale** (F-09, F-10): the page frame.
- `Card` and `Notice` (D-07, E-05); a paper `SectionHeading` (B-04); `TextAction` for small actions
  (F-03); `ScoreWithContext` for every score with its n, spread and flags (A-07); a `Wordmark` (I-02);
  `ArrivalStage` for the screens of arrival (K-01).
- Specs for each are in `PLAN.md`.

**Shared primitives that exist and are not used, or paint too small**

- `Button` (about 120 hand-made buttons, C-05), `Badge` / `StatusPill` (31 hand-made pills, D-08),
  `PageHeader` (9 of 36 pages, B-03), `EmptyState` (5 of 27 empty lists, J-02), `ConfirmDialog` (C-09),
  `DataTable` (D-13).
- The kit's own minimum sizes: 32 to 42 px where 44 is the rule, because of the 14 px root (F-04).

**The shell**

- No skip link, no `aria-current`, unlabelled navigation (H-06); the cupping screen lies over the shell
  instead of replacing it (H-03).
- A tablet gets the phone's shell and the phone's content arrangement (F-07, F-12).
- The brand: four names, no mark after the landing (I-02).

**Patterns seen on many screens**

- Several primary buttons per fold and the same ask in two places (C-01, C-06).
- Long forms with the one action far below the fold (C-08).
- View state that does not survive a reload, "back" or a language switch (D-01).
- Six recipes for moving between sibling views (D-02) and progress without numbers (D-04).
- Colour standing for a value (A-04, A-05, A-06) and flavour colours used as text (H-01).
- Words: no glossary (I-01), Spanish shown in English (I-03), copy rules not written down (I-05).

## 8. Screen-level improvements

Per screen, what to change, ranked by level. Only findings that name the screen are listed; the
app-wide causes of section 7 apply to every screen as well. The fix column of the findings table says
how.

**`/auth/login`** (mean 2.5 of 4)
- P1 · H-04 · One focus token (2 px `primary-container` outline, 2 px offset) on every control
- P2 · E-01 · Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes
- P2 · I-02 · One name and one shared `Wordmark` (decision 8)

**`/auth/confirm`** (mean 2.9 of 4)
- P2 · D-11 · One arrival card: h1, one sentence on what to do, one `ButtonLink`
- P2 · I-02 · One name and one shared `Wordmark` (decision 8)

**`/auth/claim`** (mean 2.5 of 4)
- P2 · I-02 · One name and one shared `Wordmark` (decision 8)

**`/join/[token]`** (mean 2.4 of 4)
- P2 · D-11 · One arrival card: h1, one sentence on what to do, one `ButtonLink`
- P2 · E-01 · Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes
- P2 · I-02 · One name and one shared `Wordmark` (decision 8)

**`/join/coffee/[token]`** (mean 2.2 of 4)
- P2 · D-11 · One arrival card: h1, one sentence on what to do, one `ButtonLink`

**The onboarding dialog** (mean 2.0 of 4)
- P1 · C-04 · Say "abre el enlace o escanea el QR", or add a paste-link field
- P2 · D-04 · Numbered `.rail-step`; a "2 / 5" counter; an edge fade or a `Select` for filters on phones
- P2 · I-04 · Rewrite to the budget; a still formation instead of the emoji

**`/app`** (mean 1.7 of 4)
- P1 · A-09 · Count closed sessions, or label it "sesiones"
- P1 · C-01 · One primary per fold; the intro card and the empty state point to the header action in words
- P1 · F-07 · Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only
- P1 · H-01 · Family colours for dots and bars only; a neutral pill with a coloured dot; the stepper on tokens
- P1 · H-05 · Hover `bg-surface-container-low`, as `DataTable` rows
- P1 · I-03 · Message keys for every label; plural forms
- P2 · A-04 · A score's value is always `on-surface`; drop `accent` for scores
- P2 · B-04 · New primitive needed: paper `SectionHeading`
- P2 · D-08 · `Badge`, `StatusPill`, `ScorePill`, `Button size="sm"`
- P2 · F-11 · Stat cards capped at 240 px in an auto-fill grid; forms in the form container
- P2 · I-04 · Rewrite to the budget; a still formation instead of the emoji
- P2 · J-02 · `EmptyState` with one action
- P3 · F-15 · Shorter labels; a collapsed explainer; `max-w-[68ch]` on prose

**`/app/sessions`** (mean 2.2 of 4)
- P0 · J-01 · Outside the design work: correct the row, refuse years beyond four digits, format dates defensively
- P1 · C-01 · One primary per fold; the intro card and the empty state point to the header action in words
- P2 · C-06 · One rule: the header carries the action; the empty state points to it
- P2 · D-13 · `DataTable` with search and pagination; the whole card is the link, actions in a menu
- P3 · H-10 · `th scope="row"`, a hidden caption, a 24 px label around the checkbox

**`/app/sessions/new`** (mean 2.0 of 4)
- P1 · F-03 · New primitive needed: `TextAction` (a link-styled button in a 44 px box); 44 px minimum for chips and checkboxes
- P1 · H-07 · `htmlFor` or `aria-labelledby` to the visible label; a hidden label on phones
- P2 · C-08 · A sticky action bar for forms (the `CanvasFooter` recipe); numbered sections
- P2 · D-05 · One list of samples, each with an optional coffee
- P3 · D-06 · `PageHeader backHref` on every detail and create page

**`/app/sessions/[id]/edit`** (mean 2.4 of 4)
- P1 · H-07 · `htmlFor` or `aria-labelledby` to the visible label; a hidden label on phones
- P2 · C-08 · A sticky action bar for forms (the `CanvasFooter` recipe); numbered sections
- P2 · C-09 · `ConfirmDialog`, marked destructive where it is
- P2 · F-11 · Stat cards capped at 240 px in an auto-fill grid; forms in the form container

**`/app/sessions/[id]/invite`** (mean 2.4 of 4)
- P2 · F-11 · Stat cards capped at 240 px in an auto-fill grid; forms in the form container
- P3 · D-06 · `PageHeader backHref` on every detail and create page

**`/app/sessions/[id]/waiting`** (mean 1.8 of 4)
- P1 · C-03 · Remove it, or a ghost "Comprobar ahora"
- P2 · E-01 · Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes
- P2 · E-03 · `Button`, `rounded-card`, `rounded-input`
- P2 · G-01 · One global reduced-motion reset; `scrollIntoView` honours it; chart animation off
- P2 · I-04 · Rewrite to the budget; a still formation instead of the emoji

**`/app/sessions/[id]/cup`** (mean 1.6 of 4)
- P1 · B-03 · `PageHeader` everywhere; a visually hidden h1 on cup and print
- P1 · C-02 · The item only navigates; the footer button is the one submit
- P1 · F-02 · 34 px bubbles with a 44 px hit area (a transparent `::before`, as the slider does); the form flush to the screen on phones
- P1 · F-03 · New primitive needed: `TextAction` (a link-styled button in a 44 px box); 44 px minimum for chips and checkboxes
- P1 · F-07 · Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only
- P1 · H-01 · Family colours for dots and bars only; a neutral pill with a coloured dot; the stepper on tokens
- P1 · H-03 · Make the shell `inert` while the cupping screen is mounted
- P1 · H-04 · One focus token (2 px `primary-container` outline, 2 px offset) on every control
- P1 · I-03 · Message keys for every label; plural forms
- P2 · A-06 · One selected colour. Decision 5
- P2 · A-08 · Put the state in the flow of the header row, 12 px minimum, never cut "sin sincronizar"
- P2 · A-10 · "Enviar" in group sessions; the waiting card says an email will come and shows the person's own evaluation
- P2 · C-10 · One green primary; the stage change is said in the label
- P2 · D-01 · View state in the URL (`?tab=`, `?sample=`, `?step=`, `?q=`); a history entry when a dialog opens
- P2 · D-04 · Numbered `.rail-step`; a "2 / 5" counter; an edge fade or a `Select` for filters on phones
- P2 · D-12 · Radix dialog (as `ResponsiveDialog`); close on select; translated labels
- P2 · E-01 · Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes
- P2 · E-03 · `Button`, `rounded-card`, `rounded-input`
- P2 · E-05 · New primitive needed: `Notice` (info, warning, error)
- P2 · F-05 · Timer link into the header row; one-line footer labels; the form flush on phones; the sample key in the details panel
- P2 · F-06 · Collapse the picked descriptors to one line on phones, or change the order inside the step (waits on Kim)
- P2 · F-12 · Decision 3: an icon rail from 768
- P2 · G-01 · One global reduced-motion reset; `scrollIntoView` honours it; chart animation off
- P2 · H-08 · A radio group and real tabs: one Tab stop, arrow keys
- P2 · J-04 · One guarded exit, visible on phones; a "La sesión se cerró" notice before the redirect
- P3 · E-06 · An opaque surface with a hairline, or amend the rule
- P3 · F-15 · Shorter labels; a collapsed explainer; `max-w-[68ch]` on prose

**`/app/sessions/[id]/results`** (mean 1.4 of 4)
- P0 · A-01 · One gate, "the evaluation was sent", for the results page, the print page and the PDF. Decision 10
- P0 · A-03 · Key by descriptor id, or merge only inside one block
- P1 · A-02 · One gate where the payload is built (`gateSampleForViewer`): per-attribute group values from 3 included cuppers. Decision 6
- P1 · A-05 · Δ in ink with its sign; alignment on one neutral bar (or the sanctioned distance tones)
- P1 · A-07 · New primitive needed: `ScoreWithContext` (number, ±, n, flags, reference); one word for the group score
- P1 · A-12 · After close: "5 no enviaron"
- P1 · A-13 · List only words that map to the wheel; find where the fragments are saved (FlavorPicker or the aggregation)
- P1 · B-03 · `PageHeader` everywhere; a visually hidden h1 on cup and print
- P1 · D-09 · Reorganise by coffee (`RESULTS-DIAGNOSIS.md`, direction 1)
- P1 · D-10 · A card per coffee with the score first; one block at a time through the existing `SegmentedControl`
- P1 · F-01 · One "Exportar" button that opens a sheet; the header scrolls away, only the tabs stay; one scroll container
- P1 · F-03 · New primitive needed: `TextAction` (a link-styled button in a 44 px box); 44 px minimum for chips and checkboxes
- P1 · F-07 · Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only
- P1 · F-08 · A fixed 1 to 9 scale; one dot plot instead of eight radars
- P1 · H-01 · Family colours for dots and bars only; a neutral pill with a coloured dot; the stepper on tokens
- P1 · H-02 · Replace it with the counted bars and a counted flavour wheel (`RESULTS-DIAGNOSIS.md`)
- P1 · I-03 · Message keys for every label; plural forms
- P1 · J-05 · A first view for descriptive sessions: descriptors and intensities per coffee (waits on Kim for what an intensity average means)
- P2 · A-04 · A score's value is always `on-surface`; drop `accent` for scores
- P2 · A-10 · "Enviar" in group sessions; the waiting card says an email will come and shows the person's own evaluation
- P2 · A-11 · People everywhere, each count printed with its n
- P2 · B-04 · New primitive needed: paper `SectionHeading`
- P2 · B-06 · `align: "right"` and `tabular-nums` for numeric columns in `DataTable`; `tabular-nums` on matrix cells
- P2 · C-07 · Hide it once the session is closed or expired
- P2 · D-01 · View state in the URL (`?tab=`, `?sample=`, `?step=`, `?q=`); a history entry when a dialog opens
- P2 · D-04 · Numbered `.rail-step`; a "2 / 5" counter; an edge fade or a `Select` for filters on phones
- P2 · E-05 · New primitive needed: `Notice` (info, warning, error)
- P2 · F-11 · Stat cards capped at 240 px in an auto-fill grid; forms in the form container
- P2 · G-01 · One global reduced-motion reset; `scrollIntoView` honours it; chart animation off
- P2 · H-08 · A radio group and real tabs: one Tab stop, arrow keys
- P2 · H-09 · A marker in the cell; `aria-current` and a bar on the tab
- P3 · C-11 · A switch
- P3 · D-06 · `PageHeader backHref` on every detail and create page
- P3 · H-10 · `th scope="row"`, a hidden caption, a 24 px label around the checkbox

**`/app/sessions/[id]/print`** (mean 2.2 of 4)
- P0 · A-01 · One gate, "the evaluation was sent", for the results page, the print page and the PDF. Decision 10
- P1 · B-03 · `PageHeader` everywhere; a visually hidden h1 on cup and print

**`/app/coffees`** (mean 2.2 of 4)
- P1 · F-03 · New primitive needed: `TextAction` (a link-styled button in a 44 px box); 44 px minimum for chips and checkboxes
- P1 · H-01 · Family colours for dots and bars only; a neutral pill with a coloured dot; the stepper on tokens
- P2 · B-06 · `align: "right"` and `tabular-nums` for numeric columns in `DataTable`; `tabular-nums` on matrix cells
- P2 · C-06 · One rule: the header carries the action; the empty state points to it
- P2 · F-13 · Hide origin, process and variety between 768 and 1023 (`Column.hideOnMobile` exists)
- P3 · H-10 · `th scope="row"`, a hidden caption, a 24 px label around the checkbox

**`/app/coffees/new`** (mean 2.3 of 4)
- P2 · C-08 · A sticky action bar for forms (the `CanvasFooter` recipe); numbered sections
- P3 · D-06 · `PageHeader backHref` on every detail and create page

**`/app/coffees/[id]`** (mean 2.0 of 4)
- P1 · B-03 · `PageHeader` everywhere; a visually hidden h1 on cup and print
- P1 · F-07 · Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only
- P2 · A-04 · A score's value is always `on-surface`; drop `accent` for scores
- P2 · B-04 · New primitive needed: paper `SectionHeading`
- P2 · C-09 · `ConfirmDialog`, marked destructive where it is
- P2 · I-07 · One score block: number, context, arithmetic on demand
- P2 · J-02 · `EmptyState` with one action
- P3 · D-06 · `PageHeader backHref` on every detail and create page
- P3 · F-15 · Shorter labels; a collapsed explainer; `max-w-[68ch]` on prose

**`/app/coffees/[id]/edit`** (mean 2.4 of 4)
- P2 · C-08 · A sticky action bar for forms (the `CanvasFooter` recipe); numbered sections

**`/app/groups`** (mean 2.0 of 4)
- P1 · F-07 · Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only
- P2 · C-06 · One rule: the header carries the action; the empty state points to it
- P2 · J-02 · `EmptyState` with one action

**`/app/groups/[id]`** (mean 2.0 of 4)
- P2 · B-04 · New primitive needed: paper `SectionHeading`

**`/app/profile`** (mean 2.0 of 4)
- P1 · B-03 · `PageHeader` everywhere; a visually hidden h1 on cup and print
- P1 · F-07 · Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only
- P2 · B-04 · New primitive needed: paper `SectionHeading`

**`/app/profile/history`** (mean 2.7 of 4)
- P2 · B-06 · `align: "right"` and `tabular-nums` for numeric columns in `DataTable`; `tabular-nums` on matrix cells
- P3 · D-06 · `PageHeader backHref` on every detail and create page

**`/app/insights`** (mean 1.6 of 4)
- P1 · B-03 · `PageHeader` everywhere; a visually hidden h1 on cup and print
- P1 · F-07 · Content layouts at `md`, or container queries on `<main>`; `sm:` changes padding only
- P2 · B-04 · New primitive needed: paper `SectionHeading`
- P2 · D-03 · Use the shared `isActive()`
- P2 · D-04 · Numbered `.rail-step`; a "2 / 5" counter; an edge fade or a `Select` for filters on phones
- P2 · E-01 · Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes
- P2 · F-11 · Stat cards capped at 240 px in an auto-fill grid; forms in the form container

**`/app/insights/explorer`** (mean 1.8 of 4)
- P2 · D-03 · Use the shared `isActive()`
- P2 · E-01 · Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes
- P2 · J-06 · The shared `useActionFeedback` pattern: a toast, the page stays

**`/app/insights/benchmark`** (mean 1.9 of 4)
- P2 · D-03 · Use the shared `isActive()`
- P2 · E-01 · Tokens; charts through `getChartColors()`; retire or document the avatar and process palettes

**`/app/insights/users`** (mean 2.3 of 4)
- P2 · B-06 · `align: "right"` and `tabular-nums` for numeric columns in `DataTable`; `tabular-nums` on matrix cells

**`/app/insights/access`** (mean 1.5 of 4)
- P1 · F-03 · New primitive needed: `TextAction` (a link-styled button in a 44 px box); 44 px minimum for chips and checkboxes
- P1 · H-07 · `htmlFor` or `aria-labelledby` to the visible label; a hidden label on phones
- P2 · D-13 · `DataTable` with search and pagination; the whole card is the link, actions in a menu

**Sidebar** (mean 2.1 of 4)
- P2 · F-12 · Decision 3: an icon rail from 768
- P2 · H-06 · A "Saltar al contenido" link; `aria-current="page"`; labelled navs
- P2 · I-02 · One name and one shared `Wordmark` (decision 8)

**Bottom navigation** (mean 2.2 of 4)
- P2 · F-12 · Decision 3: an icon rail from 768
- P2 · F-14 · Five tabs at most; 12 px labels; a 44 px box for the switch
- P2 · H-06 · A "Saltar al contenido" link; `aria-current="page"`; labelled navs
- P2 · H-09 · A marker in the cell; `aria-current` and a bar on the tab

**Top bar** (mean 2.0 of 4)
- P1 · F-03 · New primitive needed: `TextAction` (a link-styled button in a 44 px box); 44 px minimum for chips and checkboxes
- P2 · F-12 · Decision 3: an icon rail from 768
- P2 · F-14 · Five tabs at most; 12 px labels; a 44 px box for the switch
- P2 · I-02 · One name and one shared `Wordmark` (decision 8)

**The pending-drafts badge** (mean 2.4 of 4)
- P3 · I-06 · A next step in each message; ICU plurals; one word for an unsent draft

**`/privacidad`** (mean 2.8 of 4)
- P2 · I-02 · One name and one shared `Wordmark` (decision 8)

## 9. Where the stage could come in (dimension K)

Opportunities, not findings. `DESIGN.md` allows the dark ground and the dots on arrival, in a waiting
room, as a still illustration in an empty state and at a session's closing moment; never behind a form,
a table or a cupping.

| Id | Screen | What is there today | What the stage version would be | Size |
|---|---|---|---|---|
| K-01 | `/auth/login`, `/auth/confirm`, `/auth/claim`, `/join/[token]`, `/join/coffee/[token]` | A cream page with a hand-made card and no brand mark (7 cards in `#FDFBF7`, about 12 states). | The stage ground, the wordmark, the language switch, and the form on a solid card: one `ArrivalStage` wrapper. The dots never sit under the card. | M |
| K-02 | `/app/sessions/[id]/waiting` | A 52.5 px emoji, a gradient button in old colours, bouncing dots. | The stage behind the status only; the participant list and the start button on a solid surface; a still "gathering" formation. | M |
| K-03 | `/app/sessions`, `/app/coffees`, `/app/groups`, `/app` (empty states) | `EmptyState` with an icon in a circle; an emoji on the dashboard. | A small still formation drawn from the landing's own shapes, on paper. | M for the first, S for each one after |
| K-04 | `/app/sessions/[id]/results`, closed session | The results open straight onto the tabs. | A cover on the stage for a closed session, with the panel's flavour wheel (`RESULTS-DIAGNOSIS.md`, direction 3). Needs the rule in DESIGN.md widened: decision 4. | L |
| K-05 | Sidebar, Top bar | "Cata Café Sensible" as a 14 px span that does not link home. | One `Wordmark` component, the landing's, in the shell and on the arrival screens. | S |

## 10. Proposed corrections to `DESIGN.md`

Proposals only: the document is not edited in this round. Each comes from a finding that showed a rule
to be wrong, missing or impossible to test.

| Where | Today | Proposed | Why |
|---|---|---|---|
| Typography: Type Scale | Lists 32, 24, 20 px beside classes that paint 26.25, 21, 17.5; no floor | The painted values as named tokens (page, section, card, body, caption, label), body 14 px, nothing under 11 px, data never under 12 px | B-02. Decision 1 picks the values |
| Typography | Says page titles are `text-primary-container` | Whatever decision 2 settles, stated once | B-01: today every title paints ink |
| How this document governs | (missing) | "Base element styles live in `@layer base`", with a test | B-01 |
| Border Radius | `rounded-md/lg/xl` = 24, 32, 48 px | They paint 21, 28, 42 px at the 14 px root; they are not for paper | E-03 |
| Spacing / Layout Patterns | "Container max 1280 px, outer margin 48 px" | Three content widths (wide 1200, form 640, narrow 400), one alignment, margins 16 / 24 / 32, and a paper rhythm table next to the stage's | F-09, F-10: the stated container was never built |
| Breakpoint rule | Content at `md`, shell at `lg` | Add: content responds to its column, not the window (container queries); `sm:` changes padding only; the cupping shell uses the same edges | F-07 |
| Component Patterns: Card | A class recipe | Name the component; "a notice is not a card" | D-07, E-05 |
| No quality bands | Lists three meanings colour may carry | Add: "a score's value is always `on-surface`"; "a difference is never coloured by its direction"; rule on the rating bubble per decision 5 | A-04, A-05, A-06: untestable today |
| Flavor Family Colors | "Only in `CATAPills` and family labels" | For dots, bars and arcs only; never as text or as the background of text | H-01 |
| (new) Data display | (missing) | One counting unit per view, named ("personas"); every count with its n; a fixed scale per measure; chart text 12 px and 4.5 : 1 | A-11, F-08, H-02 |
| Interactive control vocabulary | Three primitives | Add: the selected state of a tab, chip or segment never uses the action fill | C-01: "one primary per fold" cannot be measured otherwise |
| Bringing the stage into the app: keep the reader's place | A principle | Add: "view state lives in the URL" (tab, sample, step, filter, open dialog), preferences do not | D-01 |
| An ask appears once | For forms | Add how a list's header action and its empty state relate | C-06 |
| Accessibility | A table of measures | Name the focus indicator; "a composite control is one Tab stop with arrow keys"; "a full-screen layer makes what is under it inert"; "44 px is measured painted; `h-11` paints 38.5"; a docked-chrome budget on a 375 x 667 phone; one reduced-motion reset | H-03, H-04, H-08, F-01, F-04, G-01 |
| Design Principles: Spanish first | A principle | Add a glossary (organizador, catador, sesión, cata, muestra, puntaje, Salir) and copy rules: sentence case, no em dash in prose, tú in the app and usted in the legal pages, no emoji, no English word where a Spanish one exists | I-01, I-05 |
| (new) Brand mark | (missing) | One name, one `Wordmark` component, and where it appears | I-02 |
| Glass and grain on paper | Overlays and side panels only | Say whether a docked bar over a form may blur | E-06 |
| Where the dots may appear | "A session's closing moment: once, briefly, never over the numbers" | Only if decision 4 says yes: "the cover of a closed session" | K-04 |
| Auditing against this system | Scans exist for the landing only | The same scans for the app: hex, alias classes, text under the floor, legacy radius | E-01, E-02 |
