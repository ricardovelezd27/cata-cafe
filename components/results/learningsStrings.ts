// The words of "Aprendizajes" and of the reflection (package R4b), built ONCE on
// the server and passed to the client component as props (the project's i18n
// rule). Every string of `results.learnings` is read with `t.raw()`: the
// sentence patterns carry `{placeholders}` that `learningSentence`
// (lib/reports/learningSentences.ts) fills.

import { LEARNING_SENTENCE_KEYS, type LearningSentenceStrings } from "@/lib/reports/learningSentences";

/** The section's own words, in the order of the messages file. */
export const LEARNINGS_CHROME_KEYS = [
  "title",
  "lead",
  "panelTitle",
  "mineTitle",
  "tooFew",
  "panelNone",
  "mineNone",
  "closing",
  "reflectionTitle",
  "reflectionLead",
  "reflectionWho",
  "reflectionWhoSolo",
] as const;

export type LearningsChromeKey = (typeof LEARNINGS_CHROME_KEYS)[number];

/** Every key of `results.learnings`: the section's words, then the sentences. */
export const RESULTS_LEARNINGS_KEYS = [...LEARNINGS_CHROME_KEYS, ...LEARNING_SENTENCE_KEYS] as const;

export type LearningsStrings = Record<LearningsChromeKey, string> & { sentences: LearningSentenceStrings };

type RawTranslator = { raw: (key: string) => unknown };

export function buildLearningsStrings(t: RawTranslator): LearningsStrings {
  const read = (key: string) => String(t.raw(`learnings.${key}`));
  return {
    ...(Object.fromEntries(LEARNINGS_CHROME_KEYS.map((key) => [key, read(key)])) as Record<LearningsChromeKey, string>),
    sentences: Object.fromEntries(LEARNING_SENTENCE_KEYS.map((key) => [key, read(key)])) as LearningSentenceStrings,
  };
}
