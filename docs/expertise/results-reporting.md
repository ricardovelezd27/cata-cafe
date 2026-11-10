---
domain: results-reporting
researched: 2026-11-06
model: claude-sonnet
flows: [Resultados, Informes y PDFs]
---

# Results and reporting: expert brief

Evidence note: the web pass was short (about 8 searches, no page fetches). ISO texts are paywalled, so only abstracts were read. Principles tagged *(practice)* come from textbook sensory practice (Lawless & Heymann, 2010; ISO 8586/11132 abstracts) and have no fetched URL; treat them as "to confirm". Tastify and Cupping.coffee were not researched.

## 1. Scope

Covers everything shown or sent after a session closes: the dashboard (ranking, best sample, average, SD, reference and Δ), table and radar views, descriptor views, the per-sample drill-down, the owner matrix with the exclusion toggle, the PDFs (CVA form, participant summary, ficha técnica), the close email, CSV export, and WebView save/share.

It leaves to other briefs: how scores are collected (`cupping-protocol`), session lifecycle (`live-collab`), and offline sync (`offline-native`).

## 2. Principles

1. **Say what the number is.** The CVA keeps the descriptive assessment (intensity and CATA, no judgement) separate from the affective assessment (9-point quality impression), and either can be used independently. A result must name which assessment produced it, and no screen should blend them. Source: SCA, 2024 (sca.coffee/sca-news/sca-new-cva-cupping-standards).
2. **Consensus is centre plus spread.** Show the community mean with SD and n; a mean alone hides disagreement. *(practice: Lawless & Heymann, 2010)*. Cropster gives spread its own "Spread & deviation" view (help.cropster.com, 2025).
3. **Small n gets a caveat.** With very few panelists, SD and community scores are unstable. Below a configured n, label results "indicative" or suppress the SD. No source gives a universal minimum; see §7.
4. **Panel performance is a different question from product results.** ISO 11132:2021 measures whether the panel discriminates between products, whether assessors agree, and whether each assessor repeats their own scores. One session with no replicates cannot show repeatability, so do not claim it. Source: iso.org/standard/76669.html (2021).
5. **Exclusion is a documented, reversible decision.** It is legitimate for a recorded reason (protocol breach, sample mix-up, a defect in that cupper's own cup, an owner's calibration purpose), not because someone disagrees. Cropster lets the owner exclude one evaluator and flags outliers with a "Compare evaluators" view (help.cropster.com, 2025). Every view, PDF and export must show "n of N included" and recalculate identically. ISO 8586 frames assessor monitoring (abstract level only).
6. **A reference sample is context, not a competitor.** It shows what "normal" looks like on this panel today. Show Δ against it, mark it clearly, never rank it with the test samples. *(practice)*
7. **Rank honestly.** If two samples differ by less than the panel's own spread, say "no clear difference" rather than 1st versus 2nd. Show ties as ties and show spread beside rank. "Best sample" needs a definition and a minimum n. *(practice)*
8. **Do not use radar for comparison.** Axis order changes shape and area, area exaggerates small differences, and overlays become unreadable. Prefer dot plots, small multiples or grouped bars for 8 attributes. If radar stays, cap at 2–3 polygons, fix axis order, and put the numbers beside it. Sources: observablehq.com/blog/avoid-radar-charts; blog.scottlogic.com/2011/09/23/a-critique-of-radar-charts (2011).
9. **Colour is never the only channel.** Chart marks need ≥ 3:1 contrast against adjacent colours (WCAG 1.4.11, AA). Add direct labels, shapes or line styles. Datawrapper calls blue with orange the safest pairing and notes that colour-blind-safe categorical palettes top out near four colours (datawrapper.de/blog/create-good-color-palettes).
10. **Tiers are enforced where data is built, not where it is shown.** The participant tier never carries another cupper's name or id; owner-only data (physical, all-cupper matrix) is excluded in the query or builder, not hidden by UI. The same applies to exports and emails. *(practice, data minimisation)*
11. **Hide others until you have submitted.** Seeing peers' scores before committing biases a cupper (anchoring). Group results open after the cupper's own submission or at close. *(practice: Lawless & Heymann, 2010)*
12. **Tagged, structured PDFs.** PDF/UA (ISO 14289) relies on tags, reading order, headings and alt text; contrast is outside its scope and still needs checking. Charts need alt text or an adjacent data table. Set title and language (es). Source: pdf-tools.com/pdf-knowledge/pdf-ua-standard-explained (secondary).
13. **A report is a versioned snapshot.** Stamp the generation time and inclusion state. If the owner edits later (exclusion, sample assignment, extrinsic data), the new PDF must be distinguishable, and a stale copy must not be sent as current. *(practice)*
14. **Email carries a link plus a small attachment; deliverability is its own system.** Use SPF, DKIM, DMARC. Bulk rules apply above about 5,000 messages/day to Gmail (RFC 8058 one-click unsubscribe, spam rate under 0.3%); transactional mail is generally exempt from the unsubscribe requirement. These come from vendor summaries, not Google's pages (resend.com/blog/gmail-and-yahoo-bulk-sending-requirements-for-2024). The attachment size limit was not verified; keep the link in the body as the source of truth.
15. **Delivery is ledgered and honest about who cannot be reached.** Recipients with no email (anonymous guests) are "skipped", not "failed", and have an in-app path to results. Resend retries only the unsent. *(practice)*
16. **Export raw data, not only rankings.** Cropster exports Excel and PDF from a session (help.cropster.com, 2025). Useful CSV rows are one per cupper × sample: session id, sample label, cupper code, the 8 affective values, cup flags, final score, included/excluded, timestamp. No email or display name by default; the export obeys the same tiers as the screen.
17. **Content differs by reader.** A roaster or buyer wants the decision (score, spread, n, descriptors, provenance of the number). A student wants their scores against the group. A teacher wants the calibration view. One document for all three dilutes each. *(practice)*
18. **Small screens need alternatives to wide tables and hover.** Tables collapse to cards with the primary number first; charts work at 375 px and have a text equivalent. Basis: WCAG non-text contrast plus Datawrapper guidance above.
19. **File names carry meaning, not secrets.** Include session name or date, report type and tier; no emails or tokens; slugify accents safely. *(practice)*

