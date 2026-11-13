# Common rules for every S10 executor (read first, then your own brief)

You are an executor on the Café Sensible repo (Next.js 16, Prisma 7, Supabase Postgres). You
work in your own isolated git worktree. The architect's design in your brief is decided,
including the product decisions (taken by the owner, Ricardo, on 2026-11-12). An independent
reviewer will attack your PR afterwards, so be exact and honest about anything unfinished.

## Setup
1. `git fetch origin`, then create your branch from the base your brief names.
2. Read in full: `CLAUDE.md`, `AGENTS.md`, the section of `docs/prompts/S10-kim-answers.md`
   for your work package, and the rows your brief cites in
   `docs/product/kim-flows-2026-11/respuestas-kim-2026-11.md`. Those answers are SIMULATED,
   not Kim's: everything you build on them gets a `TODO(kim-validar:<code>)` comment.
   `docs/flows.md` diagrams are normative: update them in the same PR as any flow change.
   Before writing Next.js-specific code read the relevant guide in `node_modules/next/dist/docs/`.
3. `npm ci`, `npx prisma generate`. Never junction or symlink node_modules to another checkout.

## Hard rules
- The only hosted database is production and `.env.local` points at it. NEVER run
  `prisma migrate` (dev or deploy), seeds, the dev server, or any script that writes to a
  hosted database. Migrations and SQL phases are WRITTEN by you and APPLIED by the owner.
- `npm run test:db` is safe (throwaway local Postgres; see `tests/db/README.md`).
- For `npm run build` only you may copy `C:\projects\cata-cafe\.env.local` into the worktree.
  Never commit it and never print its contents.
- Check whether each thing already exists before building it.
- Do not resolve product questions. If the brief is ambiguous or contradicts the code, stop
  on that item and report it.
- Never rebase or force-push. To pick up main: `git merge origin/main`.

## Project rules that bite (details in CLAUDE.md)
- Server actions called interactively return `ActionResult` via `run("name", …)`; throw
  `Error("<code>")` inside. A new error code needs copy in BOTH `messages/es.json` and
  `messages/en.json` under `errors.codes`.
- AuthN: `requireUser()` / `requireRegisteredUser()`. AuthZ for anything session-scoped:
  `requireSession*` / `requireSample*` from `lib/sessionAuth.ts`, then `assertSessionWritable`
  unless the write is a sanctioned post-close write (then: `docs/flows.md` §1 and the
  allowlist in `tests/useServerExports.test.ts`, with a reason).
- Client inputs go through `lib/validate.ts`. Scoring inputs never come from the client.
- Pure rules live in dependency-free modules with unit tests; nothing under `tests/` imports
  `lib/prisma` or `server-only`.
- UI: root font-size is 14px, so tap targets are `min-h-[44px]`, never `min-h-11`; MD3 token
  classes only, no hex; reuse `components/ui/*`; both message files; client components get
  translations as props; an ICU `{placeholder}` rendered client-side needs `t.raw()` plus a
  client-side replace (never an ICU plural with a client-replaced count).
- A table with a user column must be added to `mergeGuestData` (`lib/guestClaim.ts`),
  `deleteAccount` (`lib/accountDeletion/deleteAccount.ts`) and
  `lib/accountDeletion/manifest.ts`; `tests/profileRelations.test.ts` enforces it.
- SQL phases: append at the END of `prisma/sql/rls_and_triggers.sql` with the header style of
  the latest phases; a self-rolling-back dry run in `prisma/sql/dry-runs/` (ONE
  `DO $dry$ … $dry$;`, no BEGIN/COMMIT, the phase's statements verbatim between
  `>>> PHASE NN statements` / `<<< end of PHASE NN statements`, ends in `RAISE EXCEPTION`);
  a replay test `tests/phaseNNSql.test.ts` modelled on the newest one (update the previous
  phase's "is the last phase" assertion); a click-by-click section in
  `docs/LAUNCH-RUNBOOK.md`; a commented rollback block. New functions: `SET search_path =
  public`, `REVOKE EXECUTE … FROM PUBLIC, anon`, and keep EXECUTE for `authenticated` when an
  RLS policy calls them.
- Logs carry ids and codes only: never an email, a name, a form body or a token.

## Gates (paste the tail of each in your report)
`npx tsc --noEmit`; `npm test`; `npm run test:db` when your brief says data paths change;
`npm run lint` (exactly the 4 pre-existing errors, in `app/[locale]/dev/page.tsx` and
`components/ui/IntensitySlider.tsx`); `npm run build`, re-run after your last change.

## Deliver
Small logical commits; every message ends with
`Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. Push your branch. Open a DRAFT PR
against `main` with the title your brief gives; the body says what each item does, the manual
steps and their order, known limits, new copy (es + en) for the owner to review, test counts,
and ends with the line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
Do not merge.

## Report back (this is all the architect will see; deliver it through your hand-back)
PR URL and number; commits; files changed by area; the final text of every pure rule and SQL
function you wrote; every user-visible string added or changed (es and en); the tail of each
gate with test counts; and a plain list of anything not done, doubtful, or not verifiable
without a real device.
