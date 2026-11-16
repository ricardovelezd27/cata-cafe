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
    textUnder12: m.layout?.under12Count ?? null,
    targets: m.targetsTotal,
    targetsUnder44: m.targetsUnder44Count,
    targetsUnder24: m.targetsUnder24Count,
    unnamedControls: (m.unnamedControls ?? []).length,
    lowContrast: m.lowContrastCount,
    worstContrast: worst ? `${worst.ratio} "${worst.text.slice(0, 24)}" ${worst.fg} on ${worst.bg}` : null,
    primariesInFold: m.primariesInFold,
    primaries: (m.primaries ?? []).slice(0, 6).map((p) => `${p.name.slice(0, 28)} ${p.w}x${p.h}${p.inFold ? " (in fold)" : ""}`),
    docked: (m.layout?.fixed ?? []).map((f) => `${f.pos} top${f.top} h${f.h}`),
    legacyClasses: Object.values(m.legacyClasses ?? {}).reduce((a, b) => a + b, 0),
    consoleErrors: (m.consoleErrors ?? []).length,
    blockedWrites: m.blockedWrites ?? 0,
    blockedSockets: m.blockedSockets ?? 0,
  };
}

/** The numbers a comparison puts side by side (the rest of the summary is text). */
export const COMPARED_COUNTS = [
  "docHeight",
  "h1Count",
  "bodyTextPx",
  "smallestTextPx",
  "textUnder12",
  "targets",
  "targetsUnder44",
  "targetsUnder24",
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
    lines.push("| capture | final | h | h-over | h1 | body px | min px | <12px | <44 | <24 | contrast | unnamed | primary in fold | docked |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const [name, s] of rows) {
      lines.push(
        `| ${name} | ${s.final} | ${s.docHeight} | ${s.hOverflow ? "YES" : "no"} | ${s.h1Count} | ${s.bodyTextPx} | ${s.smallestTextPx} | ${s.textUnder12} | ${s.targetsUnder44} | ${s.targetsUnder24} | ${s.lowContrast} | ${s.unnamedControls} | ${s.primariesInFold} | ${s.docked.length} |`,
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
