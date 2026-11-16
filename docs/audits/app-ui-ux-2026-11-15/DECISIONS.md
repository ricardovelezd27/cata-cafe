# Decisions only Ricardo can take, and what waits on Kim

> Part of the app UI/UX audit of 2026-11-15 (`REPORT.md`). Each decision has its options and a
> recommendation. Finding ids are those of `REPORT.md`; package names are those of `PLAN.md`.
> The numbers are stable: findings and the plan refer to them.

## For Ricardo

### Decisions that unblock the cheap, cross-cutting work

**1. Which type scale is the real one** (B-02; package T4)
The document lists 32, 24 and 20 px headings; the classes paint 26.25, 21 and 17.5 because the root is
14 px. Body text paints 12.25 px.

- (a) Paint the document's sizes: page 32, section 24, card 20.
- (b) Keep the sizes people see and write them down: page 26.25, section 21, card 17.5.
- In both, body text becomes 14 px and nothing is under 11 px.
- **Recommendation: (b).** Titles of 32 px are loud for a screen where someone works, and (b) keeps the
  classes most headings already have. The real change for a user is body text going from 12.25 to
  14 px.

**2. The colour of a title** (B-01; package T2)
One CSS rule cancels the colour of every heading today, so titles paint ink although the document says
green.

- (a) Green page titles, as `DESIGN.md` says: every title in the app changes colour when the rule is
  fixed.
- (b) Ink everywhere, as people see today; green stays for actions and the wordmark. `DESIGN.md` is
  changed to match.
- **Recommendation: (b).** It fixes the rule with no visible change, and keeps green meaning "you can
  act here".

**3. What a tablet gets from the app's shell** (F-12, F-07; package P6)
On the landing you decided "a tablet is a small desktop". In the app a 768 px tablet gets the phone's
top bar and bottom bar, and the phone's stacked content; the cupping screen shows a sidebar at the same
width, so the two halves disagree. Screenshots: `shots/app.tablet.es.png`,
`shots/app-sessions-id-cup.tablet.es.combined-solo-owner.png`.

- (a) Keep the phone shell up to 1024 px.
- (b) An icon rail of about 72 px from 768 px (the bottom bar turned on its side, with all the items,
  the language and the account), and the full sidebar from 1280 px; content arranged by the width of
  its column.
- (c) The full 210 px sidebar from 768 px: it leaves about 516 px, too little for tables and results.
- **Recommendation: (b).**

### Decisions about the results screens

**11. The direction for the results** (D-09; packages S1 to S4)
See `RESULTS-DIAGNOSIS.md`, section 7.

- (1) One card per coffee; a coffee's sheet one step away; an owner's "Panel".
- (2) Tabs by question ("Ranking", "Cada café", "Tú" or "Panel"): lighter, the coffee stays split.
- (3) A dark cover with the panel's flavour wheel, on top of 1 or 2.
- **Recommendation: (1) now, and the flavour wheel of (3) as a later step.** Whatever you choose, S1
  (one "Exportar" button, the header scrolls away) can start at once: it gives a phone its screen
  back.

**12. The word cloud** (H-02, A-03, A-11)

- (a) Remove it; the counted bars ("7 de 8 catadores") answer the question.
- (b) Replace it with a counted flavour wheel per coffee.
- (c) Keep it and repair it (count people, show counts, fix the merge and the contrast).
- **Recommendation: (a) now and (b) when S4 is built.** (c) repairs a display that still cannot
  compare coffees or be read on a phone.

**13. The "Mejor muestra" card** (A-04)

- (a) Remove it: row 1 of the ranking already says it.
- (b) Keep it, in ink, as "Primera del ranking".
- (c) Make it an eye-catching winner: this breaks "a score is never coloured or named by quality".
- **Recommendation: (a).**

**4. "More wow" on the results, and the stage** (K-04; package S4)
Your wish for an eye-catching results page meets three rules: no score coloured by quality, no animated
number, and the stage only where nothing is entered or decided ("never over the numbers").

- (a) The "wow" comes from order, type and one drawing: the flavour wheel, with the family colours.
  No rule changes.
- (b) As (a), plus a dark cover for a closed session, like the landing's. `DESIGN.md` would be widened
  from "a closing moment, once, briefly" to "the cover of a closed session".
- (c) Colour or motion on the scores themselves: breaks the product rules.
- **Recommendation: (a) first; (b) once the content is in order, if you still want it.**

**6. Group averages when only two people cupped** (A-02)
With two cuppers, the group's average per attribute lets each work out the other's ratings. The
comparison block already hides group values under three cuppers; the table and the chart do not. The
group total has the same property and is shown by design.

