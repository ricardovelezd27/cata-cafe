/**
 * Plan files, as PURE functions (tested in tests/uxCaptureGuard.test.ts).
 *
 * A plan is `plans/<name>.json`:
 *   { "name", "description", "signIn": true|false, "screens": [ Screen, ... ] }
 * A Screen:
 *   id        kebab-case screen id (the Flowmap's), part of the file name
 *   path      the route WITHOUT the locale prefix ("" = the landing). May hold {{token}}s that are
 *             read from local.json "ids" (real session / coffee / group ids stay out of the repository);
 *             a screen whose token is missing is skipped with a message, never guessed.
 *   state     optional label for the file name (e.g. "closed-group-combined-resumen")
 *   settle    ms to wait after load (default 1800)
 *   steps     optional list: {click: selector} {wait: ms} {scrollTo: y} {press: key} {hover: selector} {eval: js}
 *   devices   optional subset of the run's devices
 *   langs     optional subset of the run's languages
 *   fullPage  false = take only the first fold
 *   phase     0 (default) | 1 | 2. Screens run in phase order. The cup page is phase 1 because opening
 *             it queues a first save that the tool blocks, and the app then shows a "pending drafts"
 *             badge on every later screen of that browser context; a screen that wants to SHOW that
 *             badge is phase 2.
 *   eval      a JS expression run in the page after the steps; its JSON result goes in `custom`
 *   evalFile  the name of a file in evals/ (its content is such an expression)
 */

const ID = /^[a-z0-9][a-z0-9-]*$/;
const TOKEN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;
const TOKEN_VALUE = /^[A-Za-z0-9_-]{1,64}$/;
const STEP_KEYS = ["click", "wait", "scrollTo", "press", "hover", "eval"];

/**
 * @param {unknown} plan
 * @returns {string[]} the problems (empty = valid)
 */
export function validatePlan(plan) {
  const problems = [];
  if (!plan || typeof plan !== "object") return ["The plan is not an object."];
  const p = /** @type {Record<string, any>} */ (plan);
  if (typeof p.name !== "string" || !ID.test(p.name)) problems.push("`name` must be kebab-case.");
  if (typeof p.signIn !== "boolean") problems.push("`signIn` must be true or false.");
  if (!Array.isArray(p.screens) || p.screens.length === 0) {
    problems.push("`screens` must be a non-empty list.");
    return problems;
  }
  p.screens.forEach((s, i) => {
    const at = `screens[${i}]`;
    if (!s || typeof s !== "object") return problems.push(`${at} is not an object.`);
    if (typeof s.id !== "string" || !ID.test(s.id)) problems.push(`${at}.id must be kebab-case.`);
    if (typeof s.path !== "string" || (s.path !== "" && !s.path.startsWith("/"))) {
      problems.push(`${at}.path must be "" or start with "/".`);
    }
    if (s.state !== undefined && (typeof s.state !== "string" || !ID.test(s.state))) {
      problems.push(`${at}.state must be kebab-case.`);
    }
    if (s.phase !== undefined && ![0, 1, 2].includes(s.phase)) problems.push(`${at}.phase must be 0, 1 or 2.`);
    if (s.eval !== undefined && s.evalFile !== undefined) problems.push(`${at} has both eval and evalFile.`);
    for (const [j, step] of (s.steps ?? []).entries()) {
      const keys = Object.keys(step ?? {});
      if (keys.length !== 1 || !STEP_KEYS.includes(keys[0])) {
        problems.push(`${at}.steps[${j}] must have exactly one of ${STEP_KEYS.join(", ")}.`);
      }
    }
  });
  return problems;
}

/**
 * Replaces {{token}}s in a path with ids from local.json. A token with no value, or whose value
 * has characters other than letters, digits, "_" and "-", is reported, never passed through.
 * @param {string} path
 * @param {Record<string, string>} ids
 * @returns {{ path: string, missing: string[] }}
 */
export function resolveTokens(path, ids) {
  const missing = [];
  const out = path.replace(TOKEN, (_all, name) => {
    const value = ids?.[name];
    if (typeof value !== "string" || !TOKEN_VALUE.test(value)) {
      missing.push(name);
      return "";
    }
    return value;
  });
  return { path: out, missing };
}

/**
 * Stable sort by `phase` (default 0).
 * @template {{ phase?: number }} T
 * @param {T[]} screens
 * @returns {T[]}
 */
export function orderScreens(screens) {
  return screens
    .map((screen, index) => ({ screen, index }))
    .sort((a, b) => (a.screen.phase ?? 0) - (b.screen.phase ?? 0) || a.index - b.index)
    .map((x) => x.screen);
}

/** "owner=master@cata.test,visitor" -> [{ name: "owner", email: "master@cata.test" }, { name: "visitor", email: null }] */
export function parsePlanSpecs(spec) {
  return String(spec)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((item) => {
      const eq = item.indexOf("=");
      return eq < 0 ? { name: item, email: null } : { name: item.slice(0, eq), email: item.slice(eq + 1) };
    });
}

/** File name of one capture: <id>.<device>.<lang>[.<state>] */
export function captureName(screen, device, lang) {
  return [screen.id, device, lang, ...(screen.state ? [screen.state] : [])].join(".");
}
