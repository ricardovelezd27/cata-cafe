---
domain: cupping-protocol
researched: 2026-11-06
model: claude-sonnet
flows: [every session flow (solo, express, group live, group async), cup form (descriptive / affective / combined), reveal and close, results, PDFs and reports, reference sample, physical and extrinsic data]
---

# Cupping protocol: the bar for Café Sensible

Evidence grading: **[SCA]** = SCA page or standard; **[2nd]** = secondary study guide restating the standard (the primary SCA-102 to 105 PDFs could not be read in this pass); **[Conv]** = industry convention, not a standard; **[Sci]** = sensory-science literature. Where a number rests only on [2nd], verify it against the SCA PDFs before treating a mismatch as a bug.

## 1. Scope

Covers how a professional cupping runs and what forms, scoring and reports must respect: the SCA Coffee Value Assessment (CVA) family, sample preparation and timeline, blinding, calibration, descriptor capture, physical and extrinsic data, group dynamics, and what incumbent tools do. It does NOT cover auth, offline engineering, PDF layout or database design (other briefs). Section 7 lists practice questions only a coffee expert (Kim) can settle.

## 2. Principles

**P1. CVA is a family of separate assessments, not one form.** Physical (based on the 2004 green grading), Descriptive (SCA-103), Affective (SCA-104), Extrinsic (SCA-105), with sample preparation in SCA-102 (2024 versions); an evaluator may complete one or all four. They replaced the 2004 cupping form and protocol. Rationale: keeping what you perceive apart from how much you like it reduces bias. Source: [SCA value assessment, 2026] [SCA].

**P2. Descriptive measures intensity, never quality.** Seven sections (fragrance, aroma, flavor, aftertaste, acidity, sweetness, mouthfeel) each get an intensity on a 0 to 15 scale (low about 0, medium about 5, high 10 and above), rated for the whole section, not per note; "intensity does not imply quality". The nearest integer is recorded. Source: [Open Exam Prep SCA-103, 2025] [2nd].

**P3. Descriptors are check-all-that-apply with hard caps.** Olfactory list (fragrance and aroma, shared) up to 5; retronasal flavor/aftertaste list up to 5; main tastes (salty, sour, sweet, bitter, umami) up to 2; mouthfeel up to 2 (rough, oily, smooth, mouth-drying, metallic). Acidity and sweetness have intensity plus freely elicited words, no checklist. Bitter is checked only if it stands out. Caps force the cupper to choose what is salient. Research on CATA: short (10-17) and long (20-28) lists give broadly similar results, long lists of near-synonyms dilute responses, and term order can change conclusions about sample differences. Source: [Open Exam Prep SCA-103, 2025] [2nd]; [Jaeger 2015 abstract] [Sci].

**P4. Affective measures quality or preference on a 9-point scale, for eight items.** Fragrance, aroma, flavor, aftertaste, acidity, sweetness, mouthfeel, overall. 1 extremely low, 5 neither high nor low, 9 extremely high. "Overall" is rated last, is not an average of the others, and covers balance and preference. The form states a purpose (market or use) that ratings are relative to. Source: [Open Exam Prep SCA-104, 2025] [2nd]; [SCA value assessment, 2026] [SCA].

**P5. Score S = 0.65625 x (sum of eight ratings) + 52.75 - 2u - 4d, rounded to the nearest 0.25.** Sum 40 gives 79.00; sum 72 gives 100.00. u = non-uniform cups, d = defective cups. The SCA publishes an affective score calculator; the app must match it. Source: [Open Exam Prep SCA-104, 2025] [2nd]; calculator named on [SCA value assessment, 2026] [SCA].

**P6. Defects are narrow; uniformity is about character, not strength.** Only potato, moldy and phenolic count as defects, and a defect counts only if both cup numbers and defect type are recorded. Fermented, sour, papery, woody, grassy, roasty are described and reflected in ratings, not marked as defects. A cup is non-uniform only when a distinctly different characteristic is present or absent (better or worse); intensity differences from brewing error are ignored. Every defective cup is also non-uniform unless the coffee is evenly defective across all cups. Source: [Open Exam Prep SCA-104 5.4.1-5.4.2, 2025] [2nd].