- (a) Per-attribute group values only from three included cuppers, everywhere.
- (b) Leave it: two people who cup together know who the other is.
- (c) Hide the group total as well under three.
- **Recommendation: (a).** It makes one rule of two. (The rule it extends rests on a simulated answer
  of Kim's, B3.)

**7. A participant's "alignment" percentage** (results, "Mi desempeño")
It reads as a grade of the person.

- (a) Owner only. (b) Keep it for the participant with neutral wording. (c) Remove it.
- **Recommendation: (a).**

**10. A cupper's own total before sending** (A-01; package F2)
Today a cupper who has filled the eight ratings can open the results (or the form, or the PDF) and see
their total without having sent. The product rule says the total appears after "Enviar".

- (a) Show the total only for a sent evaluation, everywhere.
- (b) Keep it as it is, and change the rule to "after the eight ratings are filled".
- **Recommendation: (a).** It is what the rule says and why it exists: nobody decides the number and
  works backwards.

### Decisions about the cupping screen

**5. Does "no quality bands" cover a 1 to 9 rating?** (A-06, A-05)
The selected bubble is terracotta from 7 and error red up to 3. The same idea colours a difference
green or terracotta by its sign, and the alignment bar as a traffic light.

- (a) One colour for a selected bubble; a difference in ink with its sign; the alignment on one
  neutral bar.
- (b) Keep the bubble's tint as a help to the hand, and fix only the difference and the alignment.
- **Recommendation: (a).** Red on "3" says the coffee is bad; red is reserved for defects and errors.
  Worth one question to Kim on whether cuppers use the tint.

**15. The "next" button of the cupping footer** (C-10)
Green for the next sample, terracotta for the next stage.

- (a) One green button; the label says the stage. (b) Keep the two colours.
- **Recommendation: (a).**

### Decisions about words and the brand

**8. The product's name in the app** (I-02; package P4)
Four are in use: "cafesensible.ai", "Cata Café Sensible", "Cata Café", "Café Sensible".

- **Recommendation:** one name, "Café Sensible", with the landing's wordmark in the shell and on the
  arrival screens. The repository and the domain can keep their names.

**9. A glossary** (I-01; package P4)
Proposed: organizador (not maestro, dueño, host), catador, integrante (of a group), sesión (the event),
cata (the act), muestra, puntaje (not puntuación, calificación), "Salir" for signing out so that "Cerrar
sesión" is free for closing a cupping, or the reverse. English: organizer, cupper, member, session,
cupping, sample, score, sign out.

- **Recommendation:** adopt it, written into `DESIGN.md` with a test. The coffee words go past Kim.

**16. Small points of voice** (I-04, I-05)
Each is a yes or no; the recommendation is yes to all.

- A neutral greeting ("Hola, {nombre}") instead of "Bienvenido".
- No emoji, in copy or as a picture.
- Sentence case for titles and buttons ("Siguiente muestra").
- No em dash in prose; an en dash or the word "sin dato" for an empty value.
- The legal pages keep usted; the app keeps tú.
- Spanish words where they exist ("lista" for "roster"); "Insights" and "benchmark" are product names
  and may stay if you want them.

### Other decisions

**14. Which way to start a cupping comes first** (C-01; package S6)
The dashboard's main button is "Catar ahora" (three taps); onboarding sends people to the full wizard.

- **Recommendation:** "Catar ahora" first everywhere; "Nueva sesión" as the quieter second action.

**17. The phone's bottom bar** (F-14)
Six tabs for an analytics user; the warm-up is not in it.

- **Recommendation:** five at most: Insights moves into Perfil for those who have it. Decide together
  with decision 3.

**18. Guests see "Cafés" and "Grupos", which open the "create your account" dialog**
This follows your 2026-09-26 choice of one navigation for everyone.

- **Recommendation:** keep it; lead the dialog with what the guest gains.

**19. Colours that are not in the system** (E-01)
Avatars (a hard-coded palette), process types in the coffees table, the format badges.

- **Recommendation:** neutral format badges; avatars and process colours either derived from the
  flavour tones and written into `DESIGN.md`, or neutral.

**20. Where the audit's results live** (settled 2026-11-16)
The app's score per dimension belongs in the Flowmap's `_meta` document, which already existed, and
this audit was told to add documents only. Ricardo said "Yes, write it" on 2026-11-16: the score per
dimension and the report's name were merged into that record. Nothing else in it changed.

## Waits on Kim

| Question | Why it matters | Finding |
|---|---|---|
| In a descriptive cupping, does a group average of intensities mean anything, or only the frequency of descriptors? | It decides what a descriptive session's result shows; today it shows empty cards | J-05 |
| On a phone, in a combined step, should the quality rating come before the descriptors? | Today the rating is below the fold and behind the footer on every sample | F-06 |
| Do cuppers use the colour of the rating bubble (terracotta for high, red for low)? | Decision 5 | A-06 |
| Do the thresholds "85+", "75 a 84", "menos de 75" of the history filter mean anything, given that a score has no quality band? | It is the one place the app still groups scores by value | (history filter) |
| The coffee words of the glossary | Decision 9 | I-01 |
| "Tú vs. grupo" and the repeated sample rest on simulated answers B3 and B6; group results only at close rests on C5 | The results redesign builds on them | D-09, A-02 |
| The order of a cupping ("Siguiente" runs one attribute across every sample, then the next attribute) | Flow of the cup page; not changed by this plan | (flow) |

## Found in passing: not design, but do not lose it

- **A session with a closing date in the year 20228** (`cmt7ih71p000204jlfm9fm764`, active, group). The
  sessions list fails for whoever has it in their list, and the cron will never close it. The row was
  not touched. Fix: package F1.
- **The cup page sends write requests when it opens** (three or four per load were blocked by the audit
  tool). Probably the draft replay and a first save; worth a look by whoever owns the offline code.
