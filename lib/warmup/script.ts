// What the guide voice SAYS at each point of a run. Pure (no React, no DOM).
//
// The timeline (timeline.ts) says WHEN something is spoken and what kind of
// thing it is (`NarrationSource`); this module turns that into the words, or
// into null when that point is silent. One function, used by the player, by
// the render script (which lines must have a file) and by the tests (does
// every line fit where it is said?).
//
// Three kinds of text meet here:
//  - step instructions and observe prompts: lib/warmup/exercises.ts;
//  - the lines of the arrival, the closing and the short cues: the chrome
//    strings of messages/*.json (`warmup.*`), where the SAME text is also
//    what the screen shows;
//  - the words whose spoken form differs from the label on screen: here.

import { lw, type Localized, type WarmupExercise, type WarmupFigureKind } from "./exercises";
import type { NarrationSource, SegmentLabel } from "./timelineTypes";

/** The chrome strings the voice reads (a subset of WarmupPlayerStrings). */
export interface SpokenChrome {
  readonly cueStop: string;
  readonly cueReturn: string;
  readonly cueOtherSide: string;
  readonly arrivePosture: string;
  readonly arrivePostureStanding: string;
  readonly arriveNotice: string;
  readonly breathInFirst: string;
  readonly breathOutFirst: string;
  readonly breathIn: string;
  readonly breathOut: string;
  readonly closingStill: string;
  readonly closingOpen: string;
}

/** The same strings straight from a messages file (`messages.warmup`): what
 *  the render script and the tests use, where there is no translator. */
export function spokenChromeFromMessages(w: {
  player: { cueStop: string; cueReturn: string; cueOtherSide: string };
  arrive: { posture: string; postureStanding: string; notice: string };
  breath: { inFirst: string; outFirst: string; in: string; out: string };
  closing: { still: string; open: string };
}): SpokenChrome {
  return {
    cueStop: w.player.cueStop,
    cueReturn: w.player.cueReturn,
    cueOtherSide: w.player.cueOtherSide,
    arrivePosture: w.arrive.posture,
    arrivePostureStanding: w.arrive.postureStanding,
    arriveNotice: w.arrive.notice,
    breathInFirst: w.breath.inFirst,
    breathOutFirst: w.breath.outFirst,
    breathIn: w.breath.in,
    breathOut: w.breath.out,
    closingStill: w.closing.still,
    closingOpen: w.closing.open,
  };
}

// The bar under the figure shows one word ("Derecha"). Said aloud after the
// bell, the spoken form is a short phrase.
const DIRECTION: Partial<Record<SegmentLabel, Localized>> = {
  up: { es: "Sube.", en: "Up." },
  down: { es: "Baja.", en: "Down." },
  right: { es: "A la derecha.", en: "To the right." },
  left: { es: "A la izquierda.", en: "To the left." },
  forward: { es: "Hacia adelante.", en: "Forward." },
  back: { es: "Hacia atrás.", en: "Back." },
  center: { es: "Al centro.", en: "To the centre." },
};
// The eyes do not "go up" the way an arm does.
const DIRECTION_EYES: Partial<Record<SegmentLabel, Localized>> = {
  up: { es: "Hacia arriba.", en: "Upward." },
  down: { es: "Hacia abajo.", en: "Downward." },
};

/** The spoken direction word of a leg, or null for the labels that are never
 *  said: "Rápido", "Quieto", "A continuación" and the section names only
 *  repeat what the instruction or the sound already said. */
export function spokenDirection(label: SegmentLabel, kind: WarmupFigureKind, locale: string): string | null {
  const line = (kind === "eyes" ? DIRECTION_EYES[label] : undefined) ?? DIRECTION[label];
  return line ? lw(line, locale) : null;
}

/** The bridge to the table has 5 seconds: the voice says the first sentence
 *  only, the screen shows both. */
export const BRIDGE_SPOKEN: Localized = {
  es: "Lleva esta atención a la taza.",
  en: "Take this attention to the cup.",
};

export interface ScriptContext {
  /** The exercise AS PLAYED (already cut for the short version). */
  readonly exercise: WarmupExercise;
  readonly locale: string;
  readonly chrome: SpokenChrome;
  /** The "Sentado" option of the standing exercise. */
  readonly seated?: boolean;
}

/** The posture line that opens the arrival (the seated substitution exists
 *  only for the standing exercise). */
export function postureLine(ctx: ScriptContext): string {
  const ex = ctx.exercise;
  if (ex.posture !== "standing") return ctx.chrome.arrivePosture;
  return ctx.seated && ex.seated ? lw(ex.seated.arrivePosture, ctx.locale) : ctx.chrome.arrivePostureStanding;
}

/** The words for one narration point, or null when it is silent. */
export function spokenLine(src: NarrationSource, ctx: ScriptContext): string | null {
  const { exercise: ex, locale, chrome } = ctx;
  switch (src.kind) {
    case "step":
      return lw(ex.steps[src.stepIdx].text, locale);
    case "observe":
      return lw(ex.observe[src.observeIdx], locale);
    case "label":
      return spokenDirection(src.label, ex.figureKind, locale);
    case "chrome":
      return src.cue === "stop" ? chrome.cueStop : src.cue === "return" ? chrome.cueReturn : chrome.cueOtherSide;
    case "arrive":
      return src.phase === "notice" ? chrome.arriveNotice : postureLine(ctx);
    case "breath":
      return src.dir === "in" ? (src.first ? chrome.breathInFirst : chrome.breathIn) : src.first ? chrome.breathOutFirst : chrome.breathOut;
    case "closing":
      return chrome.closingStill;
    case "closingOpen":
      return chrome.closingOpen;
    case "bridge":
      return lw(BRIDGE_SPOKEN, locale);
  }
}
