# ux-capture: before and after, with screenshots and numbers

A headless browser that opens the running app, takes each screen, and measures it: painted sizes of
headings and text, touch targets under 44 and under 24 px, contrast against the real background,
primary buttons in the first fold, overflow, docked parts, the number of `h1`, unnamed controls.
It is the method of the UI/UX audit of 2026-11-15 (`docs/audits/app-ui-ux-2026-11-15/`), and every
package of its plan (`PLAN.md`) is verified with it: take a **before**, make the change, take an
**after**, compare.

## It only reads

The local environment uses the **production database**. The tool is built so that it cannot change anything:

| Rule | Where it is enforced | Test |
|---|---|---|
| Runs only against `localhost`, `127.0.0.1` or `[::1]`; any other host exits with a message | `lib/guard.mjs` `assertLocalBase`, before a browser starts | `tests/uxCaptureGuard.test.ts` |
| Every request that is not GET / HEAD / OPTIONS is aborted inside the browser (a server action, a form post and a Supabase write are all POST / PATCH / PUT / DELETE); service workers are blocked so none can bypass it | `capture.mjs` `newReadOnlyContext`, `isReadOnlyMethod` | the test, and `--self-test` below |
| Signs in only through the dev-only GET route `/api/dev/sign-in?email=`, only for `master@cata.test`, `par1@cata.test`, `par2@cata.test`; it never types into the sign-in form | `signInUrl`, `assertTestAddress` | the test |
| A plan can only name a path on the host it runs against | `buildTargetUrl` | the test |

Still: **ask the owner before you sign in as any account or open any real session**, test accounts included.
A screenshot of a real session shows real names: see "Names" below.

## Set up (once)

```bash
cd scripts/ux-capture
npm.cmd ci          # its own playwright-core and pngjs; nothing is added to the app's package.json
```

It drives the **system Chrome** (`channel: "chrome"`; Edge headless crashed in the audit). Pass `--channel msedge` to try another.

Start the app **in development mode** (the sign-in route answers 404 otherwise): in the Claude desktop app
use `preview_start` with the name `dev`; in a terminal, `npm.cmd run dev` in the repository root. Seeded
test accounts exist already in the shared database (`npm run seed:test` created them; do not run it again).

## A before and an after

From the repository root. The same two commands, once per state of the code:

```bash
# 1. on main (or before your change), with the dev server running:
node scripts/ux-capture/capture.mjs --plan owner=master@cata.test,participant=par1@cata.test,empty=par2@cata.test,visitor --out scripts/ux-capture/out/before

# 2. on your branch, the same command with --out .../after, then compare:
node scripts/ux-capture/capture.mjs --plan owner=master@cata.test,participant=par1@cata.test,empty=par2@cata.test,visitor --out scripts/ux-capture/out/after
node scripts/ux-capture/compare.mjs scripts/ux-capture/out/before scripts/ux-capture/out/after
```

That is the whole of it. Defaults: devices `small,tablet,desktop` (375x667, 768x1024, 1440x900) and languages
`es,en`, so a full run is every screen of the plan at three widths in two languages. For one area, narrow it:

```bash
node scripts/ux-capture/capture.mjs --plan owner=master@cata.test --only app,app-sessions-express --devices small,desktop --langs es --out scripts/ux-capture/out/before
```

### Reading a comparison

- **A package with no visual change** (a rename, a codemod): `compare.mjs ... --expect identical` exits with 1 if a
  single screenshot differs. Every image is compared pixel by pixel; the report says how many pixels differ and the box around them.
- **A package that changes one rule everywhere** (a size, a colour): read the measures side by side. The report lists every
  count that changed per capture (text under 12 px, targets under 44 / 24, contrast failures, `h1`, primary buttons in the first fold,
  legacy classes) and every heading whose size, weight or colour changed. The full measures are in `<out>/<plan>/measure/*.json`
  and the summary of a run in `<out>/summary.md`.
- **A redesign of a screen**: open the two PNGs of that screen at the three widths in both languages, and read the measures.
- Two runs are comparable only with the **same plans, devices, languages and `local.json`**. Content that moves by itself (a "hace 3 min",
  a count of sessions) makes pixels differ: compare a capture to the same capture, not to a different day's data.

### What a run writes

```
<out>/meta.json                       base, date, git branch and commit, devices, languages
<out>/summary.md, summary.json        one row per capture, then the detail per capture
<out>/<plan>/<id>.<device>.<lang>[.<state>].png     the whole screen
<out>/<plan>/fold/<same name>.png     only what is seen without scrolling
<out>/<plan>/measure/<same name>.json the full measures (plus the screen's own `custom` eval)
```

`out/` is gitignored. **Do not commit screenshots** unless they hold no real name; the package's pull request quotes numbers, and
the audit's images live in `docs/audits/.../shots/`.

## The plans

`plans/<name>.json`, one per role. Pass one with the test address it needs (`--plan owner=master@cata.test`); `visitor` signs in as nobody.