**P7. Five cups per sample is the protocol; the uniformity test needs independent cups.** Each cup is ground and brewed separately. Two or three cups are common in informal cupping. The CVA descriptive form dropped uniformity, so descriptive-only work is flexible about cup count. What fewer than five cups does to the u/d deductions is not specified in anything found (see Q1). Source: [Open Exam Prep SCA-104, 2025] [2nd]; [Royal Coffee, 2025] [Conv].

**P8. Preparation is standardized so cups are comparable.** 8.25 g to 150 mL (about 1:18, weighed before grinding), grind with 70-75% passing a #20 sieve, water about 93 C (SCA-102: 93 plus or minus 3 C), coffee rested 8-24 h after roasting, lidded glasses of 207-266 mL. Source: [Royal Coffee, 2025] [Conv, SCA-derived]; [Open Exam Prep SCA-102, 2025] [2nd]. Roast colour targets (Agtron) come from the older protocol; not confirmed for SCA-102.

**P9. The timeline is parallel and temperature-led.** Pour all cups, leave the crust 3-5 minutes (4 is common), break with about three stirs while smelling, skim after all crusts are broken, start liquoring near 70 C (older guidance: about 170 F, 10-15 min after pouring), and make at least three liquoring rounds as the cup cools. Because impressions shift with temperature, the form allows a second mark with an arrow and a final value. Source: [Open Exam Prep SCA-102, 2025] [2nd]; [Royal Coffee, 2025] [Conv]; [Open Exam Prep SCA-104, 2025] [2nd].

**P10. Samples are blind and coded.** Random alphanumeric codes with a key prepared in advance. Single-blind is the norm; double-blind (the table setter does not know either) is offered by tools. Source: [Royal Coffee, 2025] [Conv]; [Cropster help, 2025] [Conv].

**P11. Ratings are independent; agreement is information, not correctness.** Cuppers must not influence one another, and under SCA-104 alignment between cuppers is "neither positive nor negative" (the score expresses preference or market fit). Discuss after ratings are committed. Source: [Open Exam Prep SCA-104, 2025] [2nd].

**P12. Calibration is a separate activity from scoring.** Practised forms: blind flights with repeated samples (drill: five coffees with two repeats, re-taste any section differing by more than one point), side-by-side reference coffees, grind and roast replication. No dedicated calibration module was found in Cropster's public help. Source: [Open Exam Prep practicals, 2025] [2nd]; [Cafe Imports, 2025] [Conv].

**P13. A fixed-score anchor sample is not a documented SCA practice.** All fives giving 79.00 is a property of the formula, but pinning a reference sample's ratings is a product innovation. In the industry a reference is a known coffee for comparison, not a forced rating. Label the pin as a teaching device. Source: inference from [Open Exam Prep SCA-104, 2025] [2nd] and [Cafe Imports, 2025] [Conv].

**P14. Vocabulary should come from the SCA/WCR Flavor Wheel and Sensory Lexicon.** The WCR lexicon has about 110 attributes with physical references on a 15-point scale; the wheel was built from it. Free text complements, not replaces, the checklist. Source: [WCR Sensory Lexicon, 2017] [Sci]; [PMC5215420, 2017] [Sci].

**P15. Physical and extrinsic are per-coffee, not per-cupper.** Physical (colour, defects, moisture, size) describes the green lot; extrinsic (certifications, traceability, processing) is information beyond the cup; neither is a sensory rating. Source: [SCA value assessment, 2026] [SCA].

**P16. Notes explain, they do not duplicate.** Affective notes justify ratings and should not repeat descriptive notes. Source: [Open Exam Prep SCA-104, 2025] [2nd].

**P17. Forms keep paper edit semantics.** Integers only, no erasing (second mark plus arrow), selection limits respected. Source: [Open Exam Prep practicals, 2025] [2nd].

## 3. Audit checklist

