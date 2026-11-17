/**
 * What `--self-test` checks beyond the safety rules, as pure parts and fixture pages. The same fixtures
 * run in the unit tests (tests/uxCaptureMeasure.test.ts) when a Chrome is installed, so a change to the
 * measure fails in both places.
 */
import { runMeasure } from "./measure.mjs";
import { StepError, runStep } from "./steps.mjs";

/**
 * Writes the self-test tried vs. the writes the browser context blocked. The page itself (the Next dev
 * overlay posts to /__nextjs_original-stack-frames) can add blocked writes of its own: those are fine,
 * and are listed, but they never make the check fail. What fails it is a write the test tried that was
 * NOT blocked.
 * @param {Array<{method: string, path: string}>} tried
 * @param {Array<{method: string, path: string}>} blocked
 * @returns {{ allBlocked: boolean, missing: Array<{method: string, path: string}>, extra: Array<{method: string, path: string}> }}
 */
export function reconcileBlocked(tried, blocked) {
  const pool = blocked.map((b) => ({ method: b.method, path: b.path, used: false }));
  const missing = [];
  for (const t of tried) {
    const hit = pool.find((b) => !b.used && b.method === t.method && b.path === t.path);
    if (hit) hit.used = true;
    else missing.push({ method: t.method, path: t.path });
  }
  const extra = pool.filter((b) => !b.used).map((b) => ({ method: b.method, path: b.path }));
  return { allBlocked: missing.length === 0, missing, extra };
}

/** "POST /__nextjs_original-stack-frames x2, PUT /x" for the report line. */
export function describeRequests(list) {
  const counts = new Map();
  for (const r of list) counts.set(`${r.method} ${r.path}`, (counts.get(`${r.method} ${r.path}`) ?? 0) + 1);
  return [...counts].map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(", ");
}

/**
 * A page with every case the hit-area, painted-size and primary-button measures decide on.
 * `.t` = a 20 x 20 control; `.hit` gives it the 44 px ::before of components/ui/hitArea.ts (HIT_44). Each id says what it is.
 */
