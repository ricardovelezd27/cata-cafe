import type { SegmentLabel } from "@/lib/warmup/timelineTypes";

/** Minimal shape of next-intl's `t` we need (works for getTranslations and
 *  useTranslations scoped to "warmup"). */
type T = ((key: string) => string) & { raw: (key: string) => string };

/** Chrome strings for the v3 player (messages/*.json `warmup.*`). Strings
 *  with ICU-style `{n}` placeholders are fetched with `t.raw()` and filled
 *  client-side (calling `t()` without the arg would render the raw key).
 *  Kim's step texts never pass through here — they come from
 *  lib/warmup/exercises.ts. */
export interface WarmupPlayerStrings {
  /* intro */
  start: string;
  postureLabel: string;
  evolutionLabel: string;
  sequenceLabel: string;
  optionsTitle: string;
  soundLabel: string;
  voiceToggle: string;
  voiceHint: string;
  accessibleLabel: string;
  largeTextLabel: string;
  stillLabel: string;
  stillHelp: string;
  soundDemo: string;
  soundDemoCaptions: string;
  wakeLockNote: string;
  reducedMotionNote: string;
  keyboardHint: string;
  /** "{min} min" / "{count} pasos" */
  minutes: string;
  stepsCount: string;
  /* run chrome */
  /** "Paso {n} de {total}" */
  stepOf: string;
  arriveEyebrow: string;
  closingTitle: string;
  upNext: string;
  paused: string;
  pause: string;
  resume: string;
  next: string;
  prev: string;
  close: string;
  skipExercise: string;
  muteLabel: string;
  unmuteLabel: string;
  /** "Quedan {n} segundos" (aria-live at 10/5/3) */
  remaining: string;
  labels: Record<SegmentLabel, string>;
  cueStop: string;
  cueReturn: string;
  cueOtherSide: string;
  breathOnItsOwn: string;
  /* arrive */
  arrivePosture: string;
  arrivePostureStanding: string;
  breathInFirst: string;
  breathOutFirst: string;
  breathIn: string;
  breathOut: string;
  arriveNotice: string;
  /* closing / bridge */
  closingStill: string;
  closingOpen: string;
  bridge: string;
  goToTable: string;
  /* reflect / done (library) */
  reflectEyebrow: string;
  reflectTitle: string;
  reflectLead: string;
  answerLabel: string;
  save: string;
  omit: string;
  savedNote: string;
  doneTitle: string;
  doneBody: string;
  noticedTitle: string;
  repeat: string;
  backToList: string;
  finish: string;
}

const LABEL_KEYS: SegmentLabel[] = [
  "up",
  "down",
  "right",
  "left",
  "forward",
  "back",
  "center",
  "hold",
  "still",
  "fast",
  "upNext",
  "arrive",
  "closing",
  "bridge",
];

/** Builds the player's chrome strings from the `warmup` namespace. */
export function warmupPlayerStrings(t: T): WarmupPlayerStrings {
  const labels = Object.fromEntries(LABEL_KEYS.map((k) => [k, t(`label.${k}`)])) as Record<SegmentLabel, string>;
  return {
    start: t("player.start"),
    postureLabel: t("player.postureLabel"),
    evolutionLabel: t("player.evolutionLabel"),
    sequenceLabel: t("player.sequenceLabel"),
    optionsTitle: t("player.optionsTitle"),
    soundLabel: t("player.soundLabel"),
    voiceToggle: t("player.voiceToggle"),
    voiceHint: t("player.voiceHint"),
    accessibleLabel: t("player.accessibleLabel"),
    largeTextLabel: t("player.largeTextLabel"),
    stillLabel: t("player.stillLabel"),
    stillHelp: t("player.stillHelp"),
    soundDemo: t("player.soundDemo"),
    soundDemoCaptions: t("player.soundDemoCaptions"),
    wakeLockNote: t("player.wakeLockNote"),
    reducedMotionNote: t("player.reducedMotionNote"),
    keyboardHint: t("player.keyboardHint"),
    minutes: t.raw("player.minutes"),
    stepsCount: t.raw("player.stepsCount"),
    stepOf: t.raw("player.stepOf"),
    arriveEyebrow: t("player.arriveEyebrow"),
    closingTitle: t("player.closingTitle"),
    upNext: t("player.upNext"),
    paused: t("player.paused"),
    pause: t("player.pause"),
    resume: t("player.resume"),
    next: t("player.next"),
    prev: t("player.prev"),
    close: t("player.close"),
    skipExercise: t("player.skipExercise"),
    muteLabel: t("player.muteLabel"),
    unmuteLabel: t("player.unmuteLabel"),
    remaining: t.raw("player.remaining"),
    labels,
    cueStop: t("player.cueStop"),
    cueReturn: t("player.cueReturn"),
    cueOtherSide: t("player.cueOtherSide"),
    breathOnItsOwn: t("player.breathOnItsOwn"),
    arrivePosture: t("arrive.posture"),
    arrivePostureStanding: t("arrive.postureStanding"),
    breathInFirst: t("breath.inFirst"),
    breathOutFirst: t("breath.outFirst"),
    breathIn: t("breath.in"),
    breathOut: t("breath.out"),
    arriveNotice: t("arrive.notice"),
    closingStill: t("closing.still"),
    closingOpen: t("closing.open"),
    bridge: t("bridge"),
    goToTable: t("player.goToTable"),
    reflectEyebrow: t("reflect.eyebrow"),
    reflectTitle: t("reflect.title"),
    reflectLead: t("reflect.lead"),
    answerLabel: t("reflect.answerLabel"),
    save: t("reflect.save"),
    omit: t("reflect.omit"),
    savedNote: t("reflect.savedNote"),
    doneTitle: t("player.doneTitle"),
    doneBody: t("player.doneBody"),
    noticedTitle: t("player.noticedTitle"),
    repeat: t("player.repeat"),
    backToList: t("player.backToList"),
    finish: t("player.finish"),
  };
}
