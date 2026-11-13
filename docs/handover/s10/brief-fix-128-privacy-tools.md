# Brief — fixes for PR #128 (S10 WP5a) after its independent review

Branch: the EXISTING branch `claude/s10-05a-privacy-owner-tools-impl`. `git fetch origin`,
`git merge origin/main` first (main now has #123 closing rules: `results/page.tsx`,
`ResultsClient.tsx`, `community.ts`, messages; the reviewer's trial merge was clean). Never
rebase or force-push. The PR exists (#128): update its body, do not open a new one.

The review said "merge as is: NO" for two Highs. Everything else in the PR was confirmed
sound (notice only to the excluded cupper, free-text parser, CSV escaping, gates, PHASE 25).
The architect's decisions below are final; keep the diff small; tests FIRST for H1, H2, M1, L1.

## H1 — the "CSV sin nombres" can be re-identified (row order = alphabetical order of the hidden names; C01 = the organiser)
`lib/reports/resultsCsv.ts` (~l.119 sorts by `displayName`; `tests/reports.test.ts` pins it).
- **Codes no longer come from a position.** A cupper's code in a session is derived from a
  keyed hash of (session id, cupper id): find the HMAC helper `lib/analytics/cupperPrivacy.ts`
  uses for "Catador XXXX" and reuse its key with a NEW domain prefix (e.g.
  `results-csv:<sessionId>`), so the same person has different codes in different sessions
  and nothing links a code to join order, name order or the analytics label. Format `C-XXXX`
  (4 chars, the unambiguous alphabet the coffee codes use, `lib/coffeeCode.ts`); on a
  collision inside one session lengthen deterministically (5, 6 chars) for the colliding
  ones. The keyed part lives in a `server-only` module; `resultsCsv.ts` stays pure and
  receives a `Map<cupperId, code>` (tests build the map by hand).
- **Rows** in BOTH variants: by sample (the existing sample order), then by code. Never by
  name, id or join time.
- **The no-names variant has no `motivo_exclusion` column** (it keeps `excluido`, which is
  needed to read the numbers). The named owner variant is unchanged.
- `?codes=1` (the old parameter) is treated as `names=0`.
- Tests: names order, `joinedAt` order and code order all different → the no-names rows come
  out in code order and the file contains no name, id, email, reason; the same cupper has the
  same code in both variants; a different session gives a different code for the same cupper;
  removing one participant does not change anyone else's code; collision case.
- Native-shell filename nit (`ResultsClient.tsx` ~l.1251): no session id, localized, or use
  the server's `Content-Disposition` name.

## H2 — members see the local part of another member's email (regression from main)
`lib/groupRoster.ts` (~l.30), `app/[locale]/app/groups/[id]/page.tsx` (~l.241). A profile's
`displayName` DEFAULTS to the email local part (`handle_new_user`, `app/actions/profile.ts`
fallbacks), so "show the profile name" shows `ricardo.velez88`.
- Server-side (never in props, never in JSX): when the member's stored group name is empty,
  use the linked profile's name ONLY if it does not look like the address: drop it when,
  compared case-insensitively and trimmed, it equals the local part of the member row's
  email or of the linked account's email, equals either full address, or contains `@`. Then:
  linked member (has a user) → es "Miembro" / en "Member"; not linked → "Invitación
  pendiente" / "Pending invitation" as built. Pure rule + tests (profile name = local part,
  = local part in another case, = full address, a real name, empty).
- The member payload still carries no email field or substring (keep that test; add the
  local-part fixture to it).
- M2: move the member-view query into a `lib/` server-only function with a typed `select`;
  make the guard test assert that the `members:` block itself uses `select` and has no
  `include` (the reviewer's mutation `include: { user: … }` must fail a test or tsc).
- Report (do NOT fix here): every OTHER place where one user sees another user's default
  profile name (waiting room list, owner matrix, group feed authors…), one line each, so the
  owner can decide later. Do not change them.

## M1 — "Datos de origen editados" shows when nothing about the origin changed
Cause: the coffee side of the rule reads `coffees.updatedAt`, which also moves on publish,
visibility, invites, guest claim, anonymize. Decision: a real column.
- Migration (hand-written, additive, nullable, NOT run by you; name
  `20261115090000_coffee_origin_edited_at`): `Coffee.originEditedAt DateTime? @db.Timestamptz(3)`
  (follow the column naming/mapping style of the model). Not backfilled: NULL = no origin
  edit recorded. `npx prisma generate` only. The PR body's manual steps: the owner runs
  `npx.cmd prisma migrate deploy` BEFORE the merge; old code ignores the column.
- One pure module: `COFFEE_ORIGIN_FIELDS` (exactly the coffee fields the origin/extrinsic
  blocks of the surfaces show: derive the list from those surfaces and report it) and
  `originFieldsChanged(before, after)` (normalised: trim, null = "" = undefined, arrays
  compared as sets). `updateCoffee` and `updateSampleMetadata` (when it edits an existing
  coffee) stamp `originEditedAt = now` ONLY when it returns true. Nothing else stamps it
  (publish, visibility, invites, claim, anonymize, code backfill, duplicate: a new coffee
  starts NULL). Check for any other writer of those fields and report.
- Every surface's "edited after close" rule now reads `extrinsic.editedAt` and
  `coffee.originEditedAt`, never `coffee.updatedAt`. "After close" compares with the moment
  the session stopped being writable: the earlier of `closedAt` and a `closesAt` that has
  passed (an extrinsic edit made while expired-but-not-yet-closed must keep its note).
- Does the browser key need a column GRANT for it? Check how `coffees` is granted in
  `prisma/sql/rls_and_triggers.sql` (table-level or column-level). If table-level, nothing to
  do. If column-level, STOP on that point and report (no SQL phase in this PR): the app reads
  it through Prisma, so the feature works without the grant.
- Tests: unit (the changed rule; publish/visibility do not stamp: assert on the action's
  update data through the pure function), DB test (`updateCoffee` changing only `notes` or
  visibility leaves it NULL; changing the country stamps it; the results/ficha note follows).
- Add the results page's inline `originEditedAtFor` to a tested pure function (the reviewer
  could not mutate it: no test).

## L1 — the stale coffee save must be atomic
`app/actions/coffees.ts` (~l.235-252): replace check-then-update with one
`updateMany({ where: { id, createdBy, deletedAt: null, updatedAt: expected }, data })`;
count 0 → re-read to tell `conflict` from `not_found_or_forbidden`. If the edit form is the
only caller of `updateCoffee`, make `expectedUpdatedAt` required (`invalid_input` when
absent); if not, list the other callers and keep it optional for them. DB test: two saves
from the same loaded version → second gets `conflict`, first one's data intact.

## Small
- Free-text cleaning also strips bidi/format controls (U+200E, U+200F, U+202A–U+202E,
  U+2066–U+2069). Test.
- Do NOT change: the reason list, the notice wording, the outlier wording, the owner CSV's
  columns (other than the code values and row order), date formats.

## Docs
CLAUDE.md (CSV codes: keyed, per session; roster rule; `originEditedAt`; atomic stale save),
`docs/flows.md`, `docs/LAUNCH-RUNBOOK.md` (the migration step, in the style of the last
migration sections), the PR body (manual steps and order; findings table updated).

## Gates and delivery
All five gates, one at a time (`npx tsc --noEmit`, `npm test`, `npm run test:db`,
`npm run lint` with exactly the 4 known errors, `npm run build` after the last change). A
unit-test timeout under load is not a failure if the file passes alone (say so). Report:
commits; the code derivation (final text); the roster rule (final text); the origin field
list; whether `coffees` needs a column grant; the callers of `updateCoffee`; the list of
other places a default profile name is shown; new/changed strings (es, en); the migration
SQL; mutation results for H1, H2, M2, M1; gate tails with exact counts; anything not done.
