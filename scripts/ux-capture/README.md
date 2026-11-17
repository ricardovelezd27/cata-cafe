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
| Every WebSocket is closed by the browser the moment the page opens it and never connects to a server (`routeWebSocket`), **except one**: the dev server's own hot-reload socket, same host and port as `--base`, path under `/_next/`. Both outcomes are counted per capture (`sockets(allowed/blocked)`) | `capture.mjs` `newReadOnlyContext`, `shouldBlockWebSocket` | the test, and `--self-test` |
| Signs in only through the dev-only GET route `/api/dev/sign-in?email=`, only for `master@cata.test`, `par1@cata.test`, `par2@cata.test`; it never types into the sign-in form | `signInUrl`, `assertTestAddress` | the test |
| A plan can only name a path on the host it runs against | `buildTargetUrl` | the test |

**WebSockets.** Playwright's request interception (`route`) does not see socket traffic, and the app's Supabase Realtime sockets
(cup, waiting and results pages) can send broadcast and presence messages with the signed-in user's token. So the tool does not
rely on the app never writing that way: it closes **every** WebSocket as the page opens it, without connecting it to any server,
and counts it, with **one exception**.

*The allowed socket.* A page of the Next dev server does not hydrate while the dev server's own WebSocket is closed (Next 16 dev),
and a capture of server HTML alone cannot see or measure anything that is client-side: an `inert` shell, a hydrated control, a
client-rendered state. So a socket is let through only if it is to the tool's **own base**: the same host and port as `--base`,
`ws:` for `http:` (`wss:` for `https:`), no userinfo, and a path under `/_next/` (in practice `/_next/webpack-hmr`). That socket
carries hot-reload messages between the dev server and the page and **reaches no database**. Everything else is closed and counted:
Supabase Realtime, any other host (including look-alikes such as `localhost.evil.test` and userinfo tricks that put another host after an `@`), the same host on another
port, any other path, and a path that only reaches `/_next/` through `..` or an encoded slash. The rule is the pure function
`shouldBlockWebSocket(url, origin)` in `lib/guard.mjs`, with a test for each of those cases; anything that does not parse is closed.

*Hydration is checked, not assumed.* Before it settles, every capture waits for React's client code to run (an internal fiber key on a
DOM node: a signal, not a timing guess) and records `hydrated` in the measures and in `compare.mjs`. A capture that reports
`hydrated=false` measured server HTML only.

*What the closed Realtime socket does to a page.* The pages that listen to Realtime (the cup page of a group session, the waiting room, the
results page of an open session) see a channel that never reaches SUBSCRIBED and show their own "live updates are down" state
(`liveCountDown`, `liveUpdatesDown`). It is the same on both sides of a before / after, so a comparison stays valid; it differs from a
run where the sockets were open. Seen on the cup page of a `[DEV]` group session (owner view): the toast "Conteo en vivo no
disponible — recarga la página…" appears, 2 or 3 Realtime sockets are counted as blocked and the hot-reload socket as allowed. The waiting
room and the results page were not measured.

