// Counts the hand-written recipes that package P2 of the 2026-11-15 UI/UX audit
// moves to its three primitives (Card, Notice, PaperSectionHeading), by area, so
// every later step can show the number going to zero.
//
//   node scripts/ux-recipes/count.mjs            a table by area
//   node scripts/ux-recipes/count.mjs --json     the same as JSON
//   node scripts/ux-recipes/count.mjs --files    every hit with its file and line
//
// Source-level and deterministic (no browser). What it counts:
// - card:      a class string holding `rounded-card` (or a legacy rounded-md/lg/xl/2xl)
//              AND a surface ground or a border AND a padding class, on anything but
//              a form control or a pill. A shared constant (`const CARD = "…"`) counts
//              once per place it is used, not where it is written.
// - banner:    a terracotta notice: a block (not a pill) painted `bg-secondary-container`
//              or `bg-secondary/…`, or bordered `border-secondary/…`.
// - notice:    any other framed notice: a card-shaped frame whose tag carries
//              role="status" or role="alert" (the offline, deadline and identity bars).
// - heading:   a literal `<h2` or `<h3` on a paper screen (the paper SectionHeading's
//              job). Uppercase labels used as headings are finding B-05, not counted.
// The three primitives themselves, the stage (landing), the warm-up, the legal pages,
// the PDF documents and the dev boards are outside the count.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const SKIP_DIRS = new Set(["node_modules", ".next", "generated", "landing", "warmup", "legal", "pdf", "api", "dev"]);
const PRIMITIVES = new Set(["components/ui/Card.tsx", "components/ui/Notice.tsx", "components/ui/PaperSectionHeading.tsx"]);

/** The plan's areas (PLAN.md "The order": cupping, results, lists, arrival, insights) and the rest. */
export function areaOf(file) {
  const f = file.split(sep).join("/");
  if (/sessions\/\[id\]\/(cup|waiting|print)\//.test(f) || /^components\/(cupping|session|session-moments)\//.test(f)) return "cupping";
  if (/sessions\/\[id\]\/results\//.test(f) || /^components\/results\//.test(f)) return "results";
  if (/\/app\/insights\//.test(f) || /^components\/insights\//.test(f)) return "insights";
  if (/\[locale\]\/(auth|join)\//.test(f) || /\[locale\]\/app\/page\.tsx$/.test(f) || /^components\/(auth|join|onboarding|dashboard|guest)\//.test(f)) return "arrival";
  if (/\/app\/(coffees|groups|profile|sessions|team)\//.test(f) || /^components\/(coffees|groups|profile)\//.test(f)) return "lists";
  if (/^components\/ui\//.test(f)) return "kit";
  return "shell and other";
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const RADIUS = /(?<![\w-])rounded-(card|md|lg|xl|2xl)(?![\w-])/;
const GROUND = /(?<![\w-])(bg-(surface[\w-]*|primary-fixed[\w/-]*|secondary[\w/-]*|warning[\w/-]*|error-container[\w/-]*)|border(?![\w-]*-(t|b|l|r|x|y)\b)(-[\w/-]+)?)(?![\w-])/;
const PAD = /(?<![\w-])p[xy]?-(\d|\[)/;
const PILL = /(?<![\w-])rounded-(pill|full)(?![\w-])/;
const TERRACOTTA = /(?<![\w-])(bg-secondary-container|bg-secondary\/\d+|border-secondary\/\d+)(?![\w-])/;
const CONTROL_TAG = /^(input|textarea|select|img|svg|span)$/;

/** Class strings of a file with their line and the tag they sit on (when known). */
function classStrings(src) {
  const out = [];
  const lineAt = (i) => src.slice(0, i).split("\n").length;
  // className="…" / className={`…`} / className={"…"} on a JSX tag
  for (const m of src.matchAll(/<([A-Za-z][\w.]*)\b[^>]*?className=\{?\s*([`"'])([\s\S]*?)\2/g)) {
    const open = src.slice(m.index, src.indexOf(">", m.index + m[0].length) + 1);
    out.push({ cls: m[3], tag: m[1], line: lineAt(m.index), live: /role=["'](status|alert)["']/.test(open) });
  }
  return out;
}

/** `const NAME = "…"` class recipes, and how many times each NAME is used in a className. */
function sharedRecipes(src) {
  const out = [];
  for (const m of src.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*([`"'])([\s\S]*?)\2/g)) {
    const uses = [...src.matchAll(new RegExp(`className=\\{[^}]*\\b${m[1]}\\b`, "g"))].length;
    out.push({ name: m[1], cls: m[3], uses, line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

const isCard = (cls, tag = "div") => RADIUS.test(cls) && GROUND.test(cls) && PAD.test(cls) && !PILL.test(cls) && !CONTROL_TAG.test(tag) && !TERRACOTTA.test(cls);
const isBanner = (cls, tag = "div") => TERRACOTTA.test(cls) && !PILL.test(cls) && PAD.test(cls) && !CONTROL_TAG.test(tag);

export function countRecipes(root = ROOT) {
  const files = [...walk(join(root, "app"), []), ...walk(join(root, "components"), [])];
  const hits = [];
  for (const full of files) {
    const file = relative(root, full).split(sep).join("/");
    if (PRIMITIVES.has(file)) continue;
    const src = readFileSync(full, "utf8");
    const area = areaOf(file);
    for (const c of classStrings(src)) {
      if (isBanner(c.cls, c.tag)) hits.push({ kind: "banner", area, file, line: c.line });
      else if (isCard(c.cls, c.tag)) hits.push({ kind: c.live ? "notice" : "card", area, file, line: c.line });
    }
    for (const r of sharedRecipes(src)) {
      if (!r.uses) continue;
      const kind = isBanner(r.cls) ? "banner" : isCard(r.cls) ? "card" : null;
      if (kind) for (let i = 0; i < r.uses; i++) hits.push({ kind, area, file, line: r.line, via: r.name });
    }
    for (const m of src.matchAll(/<h[23]\b/g)) {
      hits.push({ kind: "heading", area, file, line: src.slice(0, m.index).split("\n").length });
    }
  }
  const areas = ["cupping", "results", "lists", "arrival", "insights", "kit", "shell and other"];
  const table = areas.map((area) => ({
    area,
    card: hits.filter((h) => h.area === area && h.kind === "card").length,
    banner: hits.filter((h) => h.area === area && h.kind === "banner").length,
    notice: hits.filter((h) => h.area === area && h.kind === "notice").length,
    heading: hits.filter((h) => h.area === area && h.kind === "heading").length,
  }));
  const total = { area: "total", card: 0, banner: 0, notice: 0, heading: 0 };
  for (const r of table) for (const k of ["card", "banner", "notice", "heading"]) total[k] += r[k];
  return { table, total, hits };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { table, total, hits } = countRecipes();
  if (process.argv.includes("--json")) console.log(JSON.stringify({ table, total }, null, 2));
  else if (process.argv.includes("--files")) for (const h of hits) console.log(`${h.kind}\t${h.area}\t${h.file}:${h.line}${h.via ? ` (${h.via})` : ""}`);
  else {
    console.log("| Area | Cards | Terracotta banners | Other framed notices | Section headings (h2/h3) |");
    console.log("|---|---|---|---|---|");
    for (const r of [...table, total]) console.log(`| ${r.area} | ${r.card} | ${r.banner} | ${r.notice} | ${r.heading} |`);
  }
}
