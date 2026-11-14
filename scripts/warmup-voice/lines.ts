/**
 * The two ends of the voice pipeline around render.py (see README.md here).
 *
 *   npx tsx scripts/warmup-voice/lines.ts export
 *     Writes scripts/warmup-voice/.out/voice-job.json: every line the guide
 *     voice can say, in both languages, with the voice chosen for each
 *     (lib/warmup/voice.ts VOICE_SETS). A line that already has its file is
 *     skipped unless --all is passed.
 *
 *   uv run --python 3.11 scripts/warmup-voice/render.py scripts/warmup-voice/.out/voice-job.json --mp3-level 0.8
 *
 *   npx tsx scripts/warmup-voice/lines.ts manifest
 *     Copies the rendered files to public/warmup/voice/<set>/<key>.mp3,
 *     deletes the files no line uses any more and rewrites
 *     lib/warmup/voiceManifest.ts with every line's measured length.
 *
 * Run `export`, the render and `manifest` again whenever a spoken line
 * changes; tests/warmup-voice.test.ts fails until they agree. Because the
 * pause before each movement is sized from these lengths, run the pipeline
 * TWICE after a large copy change if `manifest` reports that timings moved a
 * line into a different run (it never does today: lengths change WHEN lines
 * are said, not WHICH lines exist).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spokenChromeFromMessages } from "../../lib/warmup/script";
import { VOICE_SETS, voiceLocale } from "../../lib/warmup/voice";
import { lineKey } from "../../lib/warmup/voiceKey";
import { allSpokenLines } from "../../lib/warmup/voiceLines";
import { VOICE_MANIFEST } from "../../lib/warmup/voiceManifest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const OUT = join(HERE, ".out");
const JOB = join(OUT, "voice-job.json");
const RENDERED = join(OUT, "voice-job");
const PUBLIC = join(ROOT, "public/warmup/voice");
const LOCALES = ["es", "en"] as const;

function linesFor(locale: (typeof LOCALES)[number]): string[] {
  const messages = JSON.parse(readFileSync(join(ROOT, `messages/${locale}.json`), "utf8"));
  return allSpokenLines(locale, spokenChromeFromMessages(messages.warmup));
}

const fileOf = (locale: (typeof LOCALES)[number], key: string) => join(PUBLIC, VOICE_SETS[locale].id, `${key}.mp3`);

function exportJob(all: boolean) {
  const jobs: unknown[] = [];
  for (const locale of LOCALES) {
    const set = VOICE_SETS[locale];
    const seen = new Map<string, string>();
    for (const text of linesFor(locale)) {
      const key = lineKey(text);
      const clash = seen.get(key);
      if (clash && clash !== text) throw new Error(`two lines share the key ${key}: "${clash}" / "${text}"`);
      seen.set(key, text);
      const have = VOICE_MANIFEST[voiceLocale(locale)].lines[key] !== undefined && existsSync(fileOf(locale, key));
      if (have && !all) continue;
      jobs.push({ id: `${set.id}/${key}`, text, voice: set.voice, lang: set.lang, speed: set.speed, out: `${set.id}/${key}.mp3` });
    }
    console.log(`${locale}: ${seen.size} lines`);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(JOB, JSON.stringify({ jobs }, null, 2) + "\n", "utf8");
  console.log(`${jobs.length} to render -> ${JOB}`);
  if (!all && jobs.length > 0) {
    console.log("NOTE: loudness is set once per voice from the lines of ONE render. Rendering a few new lines alone gives them a slightly different gain; use --all before shipping a large change.");
  }
}

function buildManifest() {
  const resultPath = join(RENDERED, "result.json");
  const rendered = new Map<string, { durMs: number; from: string }>();
  if (existsSync(resultPath)) {
    const result = JSON.parse(readFileSync(resultPath, "utf8")) as { files: { id: string; out: string; durMs: number }[] };
    for (const f of result.files) rendered.set(f.id, { durMs: f.durMs, from: join(RENDERED, f.out) });
  }
  const manifest: Record<string, { set: string; lines: Record<string, number> }> = {};
  let bytes = 0;
  for (const locale of LOCALES) {
    const set = VOICE_SETS[locale];
    const dir = join(PUBLIC, set.id);
    mkdirSync(dir, { recursive: true });
    const lines: Record<string, number> = {};
    const missing: string[] = [];
    for (const text of linesFor(locale)) {
      const key = lineKey(text);
      const fresh = rendered.get(`${set.id}/${key}`);
      if (fresh) {
        copyFileSync(fresh.from, fileOf(locale, key));
        lines[key] = fresh.durMs;
      } else {
        const known = VOICE_MANIFEST[voiceLocale(locale)].lines[key];
        if (known !== undefined && existsSync(fileOf(locale, key))) lines[key] = known;
        else missing.push(text);
      }
    }
    if (missing.length) throw new Error(`${locale}: ${missing.length} lines have no recording, run export + render first:\n  ${missing.join("\n  ")}`);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".mp3") || lines[name.slice(0, -4)] === undefined) rmSync(join(dir, name));
      else bytes += statSync(join(dir, name)).size;
    }
    const sorted = Object.fromEntries(Object.keys(lines).sort().map((k) => [k, lines[k]]));
    manifest[locale] = { set: set.id, lines: sorted };
    console.log(`${locale}: ${Object.keys(lines).length} lines in ${dir}`);
  }
  const body = (loc: string) => {
    const m = manifest[loc];
    const rows = Object.entries(m.lines).map(([k, v]) => `      "${k}": ${v},`).join("\n");
    return `  ${loc}: {\n    set: "${m.set}",\n    lines: {\n${rows}\n    },\n  },`;
  };
  const src = `// GENERATED by scripts/warmup-voice/lines.ts (\`manifest\`). Do not edit by hand.
// Per language: the voice set and, per recorded line (lib/warmup/voiceKey.ts
// lineKey of its text), the measured length of its file in ms.

export interface VoiceManifestEntry {
  readonly set: string;
  readonly lines: Readonly<Record<string, number>>;
}

export const VOICE_MANIFEST: Readonly<Record<"es" | "en", VoiceManifestEntry>> = {
${LOCALES.map(body).join("\n")}
};
`;
  writeFileSync(join(ROOT, "lib/warmup/voiceManifest.ts"), src, "utf8");
  console.log(`manifest written, ${(bytes / 1024).toFixed(0)} kB of audio in public/warmup/voice`);
}

const cmd = process.argv[2];
if (cmd === "export") exportJob(process.argv.includes("--all"));
else if (cmd === "manifest") buildManifest();
else {
  console.error("usage: tsx scripts/warmup-voice/lines.ts export [--all] | manifest");
  process.exit(1);
}
