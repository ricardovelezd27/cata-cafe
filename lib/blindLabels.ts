// Blind sample letters (S10 WP2 / A4, closes audit F-crear-sesion-10).
//
// The letters on a blind cupping used to follow the order in which the owner
// typed the coffees, so "A" was always the first coffee entered and a cupper
// who knew the owner's habit could guess. Now every sample whose label the
// owner did NOT type is placed at a RANDOM one of the positions the auto
// samples occupy; samples with an owner-typed label keep their position and
// label. The letter is then derived from the NEW position ("Muestra A" for
// position 0), so the order of the letters carries no information.
//
// Pure and dependency-free (no prisma, no server-only): the random source is
// injected so the permutation is unit-tested exhaustively.
// TODO(kim-validar:A4): simulated answer. Three-digit codes for formal cuppings
// are a later option (Kim: "más adelante").

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 0 -> "A" ... 25 -> "Z", 26 -> "AA" (bijective base 26). */
export function sampleLetter(position: number): string {
  let n = Math.max(0, Math.floor(position)) + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = LETTERS[r] + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "Muestra A" / "Sample A" for a (0-based) position. */
export function sampleLetterLabel(position: number, locale: string): string {
  return `${locale === "en" ? "Sample" : "Muestra"} ${sampleLetter(position)}`;
}

const AUTO_LABEL_RE = /^(?:Muestra|Sample)\s+(?:[A-Z]{1,2}|\d+)$/;

/** True for a label the app generated (or would generate): empty/blank, or
 *  "Muestra X" / "Sample X" with X one or two capital letters or a number.
 *  Anything else is the owner's own label and is never moved or rewritten. */
export function isAutoSampleLabel(label: string | null | undefined): boolean {
  if (label === null || label === undefined) return true;
  const t = label.trim();
  return t === "" || AUTO_LABEL_RE.test(t);
}

export type BlindOrderEntry = {
  /** Final 0-based position of the input sample at the same index. */
  position: number;
  /** True when the label must be generated from `position`. */
  auto: boolean;
};

/** Randomly permutes the AUTO samples among the positions they occupy.
 *  Returns, per input index, the new position and whether the label is auto.
 *  `random(n)` must return an integer in [0, n); out-of-range values are
 *  clamped so a bad source can never produce a duplicate position. */
export function planBlindOrder(
  samples: readonly { label: string | null | undefined }[],
  random: (maxExclusive: number) => number,
): BlindOrderEntry[] {
  const auto = samples.map((s) => isAutoSampleLabel(s.label));
  const slots: number[] = [];
  auto.forEach((isAuto, i) => {
    if (isAuto) slots.push(i);
  });
  // Fisher-Yates over the positions the auto samples occupy.
  const shuffled = [...slots];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const raw = random(i + 1);
    const j = Math.min(i, Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0)));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  let next = 0;
  return samples.map((_, i) => ({
    position: auto[i] ? shuffled[next++] : i,
    auto: auto[i],
  }));
}

/** The label a sample is stored with: the owner's own text, or the letter of
 *  its final position. */
export function finalSampleLabel(
  label: string | null | undefined,
  entry: BlindOrderEntry,
  locale: string,
): string {
  return entry.auto ? sampleLetterLabel(entry.position, locale) : (label ?? "").trim();
}

export type BlindPlanned<T> = {
  sample: T;
  /** Index in the input list (coffeeIdx and the reference travel with it). */
  sourceIndex: number;
  label: string;
  position: number;
};

/** `planBlindOrder` applied to a creation list: one row per sample, sorted by
 *  its final position, with the label the sample is stored with. */
export function planBlindSamples<T extends { label: string | null | undefined }>(
  samples: readonly T[],
  random: (maxExclusive: number) => number,
  locale: string,
): BlindPlanned<T>[] {
  const order = planBlindOrder(samples, random);
  return samples
    .map((sample, sourceIndex) => ({
      sample,
      sourceIndex,
      label: finalSampleLabel(sample.label, order[sourceIndex], locale),
      position: order[sourceIndex].position,
    }))
    .sort((a, b) => a.position - b.position);
}
