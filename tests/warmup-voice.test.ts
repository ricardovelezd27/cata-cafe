import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { READ_BEAT, WARMUP_EXERCISES } from "@/lib/warmup/exercises";
import { spokenChromeFromMessages, spokenDirection, spokenLine, type SpokenChrome } from "@/lib/warmup/script";
import { READ_TAIL_MS, VOICE_AFTER_CUE_MS, buildExerciseTimeline, readBeatMs } from "@/lib/warmup/timeline";
import { VOICE_SETS, estimateSpeechMs, spokenMs, voiceClip } from "@/lib/warmup/voice";
import { lineKey, normalizeLine } from "@/lib/warmup/voiceKey";
import { allSpokenLines, runVariants, variantSpeech } from "@/lib/warmup/voiceLines";
import { VOICE_MANIFEST } from "@/lib/warmup/voiceManifest";

const LOCALES = ["es", "en"] as const;
const ROOT = resolve(__dirname, "..");
const chromeOf = (locale: string): SpokenChrome =>
  spokenChromeFromMessages(JSON.parse(readFileSync(resolve(ROOT, `messages/${locale}.json`), "utf8")).warmup);
const CHROME = { es: chromeOf("es"), en: chromeOf("en") };
const variantName = (v: ReturnType<typeof runVariants>[number]) => `${v.exercise.id} / ${v.mode} / ${v.length}${v.seated ? " / seated" : ""}`;

/** Quiet kept between the end of one line and the start of the next. */
const GAP_MS = 150;
/** A line must be over this long before a bell sounds. */
const BEFORE_CUE_MS = 100;

describe("lineKey", () => {
  it("ignores whitespace and Unicode form, and tells different lines apart", () => {
    expect(lineKey("  Sube.\n")).toBe(lineKey("Sube."));
    expect(lineKey("Para.")).not.toBe(lineKey("Baja."));
    expect(lineKey("café")).toBe(lineKey("café"));
    expect(normalizeLine("a  b\tc")).toBe("a b c");
    expect(lineKey("Sube.")).toMatch(/^[0-9a-f]{16}$/);
  });
  it("no two lines of a language share a key", () => {
    for (const locale of LOCALES) {
      const lines = allSpokenLines(locale, CHROME[locale]);
      expect(new Set(lines.map(lineKey)).size).toBe(lines.length);
    }
  });
});

describe("the recordings match the script", () => {
  for (const locale of LOCALES) {
    it(`${locale}: every line the voice can say has a file, and no file is left over`, () => {
      const lines = allSpokenLines(locale, CHROME[locale]);
      const missing = lines.filter((t) => !voiceClip(t, locale));
      expect(missing, "lines without a recording: run the voice pipeline (scripts/warmup-voice/README.md)").toEqual([]);
      const dir = resolve(ROOT, "public/warmup/voice", VOICE_SETS[locale].id);
      const onDisk = readdirSync(dir).filter((f) => f.endsWith(".mp3")).map((f) => f.slice(0, -4)).sort();
      expect(onDisk).toEqual(lines.map(lineKey).sort());
      expect(Object.keys(VOICE_MANIFEST[locale].lines).sort()).toEqual(onDisk);
      for (const t of lines) expect(existsSync(resolve(ROOT, "public" + voiceClip(t, locale)!.url))).toBe(true);
    });
    it(`${locale}: the set is the one chosen for the language, lengths are plausible`, () => {
      expect(VOICE_MANIFEST[locale].set).toBe(VOICE_SETS[locale].id);
      for (const ms of Object.values(VOICE_MANIFEST[locale].lines)) {
        expect(ms).toBeGreaterThan(500);
        expect(ms).toBeLessThan(12000);
      }
    });
  }
  it("the voice sets are the owner's pick (Dora with the Spain pronunciation, Heart US)", () => {
    expect(VOICE_SETS.es).toMatchObject({ voice: "ef_dora", lang: "es" });
    expect(VOICE_SETS.en).toMatchObject({ voice: "af_heart", lang: "en-us" });
  });
});

describe("every line fits where it is said (all exercises, modes, lengths, both languages)", () => {
  for (const v of runVariants()) {
    for (const locale of LOCALES) {
      it(`${variantName(v)} / ${locale}`, () => {
        const { tl, speech } = variantSpeech(v, locale, CHROME[locale]);
        expect(speech.length).toBeGreaterThan(5);
        const problems: string[] = [];
        const show = (s: (typeof speech)[number]) => `"${s.text.slice(0, 48)}" ${s.atMs}..${s.atMs + s.durMs}`;
        speech.forEach((s, i) => {
          const end = s.atMs + s.durMs;
          const next = speech[i + 1];
          // 1. One voice at a time.
          if (next && end + GAP_MS > next.atMs) problems.push(`overlap: ${show(s)} runs into ${show(next)}`);
          // 2. Never over a bell: a line is over before it, or starts after it.
          for (const cue of tl.cues) {
            if (s.atMs < cue.atMs + VOICE_AFTER_CUE_MS && end > cue.atMs - BEFORE_CUE_MS) {
              problems.push(`over the ${cue.kind} at ${cue.atMs}: ${show(s)}`);
            }
          }
          // 3. Nothing is cut by the end of the run.
          if (end > tl.totalMs) problems.push(`runs past the end (${tl.totalMs}): ${show(s)}`);
        });
        expect(problems).toEqual([]);
      });
    }
  }
});