export const MEASURE_FIXTURE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>fixture</title>
<style>
:root{--color-primary-container:#2c4c3b}
body{margin:0;font:16px/1.4 sans-serif}
main{padding:8px}
.t{display:block;position:relative;width:20px;height:20px;margin:30px;padding:0;border:0;background:#ddd}
.hit::before{content:"";position:absolute;left:50%;top:50%;width:max(100%,44px);height:max(100%,44px);translate:-50% -50%}
#t-y44{width:60px}
#t-y44::before{content:"";position:absolute;left:0;right:0;top:50%;height:44px;translate:0 -50%}
#t-short::before{content:"";position:absolute;left:50%;top:50%;width:30px;height:30px;translate:-50% -50%}
#t-noevents::before{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;translate:-50% -50%;pointer-events:none}
#t-transform::before{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}
#t-after::after{content:"";position:absolute;left:50%;top:50%;width:44px;height:44px;translate:-50% -50%}
.big{display:inline-block;width:100px;height:44px;margin:6px;border:0;color:#fff}
.fill{background:#2c4c3b}
</style></head><body><main>
<button id="t-own" class="t" aria-label="own"></button>
<button id="t-before" class="t hit" aria-label="before"></button>
<button id="t-y44" class="t" aria-label="y44"></button>
<button id="t-short" class="t" aria-label="short"></button>
<button id="t-noevents" class="t" aria-label="noevents"></button>
<button id="t-transform" class="t" aria-label="transform"></button>
<button id="t-after" class="t" aria-label="after"></button>
<input id="cb-bare" type="checkbox" aria-label="bare" style="display:block;width:16px;height:16px;margin:30px">
<label style="display:flex;align-items:center;gap:8px;padding:14px;width:200px"><input id="cb-label" type="checkbox" style="width:16px;height:16px;margin:0">Casilla</label>
<input id="radio-for" type="radio" style="display:block;width:16px;height:16px;margin:30px"><label for="radio-for" style="display:block;width:80px;height:48px">Radio</label>
<button id="t-big" class="big" style="background:#ddd;color:#000" aria-label="big"></button>
<button id="p-fill" class="big fill">fill</button>
<a id="p-link" href="#x" class="big fill" style="line-height:44px;text-align:center;text-decoration:none">link</a>
<nav><a id="p-nav" href="#y" class="big fill" style="line-height:44px;text-align:center;text-decoration:none">nav</a></nav>
<button id="p-class" class="big before:bg-primary-container" style="background:transparent;color:#000">class</button>
<p>plain</p>
<div style="transform:scale(.5);transform-origin:0 0;width:400px"><p style="font-size:20px;margin:0">scaled</p></div>
<svg width="200" height="100" viewBox="0 0 400 200"><text x="10" y="100" font-size="16">svgdown</text></svg>
<svg width="200" height="100" viewBox="0 0 100 50"><text x="5" y="30" font-size="8">svgup</text></svg>
<p style="display:inline-block;width:120px;transform:rotate(-90deg);font-size:13px;margin:60px 0">rot</p>
</main></body></html>`;

/** What the measure must report for MEASURE_FIXTURE. */
export const MEASURE_EXPECT = {
  under44Own: ["cb-bare", "cb-label", "radio-for", "t-after", "t-before", "t-noevents", "t-own", "t-short", "t-transform", "t-y44"],
  under24Own: ["cb-bare", "cb-label", "radio-for", "t-after", "t-before", "t-noevents", "t-own", "t-short", "t-transform", "t-y44"],
  under44: ["cb-bare", "radio-for", "t-noevents", "t-own", "t-short"],
  under24: ["cb-bare", "radio-for", "t-noevents", "t-own"],
  /** id -> what grew its hit area; keys in alphabetical order (the check sorts the measured ones the same way) */
  hitArea: { "cb-label": "label", "t-after": "after", "t-before": "before", "t-short": "before", "t-transform": "before", "t-y44": "before" },
  primaries: ["fill", "link"],
  under12Painted: ["scaled", "svgdown"],
  under12Css: ["svgup"],
};

const idOf = (t) => /#([\w-]+)/.exec(t.sel || "")?.[1];

/**
 * @param {any} m a measure of MEASURE_FIXTURE
 * @returns {string[]} what is wrong (empty = as expected)
 */
export function checkMeasureFixture(m) {
  const problems = [];
  const same = (what, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
  };
  const ids = (list) => (list ?? []).map(idOf).filter(Boolean).sort();
  same("targets under 44 (own box)", ids(m.targetsUnder44OwnBox), MEASURE_EXPECT.under44Own);
  same("targets under 44 (what a tap reaches)", ids(m.targetsUnder44), MEASURE_EXPECT.under44);
  same("count under 24 (own box)", m.targetsUnder24OwnBoxCount, MEASURE_EXPECT.under24Own.length);
  same("count under 24 (what a tap reaches)", m.targetsUnder24Count, MEASURE_EXPECT.under24.length);
  const sorted = (entries) => Object.fromEntries(entries.sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  const via = sorted((m.targetsWithHitArea ?? []).map((t) => [idOf(t), t.via]));
  same("controls with a bigger hit area, and through what", via, MEASURE_EXPECT.hitArea);
  const grown = Object.fromEntries((m.targetsWithHitArea ?? []).map((t) => [idOf(t), `${t.w}x${t.h}`]));
  same("size of two grown hit areas", { before: grown["t-before"], y44: grown["t-y44"], short: grown["t-short"] }, { before: "44x44", y44: "60x44", short: "30x30" });
  if (!((m.targetsWithHitArea ?? []).find((t) => idOf(t) === "cb-label")?.h >= 44)) problems.push("the checkbox inside its label should reach the label's height (44 or more)");
  same("primary buttons (painted fill, not nav, not a class)", (m.primaries ?? []).map((p) => p.name).sort(), MEASURE_EXPECT.primaries);
  same("text under 12 px, PAINTED", (m.layout?.under12 ?? []).map((s) => s.split(":")[1]).sort(), MEASURE_EXPECT.under12Painted);
  same("text under 12 px, CSS size", (m.layout?.under12Css ?? []).map((s) => s.split(":")[1]).sort(), MEASURE_EXPECT.under12Css);
  for (const px of ["10.00", "8.00"]) if (!m.textSizes?.[px]) problems.push(`textSizes should hold a painted ${px}px size (got ${Object.keys(m.textSizes ?? {}).join(", ")})`);
  return problems;
}

/** Loads MEASURE_FIXTURE in `page`, measures it and checks it. */
export async function runMeasureFixture(page) {
  await page.setContent(MEASURE_FIXTURE_HTML);
  const m = await runMeasure(page);
  return { measure: m, problems: checkMeasureFixture(m) };
}

/** A page whose controls appear only after a delay, as a cold dev server's do. */
export const STEPS_FIXTURE_HTML = `<!doctype html><html><body>
<button id="shown" onclick="this.dataset.clicked='1'">shown</button>
<button id="hidden" style="display:none">hidden</button>
<script>
setTimeout(() => {
  const b = document.createElement("button");
  b.id = "late"; b.textContent = "late";
  b.onclick = () => { b.dataset.clicked = "1"; };
  document.body.appendChild(b);
}, 700);
</script></body></html>`;

/**
 * Runs the step cases against STEPS_FIXTURE_HTML: a click that must wait for its target, a waitFor, and
 * the two refusals (nothing matches / stays hidden) with their messages.
 * @returns {Promise<string[]>} what is wrong
 */
export async function runStepsFixture(page) {
  const problems = [];
  await page.setContent(STEPS_FIXTURE_HTML);
  try {
    await runStep(page, { waitFor: "#late", timeout: 4000 }, 0);
    await runStep(page, { click: "#late" }, 1);
    if ((await page.locator("#late").getAttribute("data-clicked")) !== "1") problems.push("click on a control that appeared late did not land");
  } catch (e) {
    problems.push(`waitFor/click on a late control failed: ${String(e).slice(0, 160)}`);
  }
  await page.setContent(STEPS_FIXTURE_HTML);
  try {
    await runStep(page, { click: "#late" }, 0); // default timeout: the click itself waits for the control to appear
    if ((await page.locator("#late").getAttribute("data-clicked")) !== "1") problems.push("a bare click did not wait for the control to appear");
  } catch (e) {
    problems.push(`a bare click on a late control failed: ${String(e).slice(0, 160)}`);
  }
  const refusal = async (step, needle) => {
    try {
      await runStep(page, step, 2);
      problems.push(`${JSON.stringify(step)} should have failed`);
    } catch (e) {
      if (!(e instanceof StepError) || !String(e.message).includes(needle)) problems.push(`${JSON.stringify(step)} failed with the wrong message: ${String(e).slice(0, 200)}`);
    }
  };
  await refusal({ waitFor: "#nope", timeout: 300 }, "nothing matches the selector");
  await refusal({ click: "#hidden", timeout: 300 }, "stayed hidden");
  return problems;
}
