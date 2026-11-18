"use client";

import type { CardsStrings } from "@/components/results/cardsStrings";
import type { OverviewStrings } from "@/components/results/overviewStrings";
import type { ResultsPartsStrings } from "@/components/results/partsStrings";
import {
  SampleDetail,
  type SampleDetailTranslations,
  type SheetCompareTranslations,
} from "@/components/results/SampleDetail";
import type { SheetStrings } from "@/components/results/sheetStrings";
import type { OverviewScenario } from "@/lib/dev/overviewFixtures";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import { coffeeCards, compareOptions } from "@/lib/reports/coffeeCards";

export type SheetWords = {
  detail: SampleDetailTranslations;
  compare: SheetCompareTranslations;
  s: SheetStrings;
  blockLabels: Record<string, string>;
};

/** One coffee of an invented cupping drawn with the real sheet body, wired as
 *  the results page wires it (the same gates: `coffeeCards`, `compareOptions`,
 *  the server-built wheel, defects and lists of the scenario). */
export function SheetFixture({
  scenario,
  sampleIndex,
  locale,
  familyLabels,
  parts,
  overview,
  cards: cardsT,
  words,
}: {
  scenario: OverviewScenario;
  sampleIndex: number;
  locale: "es" | "en";
  familyLabels: Record<WheelFamilyId, string>;
  parts: ResultsPartsStrings;
  overview: OverviewStrings;
  cards: CardsStrings;
  words: SheetWords;
}) {
  const sample = scenario.samples[sampleIndex];
  const { format, isGroup, canViewGroup, cupsPerSample } = scenario.ctx;
  const cards = coffeeCards({
    samples: scenario.samples,
    referenceId: scenario.referenceId,
    ctx: scenario.ctx,
    data: scenario.data,
  });
  const card = cards.find((c) => c.sample.id === sample.id) ?? null;
  const agg = sample.aggregateScore;
  const options = compareOptions({
    closed: scenario.closed,
    samples: scenario.samples,
    order: cards.filter((c) => !c.isReference).map((c) => c.sample.id),
    data: scenario.data,
  });
  const self = options?.find((o) => o.id === sample.id) ?? null;
  const data = format === "affective" ? sample.affective : format === "descriptive" ? sample.descriptive : sample.combined;
  return (
    <div style={{ maxWidth: 560, padding: 16, border: "1px solid var(--color-outline-variant)", borderRadius: 12, background: "var(--color-surface-container-lowest)" }}>
      <SampleDetail
        data={data}
        format={format}
        cupsPerSample={cupsPerSample}
        locale={locale}
        myEvaluation={sample.myEvaluation}
        referenceBadge={sample.referenceRank !== null ? cardsT.referenceBadge : null}
        referencePinned={sample.referenceRank !== null && scenario.referencePinned}
        card={card}
        aggregate={
          isGroup && canViewGroup && agg && agg.communityScore != null
            ? { ...agg, avgRawScore: agg.communityScore, totalNonUniform: 0, totalDefective: 0, uniformityPenalty: 0, defectPenalty: 0 }
            : null
        }
        wheel={scenario.data.samples[sample.id]?.wheel ?? null}
        defects={scenario.data.samples[sample.id]?.defects ?? null}
        sheet={scenario.sheets[sample.id] ?? null}
        comparison={sample.comparison ?? null}
        compare={
          options && self
            ? {
                self,
                others: options.filter((o) => o.id !== sample.id),
                names: Object.fromEntries(
                  scenario.samples.map((x) => [x.id, x.revealed && x.coffee ? `${x.label} ${x.coffee.name}` : x.label]),
                ),
                short: Object.fromEntries(
                  scenario.samples.map((x) => [x.id, x.revealed && x.coffee ? x.coffee.name : x.label]),
                ),
              }
            : null
        }
        extrinsic={{}}
        familyLabels={familyLabels}
        blockLabels={words.blockLabels}
        parts={parts}
        cards={cardsT}
        overview={overview}
        s={words.s}
        compareT={words.compare}
        t={words.detail}
      />
    </div>
  );
}
