/**
 * The summary of the measures of one screen (the audit's `m-sum.js`, kept as a library): small
 * enough to read in a table and to put side by side in a pull request. Pure; no I/O except
 * `readMeasures`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const mode = (sizes) => {
  let best = null;
  for (const [px, n] of Object.entries(sizes ?? {})) if (!best || n > best.n) best = { px: +px, n };
  return best ? best.px : null;
};

/**
 * @param {any} m one `measure/<name>.json`
 */
export function summarizeMeasure(m) {
  const sizes = Object.keys(m.textSizes ?? {}).map(Number);
  const worst = (m.lowContrast ?? []).slice().sort((a, b) => a.ratio - b.ratio)[0];
  return {
    final: m.finalUrl,
    status: m.status,
    viewport: m.viewport,
    docHeight: m.docHeight,
    hiddenScroll: m.innerScrollExtra ?? 0,
    hOverflow: m.hOverflow,
    h1Count: m.h1Count,
    headings: (m.headings ?? []).slice(0, 8).map((h) => `${h.tag} ${h.px}px/${h.weight} ${h.color}`),
    bodyTextPx: mode(m.textSizes),
    smallestTextPx: sizes.length ? Math.min(...sizes) : null,
    // text under 12 px as PAINTED (a scaled SVG counts at its drawn size); ...Css is the CSS size, as before 2026-11-17
    textUnder12: m.layout?.under12Count ?? null,
    textUnder12Css: m.layout?.under12CssCount ?? m.layout?.under12Count ?? null,
    targets: m.targetsTotal,
    // targets under 44 / 24 px by what a tap reaches (own box + hit-area pseudo-element + checkbox label); ...OwnBox is the
    // element's own box, which is what every run before 2026-11-17 recorded under the plain name (so an old run's plain
    // number is read as its OwnBox number)
    targetsUnder44: m.targetsUnder44Count,
    targetsUnder24: m.targetsUnder24Count,
    targetsUnder44OwnBox: m.targetsUnder44OwnBoxCount ?? m.targetsUnder44Count,
    targetsUnder24OwnBox: m.targetsUnder24OwnBoxCount ?? m.targetsUnder24Count,
    hitAreaControls: (m.targetsWithHitArea ?? []).length,
    unnamedControls: (m.unnamedControls ?? []).length,
    lowContrast: m.lowContrastCount,
    worstContrast: worst ? `${worst.ratio} "${worst.text.slice(0, 24)}" ${worst.fg} on ${worst.bg}` : null,
    primariesInFold: m.primariesInFold,
    primaries: (m.primaries ?? []).slice(0, 6).map((p) => `${p.name.slice(0, 28)} ${p.w}x${p.h}${p.inFold ? " (in fold)" : ""}`),
    docked: (m.layout?.fixed ?? []).map((f) => `${f.pos} top${f.top} h${f.h}`),
    legacyClasses: Object.values(m.legacyClasses ?? {}).reduce((a, b) => a + b, 0),
    consoleErrors: (m.consoleErrors ?? []).length,
    blockedWrites: m.blockedWrites ?? 0,
    hydrated: m.hydrated ?? null,
    allowedSockets: m.allowedSockets ?? 0,
    blockedSockets: m.blockedSockets ?? 0,
  };
}

/** The numbers a comparison puts side by side (the rest of the summary is text). */
export const COMPARED_COUNTS = [
  "docHeight",
  "hydrated",
  "h1Count",
  "bodyTextPx",
  "smallestTextPx",
  "textUnder12",
  "textUnder12Css",
  "targets",
  "targetsUnder44",
  "targetsUnder24",
  "targetsUnder44OwnBox",
  "targetsUnder24OwnBox",
  "hitAreaControls",
  "unnamedControls",
  "lowContrast",
  "primariesInFold",
  "legacyClasses",
  "consoleErrors",
];

/**
 * Reads every `<dir>/<plan>/measure/*.json` of a run, as { "<plan>/<name>": measure }.
 * @param {string} dir
 */
export function readMeasures(dir) {
  const out = {};
  for (const plan of readdirSync(dir, { withFileTypes: true })) {
    if (!plan.isDirectory()) continue;
    const mdir = join(dir, plan.name, "measure");
    if (!existsSync(mdir)) continue;
    for (const f of readdirSync(mdir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) {
      out[`${plan.name}/${f.replace(/\.json$/, "")}`] = JSON.parse(readFileSync(join(mdir, f), "utf8"));
    }
  }
  return out;
}

/**
 * A Markdown table per plan: one row per capture, then the per-screen detail.
 * @param {Record<string, any>} measures from readMeasures
 */
export function renderSummary(measures) {
  const byPlan = {};
  for (const [key, m] of Object.entries(measures)) {
    const [plan, ...rest] = key.split("/");
    (byPlan[plan] ??= []).push([rest.join("/"), summarizeMeasure(m)]);
  }
  const lines = [];
  for (const [plan, rows] of Object.entries(byPlan)) {
    rows.sort((a, b) => a[0].localeCompare(b[0]));
    lines.push(`## ${plan}`, "");
    lines.push("| capture | final | h | h-over | h1 | body px | min px | <12px | <12px css | <44 | <44 own box | <24 | <24 own box | contrast | unnamed | primary in fold | docked |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const [name, s] of rows) {
      lines.push(
        `| ${name} | ${s.final} | ${s.docHeight} | ${s.hOverflow ? "YES" : "no"} | ${s.h1Count} | ${s.bodyTextPx} | ${s.smallestTextPx} | ${s.textUnder12} | ${s.textUnder12Css} | ${s.targetsUnder44} | ${s.targetsUnder44OwnBox} | ${s.targetsUnder24} | ${s.targetsUnder24OwnBox} | ${s.lowContrast} | ${s.unnamedControls} | ${s.primariesInFold} | ${s.docked.length} |`,
      );
    }
    lines.push("");
    for (const [name, s] of rows) {
      lines.push(`### ${name}`, "");
      lines.push(`- headings: ${s.headings.join(" · ") || "none"}`);
      lines.push(`- primary buttons: ${s.primaries.join(" · ") || "none"}`);
      if (s.worstContrast) lines.push(`- worst contrast: ${s.worstContrast}`);
      if (s.docked.length) lines.push(`- docked: ${s.docked.join(" · ")}`);
      if (s.hiddenScroll) lines.push(`- inner scroll height hidden from the page: ${s.hiddenScroll}px`);
      lines.push("");
    }
  }
  return lines.join("\n");
}
