# S10 WP1 step 1 — impact list (read-only, production, 2026-11-13)

Query: `s10_score_impact_readonly.sql` (sha256 27beda3d…cc4a, one SELECT, no writes), then the same CTEs with a summarising SELECT.

Totals: 47 flagged samples, 25 whose STORED session score differs from the new rule;
60 flagged evaluations, 56 whose STORED individual score differs from the new rule.

## Stored session score (aggregate_scores.communityScore) vs new rule

| cups/sample | flagged samples | closed | differ | new rule higher | new rule lower | largest change | defective cups | non-uniform cups |
|---|---|---|---|---|---|---|---|---|
| 2 | 39 | 39 | 23 | 21 | 0 | +14 | 15 | 51 |
| 3 | 4 | 4 | 1 | 1 | 0 | +1.5 | 3 | 5 |
| 5 | 4 | 0 | 1 | 1 | 0 | +2 | 1 | 4 |

Every stored session score that differs is LOWER than the new rule would give: the old
trigger over-deducted (bugs 2 and 3). One 2-cup sample has a stored score of 0.

## Stored individual score (evaluations.individualScore) vs new rule

| cups/sample | flagged evaluations | differ | new rule lower | new rule higher | change range |
|---|---|---|---|---|---|
| 2 | 49 | 49 | 49 | 0 | −12 to −1.94 |
| 3 | 5 | 5 | 5 | 0 | −12 to −2 |
| 5 | 6 | 2 | 0 | 2 | 0 to +0.09 (rounding of old rows) |

Every stored individual score under five cups has NO deduction (bug 1).

Decision on record (Ricardo, 2026-11-12): nothing stored is recomputed. With the
rule-version design (Evaluation.cups NULL = old rule; AggregateScore.ruleVersion),
nothing changes on screen for these either.