1. Are descriptive and affective stored and scored separately, with no quality score derived from descriptive intensities? (P1, P2)
2. Does the descriptive form offer exactly seven sections with 0-15 integer intensity? (P2)
3. Is each descriptive intensity validated as an integer 0-15 on the server? (P2, P17)
4. Are the CATA caps (5 olfactory, 5 retronasal, 2 main tastes, 2 mouthfeel) enforced in UI and on save? (P3)
5. Do acidity and sweetness accept free words instead of a forced checklist? (P3)
6. Is descriptor order stable or deliberately randomized, and documented? (P3)
7. Does the affective form have exactly eight items on 1-9 with the SCA labels? (P4)
8. Is "overall" rated separately and never auto-filled from the other seven? (P4)
9. Does the form capture or show the purpose (market/use) the ratings refer to? (P4)
10. Does the score match 0.65625 x sum + 52.75 - 2u - 4d with SCA anchors (40 = 79.00, 72 = 100.00)? (P5)
11. Is rounding to 0.25 applied exactly once, in one place? (P5)
12. Is a defect type (potato, moldy, phenolic only) required whenever a cup is marked defective? (P6)
13. Is every defective cup also counted non-uniform unless all cups are defective? (P6)
14. Are cup numbers, not only counts, recorded for non-uniform and defective cups? (P6)
15. Is behaviour for fewer than five cups explicit, documented and visible to the cupper? (P7)
16. Do prep instructions and the form follow the session's configured cup count? (P7, P8)
17. Does the app show the SCA-102 prep parameters (dose, ratio, water temperature, timing)? (P8, P9)
18. Are sample codes random and unrelated to coffee name or order, with the key hidden until reveal? (P10)
19. Is the coffee identity hidden from blind participants in UI, API, PDFs and emails? (P10)
20. Are other cuppers' scores and descriptors hidden until the cupper submits? (P11)
21. Is inter-cupper agreement shown as a neutral statistic, never right/wrong? (P11)
22. Can a cupper revise a rating as the cup cools while the final value is what is scored? (P9, P17)
23. Is the pinned reference labelled as a teaching device and excluded from rankings and averages? (P13)
24. Are descriptor lists sourced from the SCA/WCR wheel, with a defined route for free text outside it? (P14)
25. Is physical data owner-only per sample and extrinsic data hidden until reveal? (P15)
26. Does the affective-only format avoid descriptor UI entirely? (P1, P2)
27. Are descriptive and affective notes separate fields? (P16)
28. Is there a workflow for repeated blind samples and a comparison of the repeats? (P12)
29. Are SD and small-n caveats shown when few cuppers or cups contribute? (P11, P12)
30. Do forms and PDFs state which SCA standard version (SCA-102 to 105, 2024) they follow? (P1)

## 4. Anti-patterns

- **One blended score mixing intensity and liking.** CVA keeps them apart. (P1, P2)
- **Using the 2004 form as the bar.** The ten-attribute form and its 80-point "specialty" cutoff do not transfer; the study guide warns against heritage assumptions about where 80 falls. (P5)
- **Defect as a catch-all.** Marking sour or woody as defective inflates penalties; only three types count. (P6)
- **Counting strength differences as non-uniform.** (P6)
- **Unlimited descriptors per section.** Defeats salience selection. (P3)
- **Showing community results before the cupper submits.** Anchors and breaks independence. (P11)
- **Leaking identity** through sample order, label or file name. (P10)
- **Presenting disagreement as error.** In SCA-104 it is neutral; in calibration it is a teaching moment. (P11)
- **Presenting the pinned reference as an SCA standard.** (P13)
- **Free-text-only descriptors.** Cannot be aggregated. (P14)
- **Demanding physical and extrinsic data from every cupper at the table.** (P15)
- **Silently changing the maths for fewer cups.** (P7)

## 5. Native-app considerations

All [Conv]: inference from how a cupping table works, not from a published standard.

- **One hand, one thumb.** The other hand holds a spoon; gloves or wet fingers. Large targets for 1-9 and 0-15 inputs; avoid precision gestures and offer undo.
- **Screen stays awake** during the 3-5 minute crust wait and 15+ minutes of liquoring.
- **Lighting.** Bright lamps or dim labs; check both themes for glare.
- **Order follows the table.** Next/previous by sample and cup should match how cups physically move around the table.
- **Quiet and private.** No sounds or shared reveals during scoring (P11).
- **Poor signal** is common in roasteries and labs; local drafts must survive (offline brief).

## 6. Vocabulary

