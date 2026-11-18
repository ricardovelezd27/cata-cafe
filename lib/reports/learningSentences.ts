// The sentence of each learning (package R4b). Pure: no React, no i18n
// framework. A learning is data (lib/reports/learnings.ts); here it becomes
// words, from patterns the messages hold (`results.learnings.*`) and names the
// caller resolves:
//   - a sample by its label and, once revealed, its coffee;
//   - a descriptor by its flavour-wheel label;
//   - a quality attribute by its name;
//   - a defect type by its label ("sin especificar" when none was recorded).
// No name of a person exists anywhere in the input, so none can be printed.
// A sentence is a list of segments; the `strong` ones are its subject (the
// coffee, the descriptor, the attribute). A score is printed with two decimals,
// a spread with one, a difference with its sign. Nothing is graded.

import type { Learning } from "@/lib/reports/learnings";

/** The keys of the sentence patterns in `results.learnings`. */
export const LEARNING_SENTENCE_KEYS = [
  "g0",
  "g1",
  "g2",
  "g3",
  "g4",
  "g4Single",
  "g4One",
  "g5",
  "g5Single",
  "p1",
  "p2",
  "p3",
  "p3One",
  "p4Above",
  "p4Below",
  "p5",
  "p6Within",
  "p6Outside",
  "s1",
  "s2",
  "s2Single",
  "s2OneAbove",
  "s2OneBelow",
  // the fragments a sentence is filled with
  "included",
  "includedNoTotal",
  "cupsOne",
  "cupsMany",
  "typeItem",
  "unspecified",
  "samplesOne",
  "samplesMany",
] as const;

export type LearningSentenceKey = (typeof LEARNING_SENTENCE_KEYS)[number];
export type LearningSentenceStrings = Record<LearningSentenceKey, string>;

export type LearningNames = {
  /** A sample's label and, once revealed, its coffee's name. */
  sample: (id: string) => string;
  /** A wheel node's label. */
  descriptor: (id: string) => string;
  /** A quality attribute's name. */
  attribute: (id: string) => string;
  /** A defect type's label; called only with a recorded type. */
  defectType: (type: string) => string;
};

export type SentenceSegment = { text: string; strong: boolean };

const score = (v: number) => v.toFixed(2);
const spread = (v: number) => v.toFixed(1);
/** A difference with its sign: "+2.00", "−0.50" (a real minus), "0.00". */
const signed = (v: number) => {
  const text = Math.abs(v).toFixed(2);
  if (Number(text) === 0) return text;
  return v > 0 ? `+${text}` : `−${text}`;
};
const fill = (pattern: string, vars: Record<string, string | number>) =>
  pattern.replace(/\{([a-zA-Z]+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));

/** A pattern cut into segments, the placeholders named in `strong` marked so. */
function segments(pattern: string, vars: Record<string, string | number>, strong: readonly string[]): SentenceSegment[] {
  const out: SentenceSegment[] = [];
  const push = (text: string, isStrong: boolean) => {
    if (text === "") return;
    const last = out[out.length - 1];
    if (last && last.strong === isStrong) last.text += text;
    else out.push({ text, strong: isStrong });
  };
  let at = 0;
  for (const match of pattern.matchAll(/\{([a-zA-Z]+)\}/g)) {
    const key = match[1];
    push(pattern.slice(at, match.index), false);
    push(key in vars ? String(vars[key]) : match[0], strong.includes(key));
    at = (match.index ?? 0) + match[0].length;
  }
  push(pattern.slice(at), false);
  return out;
}

/** The sentence of one learning, as segments. */
export function learningSentence(l: Learning, names: LearningNames, t: LearningSentenceStrings): SentenceSegment[] {
  const sample = (index: number) => names.sample(l.about[index] ?? "");
  switch (l.rule) {
    case "G0":
      return segments(
        t.g0,
        { descriptor: names.descriptor(l.params.descriptor), sample: sample(0), people: l.params.people, of: l.params.of },
        ["descriptor"],
      );
    case "G1":
    case "G2": {
      const included =
        l.params.submitted === null
          ? fill(t.includedNoTotal, { n: l.params.included })
          : fill(t.included, { n: l.params.included, total: l.params.submitted });
      return segments(l.rule === "G1" ? t.g1 : t.g2, { sample: sample(0), spread: spread(l.params.spread), included }, ["sample"]);
    }
    case "G3":
      return segments(t.g3, { a: sample(0), b: sample(1), gap: score(l.params.gap) }, ["a", "b"]);
    case "G4":
      return segments(
        l.params.of === 1 ? t.g4One : l.params.above === 1 ? t.g4Single : t.g4,
        {
          reference: sample(0),
          score: score(l.params.referenceScore),
          above: l.params.above,
          of: l.params.of,
          sample: sample(1),
          delta: signed(l.params.delta),
        },
        ["sample"],
      );
    case "G5": {
      const types = l.params.types
        .map((type) =>
          fill(t.typeItem, {
            type: type.type === null ? t.unspecified : names.defectType(type.type),
            cups: type.cups === 1 ? t.cupsOne : fill(t.cupsMany, { n: type.cups }),
          }),
        )
        .join("; ");
      return segments(
        l.params.people === 1 ? t.g5Single : t.g5,
        { sample: sample(0), people: l.params.people, of: l.params.of, types },
        ["sample"],
      );
    }
    case "P1":
    case "P2":
      return segments(
        l.rule === "P1" ? t.p1 : t.p2,
        { sample: sample(0), mine: score(l.params.mine), group: score(l.params.group), difference: signed(l.params.difference) },
        ["sample"],
      );
    case "P3":
      return segments(
        l.params.of === 1 ? t.p3One : t.p3,
        { above: l.params.above, of: l.params.of, mean: signed(l.params.meanDifference) },
        [],
      );
    case "P4":
      return segments(
        l.params.meanDifference >= 0 ? t.p4Above : t.p4Below,
        {
          attribute: names.attribute(l.params.attribute),
          x: score(Math.abs(l.params.meanDifference)),
          sampleCount: l.params.samples === 1 ? t.samplesOne : fill(t.samplesMany, { n: l.params.samples }),
        },
        ["attribute"],
      );
    case "P5":
      return segments(t.p5, { matches: l.params.matches, opportunities: l.params.opportunities, percent: l.params.percent }, []);
    case "P6":
      return segments(
        l.params.within ? t.p6Within : t.p6Outside,
        {
          a: sample(0),
          b: sample(1),
          scoreA: score(l.params.scoreA),
          scoreB: score(l.params.scoreB),
          difference: score(l.params.difference),
          tolerance: l.params.tolerance,
        },
        ["a", "b"],
      );
    case "S1":
      return segments(
        t.s1,
        { a: sample(0), b: sample(1), highest: score(l.params.highest), lowest: score(l.params.lowest), range: score(l.params.range) },
        ["a", "b"],
      );
    case "S2":
      return segments(
        l.params.of === 1 ? (l.params.above === 1 ? t.s2OneAbove : t.s2OneBelow) : l.params.above === 1 ? t.s2Single : t.s2,
        { reference: sample(0), score: score(l.params.referenceScore), above: l.params.above, of: l.params.of },
        [],
      );
  }
}

/** The same sentence as plain text (what a screen reader hears; what a test reads). */
export function learningText(l: Learning, names: LearningNames, t: LearningSentenceStrings): string {
  return learningSentence(l, names, t)
    .map((s) => s.text)
    .join("");
}
