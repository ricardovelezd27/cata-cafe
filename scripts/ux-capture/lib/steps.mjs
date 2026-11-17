/**
 * The steps of a plan screen, run one by one. A step waits for what it needs instead of racing the page:
 * on a cold dev server a `click` ran before the page's tabs existed.
 *
 *   { "waitFor": "<selector>" }                 wait until an element that matches is visible
 *   { "click": "<selector>" }                   wait until it is attached and visible, then click the first match
 *   { "hover": "<selector>" }                   the same wait, then hover
 *   { "wait": 500 } { "scrollTo": 400 } { "press": "Escape" } { "eval": "..." }
 *   an optional "timeout" (ms, 100 to 60000) goes next to waitFor, click or hover; the default is 8000.
 *
 * A step that does not find its element fails the capture with a message that says which step, which
 * selector and whether anything matched at all (nothing, or something that stayed hidden).
 */

export const DEFAULT_STEP_TIMEOUT_MS = 8000;
export const MAX_STEP_TIMEOUT_MS = 60000;
/** The keys that can stand beside the action key. */
export const STEP_OPTION_KEYS = ["timeout"];

export class StepError extends Error {}

/** @param {Record<string, unknown>} step */
export function stepTimeout(step) {
  const t = step?.timeout;
  return typeof t === "number" && t >= 100 && t <= MAX_STEP_TIMEOUT_MS ? t : DEFAULT_STEP_TIMEOUT_MS;
}

/** "step 3 {"waitFor":".tabs"}" for messages. */
export function describeStep(step, index) {
  return `step ${index + 1} ${JSON.stringify(step).slice(0, 120)}`;
}

/**
 * Waits for the first element that matches `selector` to be visible. Throws a StepError that says what was found.
 * @param {import("playwright-core").Page} page
 */
export async function waitForVisible(page, selector, timeout, label) {
  const first = page.locator(selector).first();
  try {
    await first.waitFor({ state: "visible", timeout });
  } catch (e) {
    let found = "";
    try {
      const n = await page.locator(selector).count();
      found = n === 0 ? "nothing matches the selector" : `${n} element${n === 1 ? "" : "s"} match but the first one stayed hidden`;
    } catch {
      found = "the selector could not be evaluated";
    }
    const why = e instanceof Error && !/Timeout/i.test(e.message) ? ` (${e.message.split("\n")[0].slice(0, 120)})` : "";
    throw new StepError(`${label}: no visible element for "${selector}" after ${timeout} ms: ${found}${why}`);
  }
  return first;
}

/**
 * @param {import("playwright-core").Page} page
 * @param {Record<string, any>} step
 * @param {number} index
 */
export async function runStep(page, step, index) {
  const label = describeStep(step, index);
  const timeout = stepTimeout(step);
  if (step.waitFor !== undefined) await waitForVisible(page, String(step.waitFor), timeout, label);
  if (step.click) {
    const el = await waitForVisible(page, String(step.click), timeout, label);
    await el.click({ timeout });
  }
  if (step.wait) await page.waitForTimeout(step.wait);
  if (step.scrollTo != null) await page.evaluate((v) => window.scrollTo(0, v), step.scrollTo);
  if (step.press) await page.keyboard.press(step.press);
  if (step.hover) {
    const el = await waitForVisible(page, String(step.hover), timeout, label);
    await el.hover({ timeout });
  }
  if (step.eval) await page.evaluate(step.eval);
}