**What is trusted.** Every GET is let through, so the tool trusts the app's GET routes (pages, `/api/*` GET handlers, the RSC payloads)
to be read-only. The one GET that is not is the dev sign-in route, which **creates a session** for a test account; that is why it is
limited to the three seeded addresses and why the tool never signs in on its own: a plan with `"signIn": true` needs the address on the
command line. A GET route that writes would be an app bug that this tool cannot see.

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
`es,en`, so a full run is every screen of the plan at three widths in two languages. Two more devices on request:
`tiny` (320x568, the narrowest phone that still matters: ask for it whenever a package says "at 320") and `phone` (390x844, the audit's phone):
`--devices tiny,small,desktop`. For one area, narrow it:

```bash
node scripts/ux-capture/capture.mjs --plan owner=master@cata.test --only app,app-sessions-express --devices small,desktop --langs es --out scripts/ux-capture/out/before
```

### Reading a comparison

- **A package with no visual change** (a rename, a codemod): `compare.mjs ... --expect identical` exits with 1 if a
  single screenshot differs. Every image is compared pixel by pixel; the report says how many pixels differ and the box around them.
- **A package that changes one rule everywhere** (a size, a colour): read the measures side by side. The report lists every
  count that changed per capture (text under 12 px, targets under 44 / 24, contrast failures, `h1`, primary buttons in the first fold,
  legacy classes) and every heading whose size, weight or colour changed. Two counts exist in two readings each (see "What the
  measure counts" below): the one that decides, and the old one under an `OwnBox` / `Css` name, so a run from before 2026-11-17 still compares. The full measures are in `<out>/<plan>/measure/*.json`
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

### What `unnamedControls` counts

A control is **unnamed** when Chrome computes no accessible name for it. The tool does not copy the name algorithm: it reads
Chrome's own accessibility tree (DevTools Protocol, `Accessibility.getFullAXTree`; `lib/axnames.mjs`), so a field named by `<label for>`, a
wrapping `<label>`, `aria-labelledby`, `aria-label`, `alt`, `title`, an svg `<title>`, its text or a button's `value` is named, in the
browser's own order. Two rules are the project's:

- **A placeholder alone is not a name.** Chrome falls back to it, but it is gone once the field is filled. Chrome says where a name came from;
  a name whose only source is the placeholder is reported with `why: "placeholder only"` (and counted in `unnamedControls`).
- **What is a control**: the visible links, buttons, inputs, selects, textareas, `[role=button|tab|switch|checkbox|radio]` and focusable
  (`tabindex`) elements whose accessibility role is not structural (a focusable scroller or region does not need a name).
  Skipped: inert, `aria-hidden`, `hidden`, disabled, not painted, and the content of a closed `<details>` (the browser reports a box for it, but it is not rendered or exposed).

Each capture's measure holds `unnamedControls` (the list: tag, selector, role, `why`) and `accessibleNames` (`checked`, `named`, `unnamed`,
`placeholderOnly`, `ignored`, `notAControl`, `noAxNode`). "unnamedControls is 0" is what a package checks. `--self-test` runs 18 fixture
controls through the same code and fails if the set it reports is not exactly the expected one; `tests/uxCaptureNames.test.ts` pins the rules
(and runs the fixtures through Chrome when it is installed). Older captures counted names from text, `aria-label`, `title` and
`placeholder` only, and so over-reported: do not compare their `unnamedControls` with these.

### What the measure counts: hit areas, painted text and primary buttons

- **Targets under 44 / 24 px (`targetsUnder44`, `targetsUnder24`) are measured by what a tap reaches**, not by the element's own box. The
  app gives some small controls a 44 px hit area through a transparent `::before` (`components/ui/hitArea.ts`: `HIT_44`, `HIT_Y44`; the
  rating bubbles; the cup page's docked buttons). The tool reads `getComputedStyle(el, "::before")` / `"::after"` and counts the pseudo-element
  when it is `position: absolute | fixed`, has content, is displayed and takes pointer events (`pointer-events` is not `none`); its box is the
  union with the control's. A checkbox or radio **inside** its `<label>` counts as the label's box (a `label[for]` somewhere else does not: it is
  its own target). Each control that gained area is listed in `targetsWithHitArea` (own size, reached size, and `via`: `before`, `after` or
  `label`). The own box alone is kept under `targetsUnder44OwnBox` / `targetsUnder44OwnBoxCount` / `targetsUnder24OwnBoxCount`: those are
  exactly the numbers older runs recorded under the plain names (the summary and `compare.mjs` read an old run's plain number as its `OwnBox` one).
  Not handled: a hit area clipped by an `overflow: hidden` ancestor, and a pseudo-element placed inside a transformed ancestor other than the control.
- **Text under 12 px (`layout.under12`, `textSizes`) is the PAINTED size**: the CSS size times the scale the element is drawn with. For HTML that
  is the bounding box against the layout box (`offsetWidth` / `offsetHeight`; a quarter turn is not a scale), for SVG text it is the length of the
  y axis of `getScreenCTM()`. A text inside a drawing that is scaled down (the results drawings) is counted at the size you see. The CSS-size
  readings stay under `textSizesCss` and `layout.under12Css` (`textUnder12Css` in the summary). The contrast check still uses the CSS size.
- **Primary buttons (`primaries`, `primariesInFold`)**: a filled button is a `button`, a link or `[role=button]` (or a submit input) whose OWN
  painted background is the primary fill (the value of `--color-primary-container`, read from the page; `primaryFill` in the measure).
  A class name does not count, and the app shell's navigation (anything inside a `<nav>` or `[role=navigation]`, so the active tab of the phone's bottom bar) is left out.

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

**Steps** run after the page has hydrated and settled, in order: `{ "waitFor": "<selector>" }`, `{ "click": "<selector>" }`,
`{ "hover": "<selector>" }`, `{ "wait": ms }`, `{ "scrollTo": y }`, `{ "press": "Escape" }`, `{ "eval": "<js>" }`. `waitFor`, `click` and `hover`
wait until the first element that matches is **visible** (default 8 s, `"timeout": ms` from 100 to 60000 next to them), so a plan can wait for a control
before it clicks it; on a cold dev server a click used to run before the page's tabs existed. A step that finds nothing fails that capture with
a message that names the step, the selector and what it saw (`nothing matches the selector`, or `N elements match but the first one stayed hidden`).
**A dialog or sheet**: open it with steps, then the screenshot is taken, e.g. `"steps": [{ "waitFor": "button[aria-haspopup=dialog]" }, { "click": "button[aria-haspopup=dialog]" }, { "waitFor": "[role=dialog]" }]`;
the measure and the image are of the screen with the dialog open (the image is of the whole page, the dialog sits over it). Writes stay aborted, so
open it, look at it, do not submit it.
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

Opens the public login page of the running server and proves what follows; it exits 0 only if every part holds:
1. **Writes are aborted:** a POST, PUT, PATCH and DELETE to `/api/health` from the page never leave the browser. The check is that **every write the
   test tried was blocked and none reached the server**, not that two counts are equal: the page can add blocked writes of its own (the Next dev overlay
   posts to `/__nextjs_original-stack-frames`), and those are listed by method and path ("N other writes by the page itself also blocked") without failing the test.
2. **Sockets:** the dev server's hot-reload socket is let through, and three others are closed without opening: another host
   (`wss://...invalid`, as Realtime would be), the same host with another path, and the same host on another port.
3. **The page hydrates:** React's client code ran (a fiber key on a DOM node). The self-test fails if it did not.
4. **Accessible names:** 18 fixture controls are read from Chrome; exactly the expected seven are reported as unnamed.
5. **The measure:** a fixture page holds the hit-area cases (a plain control, `HIT_44`, `HIT_Y44`, a `transform`-centred and an `::after` hit area,
   a hit area smaller than 44, one with `pointer-events: none`, a checkbox inside its label, a radio with a label elsewhere), scaled HTML and SVG
   text (painted vs CSS size), a rotated text, and primary buttons (a painted fill, a link, one inside a `nav`, one that only has the class name). The
   counts and the lists must match the expected ones, own box and reached size side by side.
6. **Steps:** a `waitFor` and a bare `click` on controls that appear after 700 ms land, and the two refusals (nothing matches, stays hidden) have their clear messages.

No account is used.

Other checks: `npx.cmd vitest run tests/uxCaptureGuard.test.ts` (the host guard, the methods, the addresses, the paths, and a scan of the committed
files for ids and addresses that must not be there), `tests/uxCaptureGeometry.test.ts` (the pure geometry) and `tests/uxCaptureMeasure.test.ts`
(the write check, steps, devices, the summary, and the fixtures through Chrome when it is installed).

## Things that go wrong

- **A freshly started dev server reloads pages for a while.** The first requests compile routes, and the page reloads under the tool:
  you see `FAILED ... Cannot find context with specified id` or `controls changed while reading names`, a console line with a changed
  `primInFold`, or a measure that differs between two runs of the same code. Run a warm-up pass first, as many times as it takes to stop
  failing (the pages must be stable for two runs in a row), and only then the real one:
  `node scripts/ux-capture/capture.mjs --plan <the plans> --no-shots --out scripts/ux-capture/out/warm`.
- **A page that never settles is a stale `.next/dev`.** If the warm-up still fails after a few passes (the dev server prints "Compiled in 2ms"
  and a new `GET` for the same page, again and again), stop the server, delete `.next/dev`, start it again and warm it up again.
- **`next dev` rewrites a block of `AGENTS.md`** in the worktree. `git status` shows it as modified: restore it (`git checkout -- AGENTS.md`)
  and never commit it.
- **"Realtime-down" on pages that listen to Realtime** (the cup page, the waiting room, the results page of a live session): the tool closes
  every WebSocket except the dev server's own, so Supabase Realtime never connects and the app can show its notice that live updates are off.
  That is the tool, not the app; the measure and the image are of the page without live updates.
- **Opening a dialog or a sheet**: see "Steps" above (`waitFor`, `click`, `waitFor` the dialog, then the capture).
