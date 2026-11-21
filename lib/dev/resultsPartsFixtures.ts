// Invented scores, rankings and ratings for the results parts (package R1b):
// shared by the dev page (app/[locale]/dev/results-parts) and by
// tests/resultsParts.test.ts, so what a person looks at and what a test renders
// are the same data. Every coffee, cupper and number is made up.
//
// Each fixture is built THROUGH the pure rules a real page will use
// (`scoreContext`), never by hand, so the page shows what those
// rules really give for one, two, three and six cuppers.

import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import type { RankValue } from "@/lib/reports/ranking";
import { scoreContext, type ScoreContext } from "@/lib/scoreContext";

export type FixtureLocale = "es" | "en";

const community = (score: number, sd: number | null, n: number, total: number, cups: number): RankValue => ({
  score,
  sd,
  basis: "community",
  n,
  total,
  cups,
});
const own = (score: number | null): RankValue => ({ score, sd: null, basis: score === null ? null : "mine", n: null, total: null });

// ── Score with context ───────────────────────────────────────────────────────

export type ScoreFixture = { id: string; cuppers: number | null; context: ScoreContext };

/** One score as it reads with 1, 2, 3 and 6 included cuppers, alone, and absent. */
export const SCORE_FIXTURES: ScoreFixture[] = [
  { id: "one", cuppers: 1, context: scoreContext({ value: community(84.25, null, 1, 1, 2), mine: 84.25 }) },
  { id: "two", cuppers: 2, context: scoreContext({ value: community(85.5, 1.25, 2, 2, 4), mine: 86.75 }) },
  {
    id: "three",
    cuppers: 3,
    context: scoreContext({ value: community(86.25, 1.8, 3, 4, 6), mine: 87.5, deltaVsReference: 7.25 }),
  },
  {
    id: "six",
    cuppers: 6,
    context: scoreContext({
      value: community(88.75, 2.9, 6, 6, 12),
      mine: 86.75,
      deltaVsReference: 9.75,
    }),
  },
  { id: "solo", cuppers: null, context: scoreContext({ value: own(86.5), mine: 86.5 }) },
  { id: "none", cuppers: null, context: scoreContext({ value: own(null), mine: null }) },
];

// ── The ranking ──────────────────────────────────────────────────────────────

export type RankFixtureRow = {
  id: string;
  place: string | null;
  label: string;
  name: string | null;
  context: ScoreContext;
};

export type RankFixture = {
  id: "panel" | "two" | "solo";
  rows: RankFixtureRow[];
  reference: { label: string; score: number } | null;
};

type RankSeed = { letter: string; name: string | null; value: RankValue; mine: number | null };

function rankRows(seeds: readonly RankSeed[], sample: string, referenceScore: number | null): RankFixtureRow[] {
  return seeds.map((s, i) => ({
    id: s.letter,
    place: String(i + 1),
    label: `${sample} ${s.letter}`,
    name: s.name,
    context: scoreContext({
      value: s.value,
      mine: s.mine,
      deltaVsReference: referenceScore !== null && s.value.score !== null ? s.value.score - referenceScore : null,
    }),
  }));
}

export function rankFixtures(locale: FixtureLocale): RankFixture[] {
  const sample = locale === "en" ? "Sample" : "Muestra";
  return [
    {
      // seven of eight cuppers: three neighbours with no clear difference, a
      // fixed reference, and a coffee under the scale (two defective cups)
      id: "panel",
      reference: { label: `${sample} E`, score: 79 },
      rows: rankRows(
        [
          { letter: "G", name: "Ámbar", value: community(88.75, 2.9, 7, 8, 14), mine: 90.75 },
          { letter: "C", name: "Cedro", value: community(88, 2.1, 7, 8, 14), mine: 87.25 },
          { letter: "A", name: "Niebla", value: community(87.5, 1.6, 7, 8, 14), mine: 88 },
          { letter: "B", name: null, value: community(84.25, 3.4, 7, 8, 14), mine: 82 },
          { letter: "F", name: null, value: community(81, 1.2, 7, 8, 14), mine: 81.5 },
          { letter: "D", name: "Musgo", value: community(56.5, 4, 7, 8, 14), mine: 55.25 },
        ],
        sample,
        79,
      ),
    },
    {
      // two cuppers: the group's dot, no spread, no difference, never "first"
      id: "two",
      reference: null,
      rows: rankRows(
        [
          { letter: "B", name: null, value: community(86.5, 0.75, 2, 2, 4), mine: 87.25 },
          { letter: "A", name: null, value: community(83.25, 1.5, 2, 2, 4), mine: 81.75 },
          { letter: "C", name: null, value: community(80, 0.5, 2, 2, 4), mine: 80.5 },
        ],
        sample,
        null,
      ),
    },
    {
      // a solo cupper: their own ring, nothing of a group
      id: "solo",
      reference: null,
      rows: rankRows(
        [
          { letter: "C", name: "Ámbar", value: own(87.5), mine: 87.5 },
          { letter: "A", name: "Cedro", value: own(85), mine: 85 },
          { letter: "D", name: null, value: own(82.25), mine: 82.25 },
          { letter: "B", name: null, value: own(80), mine: 80 },
        ],
        sample,
        null,
      ),
    },
  ];
}

// ── The dot plot ─────────────────────────────────────────────────────────────

export type DotFixtureRow = { id: string; label: string; mine: number | null; group: number | null };

const QUALITY_EN: Record<string, string> = {
  fragancia_af: "Fragrance",
  aroma_af: "Aroma",
  sabor_af: "Flavor",
  sabor_residual_af: "Aftertaste",
  acidez_af: "Acidity",
  dulzor_af: "Sweetness",
  sensacion_af: "Mouthfeel",
  impresion_global: "Overall",
};

/** Quality, 1 to 9: the reader's whole numbers against the group's averages.
 *  "Dulzor" has no group value (nobody else rated it). */
export function qualityFixture(locale: FixtureLocale): DotFixtureRow[] {
  const mine = [7, 7, 8, 6, 8, 7, 6, 9];
  const group: (number | null)[] = [6.6, 7.1, 7.4, 6.9, 7.9, null, 6.4, 7.6];
  return AFFECTIVE_ATTRIBUTES.map((a, i) => ({
    id: a.id,
    label: locale === "en" ? (QUALITY_EN[a.id] ?? a.label) : a.label,
    mine: mine[i],
    group: group[i],
  }));
}

/** Intensities, 0 to 15. The first row sits at the lowest value and the last at
 *  the highest, so both ends of the track are seen. */
export function intensityFixture(locale: FixtureLocale): DotFixtureRow[] {
  const es = ["Fragancia", "Aroma", "Sabor", "Sabor residual", "Acidez", "Dulzor", "Sensación en boca"];
  const en = ["Fragrance", "Aroma", "Flavor", "Aftertaste", "Acidity", "Sweetness", "Mouthfeel"];
  const mine = [0, 9, 11, 7, 12, 8, 15];
  const group = [2.5, 8.2, 10.4, 7, 10.9, 9.3, 12.8];
  return es.map((label, i) => ({
    id: `intensity-${i}`,
    label: locale === "en" ? en[i] : label,
    mine: mine[i],
    group: group[i],
  }));
}
