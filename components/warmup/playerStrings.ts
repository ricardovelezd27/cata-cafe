import type { WarmupPlayerStrings } from "./WarmupPlayer";

/** Minimal shape of next-intl's `t` we need (works for getTranslations and
 *  useTranslations scoped to "warmup"). */
type T = ((key: string) => string) & { raw: (key: string) => string };

/** Builds the player's chrome strings from the `warmup` namespace. Strings
 *  with ICU-style `{n}` placeholders are fetched with `t.raw()` and filled
 *  client-side (calling `t()` without the arg would render the raw key). */
export function warmupPlayerStrings(t: T): WarmupPlayerStrings {
  return {
    start: t("player.start"),
    next: t("player.next"),
    prev: t("player.prev"),
    pause: t("player.pause"),
    resume: t("player.resume"),
    skip: t("player.skip"),
    finish: t("player.finish"),
    close: t("player.close"),
    stepOf: t.raw("player.stepOf"),
    remaining: t.raw("player.remaining"),
    pauseTitle: t("player.pauseTitle"),
    pauseBody: t.raw("player.pauseBody"),
    minutes: t.raw("player.minutes"),
    stepsCount: t.raw("player.stepsCount"),
    postureLabel: t("player.postureLabel"),
    observeTitle: t("player.observeTitle"),
    closingTitle: t("player.closingTitle"),
    doneTitle: t("player.doneTitle"),
    doneBody: t("player.doneBody"),
    evolutionLabel: t("player.evolutionLabel"),
    reducedMotionNote: t("player.reducedMotionNote"),
    pausedLabel: t("player.pausedLabel"),
    keyboardHint: t("player.keyboardHint"),
    intro: t("player.intro"),
  };
}
