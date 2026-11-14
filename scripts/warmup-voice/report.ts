/**
 * Prints what the voice pipeline produced, to judge a copy change:
 *
 *   npx tsx scripts/warmup-voice/report.ts            run lengths and the pause before each step
 *   npx tsx scripts/warmup-voice/report.ts arm-raise  also every spoken line of that exercise, with its slack
 *
 * "slack" is the quiet between the end of a line and whatever comes next (the
 * next line or the next bell), in seconds.
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WARMUP_EXERCISES } from "../../lib/warmup/exercises";
import { spokenChromeFromMessages } from "../../lib/warmup/script";
import { buildExerciseTimeline, readBeatMs } from "../../lib/warmup/timeline";
import { spokenMs } from "../../lib/warmup/voice";
import { variantSpeech } from "../../lib/warmup/voiceLines";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const chrome = (l: string) => spokenChromeFromMessages(JSON.parse(readFileSync(join(ROOT, `messages/${l}.json`), "utf8")).warmup);
const sec = (ms: number) => (ms / 1000).toFixed(1);
const only = process.argv[2];

for (const ex of WARMUP_EXERCISES) {
  const full = buildExerciseTimeline(ex, { mode: "library" });
  const short = buildExerciseTimeline(ex, { mode: "library", length: "short" });
  const shortSession = buildExerciseTimeline(ex, { mode: "session", length: "short" });
  console.log(`\n${ex.id}: full ${sec(full.totalMs)} s (${(full.totalMs / 60000).toFixed(1)} min, card says ${ex.durationMin}), short ${sec(short.totalMs)} s, short in a session ${sec(shortSession.totalMs)} s`);
  for (const step of ex.steps) {
    console.log(`  ${step.id.padEnd(22)} pause ${sec(readBeatMs(step)).padStart(4)}  es ${sec(spokenMs(step.text.es, "es")).padStart(4)}  en ${sec(spokenMs(step.text.en, "en")).padStart(4)}`);
  }
  if (only !== ex.id) continue;
  for (const locale of ["es", "en"]) {
    const { tl, speech } = variantSpeech({ exercise: ex, mode: "session", length: "full", seated: false }, locale, chrome(locale));
    console.log(`  -- ${locale} --`);
    speech.forEach((s, i) => {
      const end = s.atMs + s.durMs;
      const nextLine = speech[i + 1]?.atMs ?? tl.totalMs;
      const nextCue = tl.cues.find((c) => c.atMs >= end)?.atMs ?? tl.totalMs;
      console.log(`  ${sec(s.atMs).padStart(6)}  ${sec(s.durMs).padStart(4)}  slack ${sec(Math.min(nextLine, nextCue) - end).padStart(5)}  ${s.point.source.kind.padEnd(11)} ${s.text}`);
    });
  }
}
