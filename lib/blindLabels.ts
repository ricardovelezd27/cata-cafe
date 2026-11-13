// Blind sample letters (S10 WP2 / A4, closes audit F-crear-sesion-10).
//
// The letters on a blind cupping used to follow the order in which the owner
// typed the coffees, so "A" was always the first coffee entered and a cupper
// who knew the owner's habit could guess. Now every sample whose label the
// owner did NOT type is placed at a RANDOM one of the positions the auto
// samples occupy; samples with an owner-typed label keep their position and
// label (see BlindLabelMode: on create only a BLANK label is automatic). The letter is then derived from the NEW position ("Muestra A" for
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

/** How "automatic" is decided. Two explicit modes:
 *  - "create": the wizard already sends an EMPTY label for automatic rows, so
 *    ONLY a blank label is automatic. Anything typed, including "Muestra B",
 *    is the owner's (a teacher who pre-labelled physical cups) and is kept
 *    verbatim with its position.
 *  - "duplicate": stored labels of older sessions carry no "auto" flag, so a
 *    generated-looking label ("Muestra B") counts as automatic as well. */
export type BlindLabelMode = "create" | "duplicate";

/** CREATE paths: true only for a missing / empty / blank label. */
export function isBlankSampleLabel(label: string | null | undefined): boolean {
  return label === null || label === undefined || label.trim() === "";
}

/** DUPLICATE path: true for a blank label or one the app generated (or would
 *  generate): "Muestra X" / "Sample X" with X one or two capital letters or a
 *  number. Anything else is the owner's own label. */
export function isAutoSampleLabel(label: string | null | undefined): boolean {
  if (isBlankSampleLabel(label)) return true;
  return AUTO_LABEL_RE.test((label as string).trim());
}

/** The predicate of a mode. */
export function isAutoLabelFor(
  mode: BlindLabelMode,
  label: string | null | undefined,
): boolean {
  return mode === "create" ? isBlankSampleLabel(label) : isAutoSampleLabel(label);
}

export type BlindOrderEntry = {
  /** Final 0-based position of the input sample at the same index. */
  position: number;
  /** True when the label must be generated. */
  auto: boolean;
  /** Auto rows only: the 0-based letter index of the generated label. Drawn
   *  from the letters no typed label of the session already uses, in position
   *  order; without a typed clash it equals `position`. */
  letterIndex?: number;
};

const LETTER_LABEL_RE = /^(?:muestra|sample)\s+([a-z]{1,2})$/;

/** Letters ("B", "AA") that a TYPED label already uses, in either language and
 *  any case, so "Sample B" reserves the letter next to "Muestra B". */
function reservedLetters(
  samples: readonly { label: string | null | undefined }[],
  auto: readonly boolean[],
): Set<string> {
  const out = new Set<string>();
  samples.forEach((s, i) => {
    if (auto[i]) return;
    const m = LETTER_LABEL_RE.exec((s.label ?? "").trim().toLowerCase());
    if (m) out.add(m[1].toUpperCase());
  });
  return out;
}

/** First letter index (single letters only) not reserved; the position letter
 *  when every single letter is taken (cannot happen with <= 20 samples). */
function drawLetterIndex(taken: Set<string>, fallback: number): number {
  for (let k = 0; k < 26; k++) {
    const l = sampleLetter(k);
    if (!taken.has(l)) {
      taken.add(l);
      return k;
    }
  }
  return fallback;
}

/** Randomly permutes the AUTO samples among the positions they occupy.
 *  Returns, per input index, the new position and whether the label is auto.
 *  `random(n)` must return an integer in [0, n); out-of-range values are
 *  clamped so a bad source can never produce a duplicate position. */
export function planBlindOrder(
  samples: readonly { label: string | null | undefined }[],
  random: (maxExclusive: number) => number,
  mode: BlindLabelMode,
): BlindOrderEntry[] {
  const auto = samples.map((s) => isAutoLabelFor(mode, s.label));
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
  const entries: BlindOrderEntry[] = samples.map((_, i) => ({
    position: auto[i] ? shuffled[next++] : i,
    auto: auto[i],
  }));
  // Letters: the auto rows, in position order, take the first letters that no
  // typed label already uses (two samples never share an automatic label).
  const taken = reservedLetters(samples, auto);
  entries
    .filter((e) => e.auto)
    .sort((a, b) => a.position - b.position)
    .forEach((e) => {
      e.letterIndex = drawLetterIndex(taken, e.position);
    });
  return entries;
}

/** The label a sample is stored with: the owner's own text, or the letter of
 *  its final position. */
export function finalSampleLabel(
  label: string | null | undefined,
  entry: BlindOrderEntry,
  locale: string,
): string {
  return entry.auto
    ? sampleLetterLabel(entry.letterIndex ?? entry.position, locale)
    : (label ?? "").trim();
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
  mode: BlindLabelMode,
): BlindPlanned<T>[] {
  const order = planBlindOrder(samples, random, mode);
  return samples
    .map((sample, sourceIndex) => ({
      sample,
      sourceIndex,
      label: finalSampleLabel(sample.label, order[sourceIndex], locale),
      position: order[sourceIndex].position,
    }))
    .sort((a, b) => a.position - b.position);
}

/** The final position of the sample the owner marked as reference (an index
 *  into the INPUT list), after the blind shuffle. null = no reference or an
 *  index that is not in the plan. The reference travels with its sample: its
 *  row carries the coffee index and prep fields of the source sample. */
export function blindReferencePosition(
  planned: readonly { sourceIndex: number; position: number }[],
  referenceIdx: number | null,
): number | null {
  if (referenceIdx === null) return null;
  return planned.find((p) => p.sourceIndex === referenceIdx)?.position ?? null;
}
