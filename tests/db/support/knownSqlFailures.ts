// Things that fail on a CLEAN database although they work on the live one.
// Production files are not edited; the harness tolerates only these entries.
// A long list here is itself a finding (reported in the PR).

// 1. Migrations: patched in a TEMP COPY of prisma/migrations before
//    `prisma migrate deploy` (the repository files are untouched).
export const MIGRATION_PATCHES: { dir: string; from: string; to: string; why: string }[] = [
  {
    dir: "20260805120000_drop_deprecated_is_public",
    from: 'ALTER TABLE "coffees" DROP COLUMN "isPublic";',
    to: 'ALTER TABLE "coffees" DROP COLUMN IF EXISTS "isPublic";',
    why:
      "20260805100000_coffee_visibility_and_sharing already drops coffees.isPublic; the second " +
      "drop (written for the live DB where the column was re-added out of band) has no IF EXISTS, " +
      "so migrate deploy from zero stops with 42703.",
  },
];

// 2. Statements of prisma/sql/rls_and_triggers.sql. Each entry: a regexp over
//    the statement text and one over the error message.
export const KNOWN_SQL_FAILURES: { match: RegExp; error: RegExp; why: string }[] = [
  {
    match: /CREATE POLICY "coffees_select" ON coffees\s+FOR SELECT USING \("isPublic" = true/,
    error: /column "isPublic" does not exist/,
    why:
      "PHASE 11 policy references coffees.isPublic, which the migrations drop before this " +
      "file can run on a clean database. PHASE 16/20/24 re-create coffees_select without it, " +
      "so the final state is unaffected.",
  },
];