describe("the voice is the clock", () => {
  it("the pause before a step is the bell's head start + the longer recording + a breath, in quarter seconds", () => {
    for (const ex of WARMUP_EXERCISES) {
      for (const step of ex.steps) {
        if (step.readDuringPrevAtSec != null) {
          expect(readBeatMs(step)).toBe(0);
          continue;
        }
        const spoken = Math.max(spokenMs(step.text.es, "es"), spokenMs(step.text.en, "en"));
        const raw = VOICE_AFTER_CUE_MS + spoken + READ_TAIL_MS;
        // No instruction is so long that the pause would have to be capped:
        // a capped pause is a voice that runs into the bell.
        expect(raw, step.id).toBeLessThanOrEqual(READ_BEAT.maxSec * 1000);
        expect(readBeatMs(step), step.id).toBe(Math.max(READ_BEAT.minSec * 1000, Math.ceil(raw / 250) * 250));
        expect(readBeatMs(step) % 250).toBe(0);
      }
    }
  });
  it("a line with no recording falls back to an estimate (about 2.4 words a second)", () => {
    const text = "Una frase que nadie grabó todavía, de diez palabras justas.";
    expect(voiceClip(text, "es")).toBeNull();
    expect(spokenMs(text, "es")).toBe(estimateSpeechMs(text));
    expect(estimateSpeechMs("")).toBe(0);
  });
});

describe("the bell first, the word after it", () => {
  it("a line whose moment has a bell starts VOICE_AFTER_CUE_MS later; 'abre los ojos' never waits", () => {
    for (const v of runVariants()) {
      const tl = buildExerciseTimeline(v.exercise, { mode: v.mode, length: v.length });
      const cueTimes = new Set(tl.cues.map((c) => c.atMs));
      for (let i = 1; i < tl.narrations.length; i++) expect(tl.narrations[i].sayAtMs).toBeGreaterThanOrEqual(tl.narrations[i - 1].sayAtMs);
      for (const n of tl.narrations) {
        const waits = n.source.kind !== "closingOpen" && cueTimes.has(n.atMs);
        expect(n.sayAtMs - n.atMs, `${variantName(v)} ${n.source.kind}@${n.atMs}`).toBe(waits ? VOICE_AFTER_CUE_MS : 0);
      }
      // "Abre los ojos" is said BEFORE the doble campana that confirms it.
      const open = tl.narrations.find((n) => n.source.kind === "closingOpen");
      const doble = tl.cues.find((c) => c.kind === "doble");
      expect(!!open, variantName(v)).toBe(!!doble);
      if (open && doble) expect(open.sayAtMs).toBeLessThan(doble.atMs);
    }
  });
});

describe("what is said, and what is not", () => {
  it("direction words are short phrases; the eyes have their own; labels that only repeat are silent", () => {
    expect(spokenDirection("right", "head-rotate", "es")).toBe("A la derecha.");
    expect(spokenDirection("up", "arm-raise", "es")).toBe("Sube.");
    expect(spokenDirection("up", "eyes", "es")).toBe("Hacia arriba.");
    expect(spokenDirection("down", "eyes", "en")).toBe("Downward.");
    for (const silent of ["fast", "still", "upNext", "hold", "arrive", "closing", "bridge"] as const) {
      expect(spokenDirection(silent, "arm-raise", "es")).toBeNull();
    }
  });
  it("the observe prompts shown during a run are spoken when they appear", () => {
    for (const ex of WARMUP_EXERCISES) {
      const tl = buildExerciseTimeline(ex, { mode: "library" });
      const spoken = tl.narrations.filter((n) => n.source.kind === "observe");
      expect(spoken.map((n) => n.atMs).sort((a, b) => a - b)).toEqual(tl.whispers.map((w) => w.fromMs));
      for (const n of spoken) {
        const text = spokenLine(n.source, { exercise: ex, locale: "es", chrome: CHROME.es });
        expect(text && text.length).toBeGreaterThan(10);
      }
    }
  });
  it("progress by ear: the last movement of every exercise says so, the long ones say when you are halfway", () => {
    for (const ex of WARMUP_EXERCISES) {
      const main = [...ex.steps].reverse().find((s) => s.figure.direction !== "center")!;
      expect(main.text.es, ex.id).toMatch(/[úu]ltim/i);
      expect(main.text.en, ex.id).toMatch(/\blast\b/i);
      const halfway = ex.steps.filter((s) => /por la mitad/i.test(s.text.es));
      expect(halfway.length, ex.id).toBe(ex.durationMin >= 7 ? 1 : 0);
      for (const s of halfway) expect(s.text.en).toMatch(/halfway/i);
    }
  });
  it("neutral Spanish for the ear: no 'párate', no 'hacia delante'", () => {
    const all = allSpokenLines("es", CHROME.es).join(" \n ");
    expect(all).not.toMatch(/p[áa]rate/i);
    expect(all).not.toMatch(/hacia delante/i);
  });
  it("the bridge fits its 5 seconds in both languages", () => {
    for (const locale of LOCALES) {
      const text = spokenLine({ kind: "bridge" }, { exercise: WARMUP_EXERCISES[0], locale, chrome: CHROME[locale] })!;
      expect(VOICE_AFTER_CUE_MS + spokenMs(text, locale)).toBeLessThan(5000);
    }
  });
});