## 3. Audit checklist

1. Does every score screen and PDF state which assessment (descriptive, affective, combined) it shows? (P1)
2. Is the community score always shown with n, and with SD when n ≥ 2? (P2)
3. Is there a defined minimum n below which community score or SD is hidden or labelled indicative? (P3)
4. Does any text claim "repeatability" or "panel performance" without replicate data? (P4)
5. Is a cupper exclusion stored with who set it and when, and can it be undone? (P5)
6. Does one exclusion change update dashboard, table, radar, descriptors, PDFs and export from the same source? (P5)
7. Do all views and PDFs show "n of N included" when an exclusion exists? (P5)
8. Is the reference excluded from ranking, average and best-sample, and is each Δ computed from the displayed score? (P6)
9. Can "best sample" be shown with fewer than the minimum n, or when tied within the SD? (P7)
10. Are ties rendered as ties, with no arbitrary order shown as rank? (P7)
11. Does any radar show more than 3 polygons, a non-fixed axis order, or no accompanying numbers? (P8)
12. Do chart series rely on colour alone, and do marks meet 3:1 contrast? (P9)
13. Does the participant-tier builder omit other cuppers' names, ids and physical data in the query, not just in rendering? (P10)
14. Do the CSV export, close email and print page apply the same tier gate as the screen? (P10)
15. Can a participant see group results before they submit, while the session is open? (P11)
16. Do PDFs set document title, language and tagged structure, or document why not? (P12)
17. Do PDF charts have a text alternative or adjacent data table? (P12)
18. Does every PDF show a generation timestamp and inclusion state? (P13)
19. After a post-close change (exclusion, assignment), is an outdated PDF or cached attachment prevented from being served as current? (P13)
20. Does the close email link to results and attach only the participant-tier PDF, from a domain with SPF, DKIM and DMARC? (P14)
21. Is attachment size bounded and checked before sending? (P14)
22. Are no-email recipients recorded as skipped (not failed), with an in-app path to results? (P15)
23. Does resend retry only unsent recipients using the ledger? (P15)
24. Is there an owner CSV export with one row per cupper × sample and without email or display name by default? (P16)
25. Do owner, participant and any public report types have distinct builders rather than one report with sections hidden? (P17)
26. Does the results layout work at 375 px with no hover-only information? (P18)
27. Do PDF file names include session, type and date, and exclude emails and tokens? (P19)

## 4. Anti-patterns

- **Hiding a panelist with CSS or a client filter.** The data stays in the payload and leaks into the PDF or export.
- **Ranking to one decimal.** A 0.1 gap with an SD of 2 reads as a verdict.
- **Averaging a pinned reference into the session mean.** It drags the mean towards the anchor's constant score.
- **Radar with 5+ overlays and rainbow colours.** Unreadable and inaccessible.
- **Different numbers on screen and in the PDF** because each recomputes with its own inclusion rule.
- **Failing the whole send because one guest has no email.**
- **Attaching the full CVA form to every recipient by default.** Large, and owner-gated data risks leaking.
- **Treating consensus as correctness.** A low SD means agreement, not accuracy.
- **Silent late edits.** The PDF a student saved last week no longer matches the screen.

## 5. Native-app considerations