| Spanish | English | Meaning |
|---|---|---|
| Cata / catación | Cupping | Standardized sensory evaluation of brewed coffee |
| Catador/a | Cupper, taster | Person evaluating |
| Evaluación descriptiva | Descriptive assessment (SCA-103) | Intensities + descriptors, no quality |
| Evaluación afectiva | Affective assessment (SCA-104) | Quality/preference, 9-point scale |
| Evaluación extrínseca | Extrinsic assessment (SCA-105) | Value information beyond the cup |
| Evaluación física | Physical assessment | Green coffee colour, defects, moisture, size |
| Escala hedónica | Hedonic scale | Like/dislike scale; here 1 to 9 |
| Intensidad | Intensity | Amount of a characteristic, 0 to 15 |
| CATA (marque todo lo que aplique) | Check-all-that-apply | Pick-list descriptor method |
| Descriptores | Descriptors | Flavor/aroma/mouthfeel terms |
| Rueda de sabores | Flavor wheel | SCA/WCR Coffee Taster's Flavor Wheel |
| Léxico sensorial | Sensory lexicon | WCR vocabulary with physical references |
| Fragancia | Fragrance | Smell of dry ground coffee |
| Aroma | Aroma | Smell of wet grounds / crust |
| Sabor | Flavor | Taste plus retronasal aroma |
| Sabor residual | Aftertaste | Persistence after swallowing or spitting |
| Acidez | Acidity | Perceived sour quality and intensity |
| Dulzor | Sweetness | Perceived sweetness |
| Sensación en boca / cuerpo | Mouthfeel / body | Texture |
| Impresión general | Overall | Last affective item, not an average |
| Taza uniforme / no uniforme | Uniform / non-uniform cup | Cup differs in character from the others |
| Taza defectuosa | Defective cup | Potato, moldy or phenolic |
| Papa | Potato defect | Raw-potato-like taint |
| Fenólico | Phenolic | Medicinal, iodine, antiseptic taint |
| Costra | Crust | Layer of grounds floating after pouring |
| Romper la costra | Break | Stirring the crust to release aroma |
| Desnatar | Skim | Removing foam and grounds |
| Sorber | Slurp | Aerating sip |
| Muestra a ciegas | Blind sample | Cupper does not know the coffee |
| Doble ciego | Double-blind | Neither setter nor cupper knows |
| Muestra de referencia | Reference sample | Known coffee for comparison (app also pins it) |
| Calibración | Calibration | Aligning cuppers' use of scales and terms |
| Revelación | Reveal | Disclosing coffee identity after scoring |
| Desviación estándar | Standard deviation | Spread of individual scores |
| Muestra repetida | Repeat sample | Same coffee presented twice to test consistency |
| Tamiz #20 | #20 sieve | Grind check, 70-75% should pass |

## 7. Open practice questions (for Kim)

