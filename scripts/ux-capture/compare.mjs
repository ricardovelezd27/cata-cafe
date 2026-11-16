#!/usr/bin/env node
/**
 * compare.mjs — puts two capture runs side by side.
 *
 *   node scripts/ux-capture/compare.mjs <before-dir> <after-dir> [--expect identical] [--out report.md]
 *
 *  - Screenshots: every PNG of both runs, matched by path. Reported as identical, or as the number
 *    of pixels that differ and the box around them, or as a change of size, or as present in only one run.
 *  - Measures: for every capture in both runs, the counts that differ (text sizes, targets under 44 / 24,
 *    contrast, h1, primary buttons in the fold, ...) and the headings whose size, weight or colour changed.
 *
 * `--expect identical` is for a package with no visual change: exit code 1 when any screenshot differs
 * or is missing from one side. Without it the exit code is 0 and the report is for a person to read.
 * Needs two runs with the same plans, devices, languages and local.json.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { PNG } from "pngjs";
import { COMPARED_COUNTS, readMeasures, summarizeMeasure } from "./lib/summarize.mjs";

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[i + 1]?.startsWith("--") || argv[i + 1] === undefined ? true : argv[++i];
  else positional.push(argv[i]);
}
if (positional.length !== 2) {
  console.error("Usage: node scripts/ux-capture/compare.mjs <before-dir> <after-dir> [--expect identical] [--out report.md]");
  process.exit(2);
}
const [before, after] = positional.map((p) => resolve(p));
for (const d of [before, after]) {
  if (!existsSync(d)) {
    console.error(`No such run folder: ${d}`);
    process.exit(2);
  }
}

/** Every PNG under a run, as paths relative to it (the plan folder first). `fold/` included. */
function listPngs(root, rel = "") {
  const out = [];
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listPngs(root, r));
    else if (e.name.endsWith(".png")) out.push(r);
  }
  return out.sort();
}

function diffPng(a, b) {
  const A = PNG.sync.read(readFileSync(a));
  const B = PNG.sync.read(readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return { kind: "size", from: `${A.width}x${A.height}`, to: `${B.width}x${B.height}` };
  let n = 0;
  let x0 = A.width, y0 = A.height, x1 = -1, y1 = -1;
  for (let y = 0; y < A.height; y++) {
    for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * 4;
      if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2] || A.data[i + 3] !== B.data[i + 3]) {
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return n === 0 ? { kind: "identical" } : { kind: "pixels", n, box: `x ${x0}-${x1}, y ${y0}-${y1}`, of: A.width * A.height };
}

const lines = [`# ux-capture comparison`, "", `- before: \`${before}\``, `- after: \`${after}\``, ""];
let differing = 0;

// ---- screenshots
const bPngs = new Set(listPngs(before));
const aPngs = new Set(listPngs(after));
const all = [...new Set([...bPngs, ...aPngs])].sort();
let identical = 0;
const shotLines = [];
for (const f of all) {
  if (!bPngs.has(f)) { shotLines.push(`| ${f} | only in after |`); differing++; continue; }
  if (!aPngs.has(f)) { shotLines.push(`| ${f} | only in before |`); differing++; continue; }
  const d = diffPng(join(before, f), join(after, f));
  if (d.kind === "identical") identical++;
  else {
    differing++;
    shotLines.push(`| ${f} | ${d.kind === "size" ? `size ${d.from} -> ${d.to}` : `${d.n} of ${d.of} pixels differ (${d.box})`} |`);
  }
}
lines.push(`## Screenshots`, "", `${all.length} images; ${identical} identical, ${all.length - identical} not.`, "");
if (shotLines.length) lines.push("| image | difference |", "|---|---|", ...shotLines, "");

// ---- measures
const mb = readMeasures(before);
const ma = readMeasures(after);
const keys = [...new Set([...Object.keys(mb), ...Object.keys(ma)])].sort();
const measureLines = [];
for (const k of keys) {
  if (!mb[k] || !ma[k]) { measureLines.push(`| ${k} | only in ${mb[k] ? "before" : "after"} | | |`); continue; }
  const s1 = summarizeMeasure(mb[k]);
  const s2 = summarizeMeasure(ma[k]);
  for (const c of COMPARED_COUNTS) if (s1[c] !== s2[c]) measureLines.push(`| ${k} | ${c} | ${s1[c]} | ${s2[c]} |`);
  const h1 = JSON.stringify(s1.headings);
  const h2 = JSON.stringify(s2.headings);
  if (h1 !== h2) measureLines.push(`| ${k} | headings | ${s1.headings.join("; ")} | ${s2.headings.join("; ")} |`);
  if (s1.final !== s2.final) measureLines.push(`| ${k} | final url | ${s1.final} | ${s2.final} |`);
}
lines.push(`## Measures`, "", `${keys.length} captures compared; ${measureLines.length ? `${measureLines.length} differences:` : "no differences in the counts or the headings."}`, "");
if (measureLines.length) lines.push("| capture | measure | before | after |", "|---|---|---|---|", ...measureLines, "");

const report = lines.join("\n");
console.log(report);
if (typeof flags.out === "string") {
  mkdirSync(dirname(resolve(flags.out)), { recursive: true });
  writeFileSync(resolve(flags.out), report);
}
if (flags.expect === "identical" && differing > 0) {
  console.error(`\nExpected identical screenshots; ${differing} differ or are missing.`);
  process.exit(1);
}