| Plan | Address | What it shows |
|---|---|---|
| `visitor` | none | sign-in, confirm, claim, join (invalid and real link), not found, the legal pages, the landing, `/app` bouncing to sign-in |
| `owner` | `master@cata.test` | dashboard, sessions, the wizard, express, edit, invite, waiting room, results in each format and tab, print, coffees, groups, profile, warm-ups, insights, the cup page in each format |
| `participant` | `par1@cata.test` | the same account as a member of other people's sessions and group; no access to Insights |
| `empty` | `par2@cata.test` | first-run onboarding dialog, empty lists, the join page as a signed-in newcomer |

A screen is `{ id, path, state?, settle?, steps?, devices?, langs?, fullPage?, phase?, eval?, evalFile? }`; the format and every field
are documented at the top of `lib/plan.mjs`. `path` has no locale prefix; the tool adds `/es` or `/en`. Add a screen by adding a line.
The Insights **Users** and **Access** pages are not in any plan on purpose: they show real people.

## Names: ids and the name-replacement list stay out of the repository

Plan paths for real sessions, coffees and groups hold `{{tokens}}` (`/app/sessions/{{closedGroupCombined}}/results`). Their values are
read from `scripts/ux-capture/local.json`, which is **gitignored**; copy `local.example.json` and fill it. A screen whose token has no
value is skipped with a message (so a fresh checkout still runs everything else).

`local.json` also holds `redact`: `[["real text", "placeholder"], ...]`. Before a screen is measured and photographed the tool replaces
those texts in the page (text nodes, `aria-label`, `title`, placeholders, input values and the document title) and masks anything that looks like an
email address. Rules that keep it from breaking the app's own words: a listed text that is the whole of a text node is replaced; inside
a longer text only a name of 4 or more characters is (3 for a placeholder "Catador n"), on letter boundaries. **Never leave a person's
name out of the list because its words also appear in the app's copy** ("Ana", a farm called "Finca Nueva"): replace the whole-node
occurrences and let the boundary rule handle the rest, then check the image. Anything that shows a real person, session, coffee,
farm or producer name must not leave your machine.

## Viewing a real session (the read-only super-admin lens)

Some packages need real data: a closed session with several cuppers, a coffee with many sessions. The owner has approved this
way of working for packages that need it, **with every name replaced before an image is kept**:

1. Fill `scripts/ux-capture/local.json` (gitignored): `ids` with the real session / coffee / group ids and `redact` with every
   person, session, coffee, farm and producer name that can appear on those screens. Capture a first time with `--no-shots` and read
   `<out>/<plan>/measure/*.json` for names you missed before taking images.
2. The lens: in the **worktree's own** `.env.local` (never the main checkout's, never committed) set
   `ANALYTICS_SUPER_ADMIN_EMAIL=master@cata.test`, and restart the dev server so it reads it. The test owner then sees every session
   read-only (the "admin" states of the `owner` plan). **Restore the previous value afterwards** and restart again.
3. Capture with `--plan owner=master@cata.test` as usual. The tool still aborts every write, so the lens cannot change anything.
4. Keep `out/` on your machine. Quote numbers in the pull request, not images, unless you have looked at the image and it shows no real name.

This is still production data: ask the owner before you use it for a new package, and open only the sessions the package needs.

## Known effects of the method

- **The app shell scrolls inside a container**, so a "whole screen" image is made by growing the viewport by the hidden scroll height
  (the results page has nested scrollers: it repeats until nothing is hidden, at most 15000 px). `h=` in the console line and `docHeight` in the measures
  are the viewport's, not the content's, on screens that scroll inside the shell; `innerScrollExtra` says how much was hidden. The measures
  describe the first fold; the image shows everything.
- **Opening the cup page of a session queues a first save on mount.** The tool blocks it, and the app correctly keeps it as a draft and shows
  the badge "1 borradores sin sincronizar" (about 24 px on top of the screen) on every later screen of that browser context. So cup pages are
  `phase: 1` in the plans (they run after everything else) and a screen that wants to show the badge is `phase: 2`. Do not move a cup page earlier.
- Reduced motion is on, animations are frozen for the screenshot and the Next.js dev overlay is hidden, so two runs of the same code agree.
  `--motion` turns reduced motion off.
- A screen that redirects (a signed-out `/app`, a closed session's cup page) is measured where it ends: `finalUrl` in the measures.
- `evals/cup-page.js` measures the cup page by the class names of its CSS modules; if a cup component is renamed, that eval returns nulls: update it.
- Not seen by this tool (as in the audit): an anonymous guest, a real phone and keyboard, 200 % zoom, a screen reader, a synced warm-up, anything that needs a write.

## Prove the safety, any time

```bash
node scripts/ux-capture/capture.mjs --self-test
```

Opens the public login page of the running server, tries a POST, PUT, PATCH and DELETE to `/api/health` from the page, and exits 0 only if the browser aborted all
four before they left it. No account is used.

Other checks: `npx.cmd vitest run tests/uxCaptureGuard.test.ts` (the host guard, the methods, the addresses, the paths, and a scan of the committed
files for ids and addresses that must not be there).