1. **Fewer than five cups: what happens to uniformity and defect deductions?** The SCA wording we found assumes five independent cups. Options: (a) charge the fixed 2 and 4 points per cup anyway, (b) scale the penalty to the cups tasted, (c) allow the checks only with five cups, (d) switch the penalty off below five. Matters because teaching sessions often use one to three cups, and scores diverge from official ones depending on the choice.
2. **Is a one-cup or two-cup tasting still "CVA" when you teach?** Options: call it a training tasting and reserve CVA wording for five-cup sessions, or call all of it CVA. Matters for report labels and credibility with SCA-trained users.
3. **Is the pinned 79.00 reference good teaching practice, or confusing?** Options: keep it, make it optional, or use a real calibration coffee scored freely. Matters because it hides the cupper's real baseline and affects averages and spread.
4. **When a reference is used, what comparison helps students?** Options: difference from the reference, from the teacher, from the group mean, or none. Matters for whether disagreement feels like error or information.
5. **Is the teacher's score an answer key students see afterwards, or one cupper among others?** Matters for separating calibration sessions from open tastings, and for whether the master's ratings may be visible before students submit.
6. **Discuss before or after scoring?** Options: always after submission; teacher-controlled release; only after reveal. Matters for independence and for the live group flow.
7. **When should identity be revealed: per sample, at the end, or at the teacher's click?** Matters for blind integrity and for assigning coffees after close.
8. **How many repeats make a calibration flight, and how do you judge a cupper consistent?** The study-guide drill uses two repeats in five with a one-point tolerance; formal panel standards (ISO 8586 family, not read here) use repeatability and agreement statistics. Options: show repeat differences only, or compute a consistency score. Matters for whether a repeat-sample feature is needed.
9. **What does a trainer want to see per student?** Options: score against group mean; per-attribute deviations; descriptors chosen against group frequency; repeat consistency. Matters for the teacher dashboard and for what other students may see.
10. **Is a ranking of students acceptable in class?** Options: teacher sees names; students see anonymous position; nobody sees ranking. Matters for classroom comfort.
11. **Should intensity sliders start unset or at a midpoint?** A default value biases data and makes "untouched" look like "medium". Matters for descriptive data quality.
12. **How should free-text descriptors outside the wheel be treated?** Options: keep as written, map to the nearest wheel term, hold for teacher approval. Matters for descriptor frequency reports and shared vocabulary.
13. **Is the cap of five descriptors per section right for beginners?** Options: keep five, fewer for beginners, more for experts. Matters for noise in frequency charts and for onboarding.
14. **In the combined format, same pass or separate passes for descriptive and affective?** The SCA keeps them separate forms. Matters for form order and bias.
15. **Should the app prompt temperature moments (hot, warm, cool)?** Options: none, optional timer, guided three-pass flow. Matters because acidity, sweetness and aftertaste change as the cup cools, and the paper second-bubble-with-arrow has no obvious digital twin.
16. **Should the app record roast, grind and dose actually used?** Options: nothing; roast date and level only; full SCA-102 parameters per session. Matters for explaining odd scores and comparing sessions.
17. **How should the green (physical) assessment fit a class?** Options: owner-only per sample as now; per coffee record only; skip in classes. Matters for form length at the table.
18. **Should students state the affective purpose (market or use)?** Matters because affective scores are relative to a stated market; leaving it blank makes them look absolute.
19. **Which score bands, if any, should be displayed?** The sources found give no official grade thresholds for the new scale. Options: none; teacher-defined bands; only the anchors (79 and 100). Matters for avoiding false "specialty / not specialty" claims.
20. **Which official Spanish SCA CVA wording should be mirrored exactly?** The SCA publishes a Spanish form. Matters so students recognise attribute and descriptor names.

## 8. Sources

1. SCA, The Coffee Value Assessment (CVA), 2026: https://sca.coffee/value-assessment [SCA]
2. Open Exam Prep, SCA-104 affective assessment and scoring, 2025: https://open-exam-prep.com/study-guides/sca-q-grader/cva-descriptive-affective/cva-affective-form-scoring [2nd]
3. Open Exam Prep, defects, uniformity and practicals, 2025: https://open-exam-prep.com/study-guides/sca-q-grader/cva-descriptive-affective/cva-defects-uniformity-practicals [2nd]
4. Open Exam Prep, SCA-103 descriptive form, 2025: https://open-exam-prep.com/study-guides/sca-q-grader/cva-descriptive-affective/cva-descriptive-form [2nd]
5. Open Exam Prep, SCA-102 cupping steps, 2025: https://open-exam-prep.com/study-guides/sca-q-grader/sca-102-sample-prep-cupping/cupping-steps-sca-102 [2nd]
6. Royal Coffee, Cupping Protocols and Procedures (SCA-based), 2025: https://cdn.royalcoffee.com/wp-content/uploads/2025/03/14132346/Cupping-Protocols-Procedures.pdf [Conv]
7. Cropster help, double-blind cupping session, 2025: https://help.cropster.com/cupping/how-to-set-up-a-double-blind-cupping-session [Conv]
8. Cafe Imports, cupping and calibration, 2025: https://www.cafeimports.com/europe/blog/?p=45039 [Conv]
9. World Coffee Research, Sensory Lexicon (2.0, 2017): https://worldcoffeeresearch.org/work/sensory-lexic [Sci]
10. Coffee Taster's Flavor Wheel construction, 2017: https://pmc.ncbi.nlm.nih.gov/articles/PMC5215420 [Sci]
11. Jaeger et al., CATA list length, 2015 (abstract): https://riquim.fq.edu.uy/items/show/659 [Sci]

**Not found / not verified:** primary SCA-102 to 105 PDFs; ISO 8586 and ISO 11132 text; Tastify and Cupping.coffee documentation; SCA-105 extrinsic detail; exact SCA-102 roast specification. Treat [2nd] items as to be confirmed against the SCA PDFs.
