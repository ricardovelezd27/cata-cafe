# Reference data (vendored)

This directory contains vendored third-party CSV datasets used to seed
`benchmark_lots` and `reference_series` (see `lib/analytics/normalize.ts`
and the import scripts in `scripts/`). Files are committed as-is so imports
are reproducible without a network fetch at run time.

## cqi_arabica.csv

- **Source**: Coffee Quality Institute (CQI) Arabica cupping database, as
  published in the `jldbc/coffee-quality-database` GitHub repository.
- **Download URL**: https://github.com/jldbc/coffee-quality-database/blob/master/data/arabica_data_cleaned.csv
- **License**: MIT (per the `jldbc/coffee-quality-database` repository).
- **Download date**: 2026-07-20.
- **Imported by**: `scripts/import-benchmark-lots.ts` → `benchmark_lots` (source `cqi_arabica`).

## owid_coffee_production.csv

- **Source**: Our World in Data — Coffee bean production, compiled from FAO
  data.
- **Download URL**: https://ourworldindata.org/grapher/coffee-bean-production
- **License**: CC BY 4.0. Attribution required: FAO, via Our World in Data
  (ourworldindata.org/grapher/coffee-bean-production).
- **Download date**: 2026-07-20.
- **Imported by**: `scripts/import-reference-series.ts` → `reference_series`
  (source `owid_fao`, metric `production`).

## Refreshing a dataset

1. Re-download the file from the URL above and overwrite it in place here
   (keep the same filename).
2. Re-run the matching npm script:
   - `npm run import:benchmarks` for `cqi_arabica.csv`
   - `npm run import:reference` for `owid_coffee_production.csv`

Both import scripts are idempotent per `source`: each deletes existing rows
for its source before inserting, so re-running after a refresh (or re-running
without any file changes) does not create duplicates or require manual
cleanup.

## Planned, not yet vendored

- **USDA PSD** (Production, Supply and Distribution) — public domain. Planned
  as an additional `reference_series` source; not yet added to this
  directory or wired into an import script.