- A WebView often cannot save `blob:` downloads or open `target=_blank` PDFs. Generate the PDF, then hand it to a native save/share path. The Capgo file-sharer plugin takes base64 and offers `share` (share sheet) and `save` (Android MediaStore on Android 10+, iOS save sheet) (capgo.app/plugins/capacitor-file-sharer/, vendor page). One guide says `Filesystem.downloadFile` is deprecated in favour of `@capacitor/file-transfer`; confirm in the official Capacitor docs.
- Large base64 strings across the JS bridge are slow and memory-heavy; prefer a signed URL or streaming for big files. *(practice)*
- Hover tooltips and fixed-width tables fail on touch; use tap-to-reveal and the card layout.
- Android back and iOS swipe-back from a drill-down must not lose tab or filter state.
- Server-side PDF generation needs a connection; say so instead of showing a dead button offline.
- Guests keep results only while the anonymous session lasts, so the claim prompt matters more where an app shell may clear storage.

## 6. Vocabulary

| Spanish | English | Meaning |
|---|---|---|
| Consenso | Consensus | Agreement among cuppers, read as spread around the mean |
| Desviación estándar (DE) | Standard deviation (SD) | Spread of individual totals; not an error bar on the mean |
| Coeficiente de variación | Coefficient of variation (CV) | SD / mean; compares attributes on different scales |
| Muestra de referencia | Reference sample | Anchor for context and Δ; not ranked |
| Δ (delta) | Delta | Difference from the reference on the displayed score |
| Exclusión de resultados | Exclusion from results | Owner removes a cupper's data from the aggregate |
| Evaluación afectiva | Affective assessment | 9-point quality impression (SCA-104) |
| Evaluación descriptiva | Descriptive assessment | Intensity and CATA without judgement (SCA-103) |
| CATA | Check-all-that-apply | Descriptor checklist |
| Repetibilidad | Repeatability | Same assessor, same product, same score on repeat |
| Reproducibilidad | Reproducibility | Agreement across panels or times; out of ISO 11132 scope |
| Ficha técnica | Technical sheet | Owner-tier report with teacher notes |
| Calibración | Calibration | Aligning panelists to a shared scale |
| Sesgo de anclaje | Anchoring bias | Visible or early numbers pulling later judgements |

## 7. Open practice questions

1. What is the minimum number of cuppers for a community score, and for SD, to be shown? (No standard found; teacher and Kim decide.)
2. When two samples are within the panel's spread, should the app say "no clear difference", and at what threshold?
3. Which reasons for excluding a cupper should the owner pick from, and should the excluded cupper be told?
4. Should a teacher see each student's scores by name, or only anonymised distributions? Does it differ between calibration panels and graded classes?
5. Do students see group results right after submitting, or only after the teacher closes?
6. Should the app compute panel-performance indicators (agreement, discrimination), and what would a teacher do with them?
7. Do roasters and buyers want descriptive and affective results in one report or two?
8. Is a raw-score CSV wanted, and may the owner's copy contain cupper identities?
9. How long should reports stay downloadable after close, and what happens when the owner edits afterwards?
10. Which comparables (Cropster Cup, Tastify, Cupping.coffee, SCA Excel templates) set the expected look and numbers for Kim's users?

## 8. Sources

- SCA, "The SCA Officially Adopts CVA Descriptive and Affective Assessments as New Cupping Standards", 2024 — https://sca.coffee/sca-news/sca-new-cva-cupping-standards
- Cropster Help, "How to review and compare the quality session results", 2025 — https://help.cropster.com/cupping/how-to-review-and-compare-the-quality-session-results
- Resend, "Gmail and Yahoo bulk sending requirements", 2024 (secondary) — https://www.resend.com/blog/gmail-and-yahoo-bulk-sending-requirements-for-2024
- PDF Tools, "What is PDF/UA", 2024 (secondary) — https://www.pdf-tools.com/pdf-knowledge/pdf-ua-standard-explained
- Capgo, File Sharer plugin, 2024 (vendor) — https://capgo.app/plugins/capacitor-file-sharer/
- ISO 11132:2021 catalogue abstract, 2021 — https://www.iso.org/standard/76669.html
- W3C, WCAG 2.2 SC 1.4.11, 2023 — https://www.w3.org/TR/WCAG22/ (cited via secondary results, not fetched)
- ISO 8586:2023 assessor selection and training, 2023 (abstract level; not fetched)
- Datawrapper, "How to find and create good color palettes", 2023 — https://www.datawrapper.de/blog/create-good-color-palettes
- Observable, "Avoid radar charts", 2023 — https://observablehq.com/blog/avoid-radar-charts
- Lawless & Heymann, *Sensory Evaluation of Food*, 2nd ed., 2010 (book; not re-read)
- Scott Logic, "A critique of radar charts", 2011 — https://blog.scottlogic.com/2011/09/23/a-critique-of-radar-charts
