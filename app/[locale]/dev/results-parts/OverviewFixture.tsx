"use client";

import { CoffeeCards } from "@/components/results/CoffeeCards";
import type { CardsStrings } from "@/components/results/cardsStrings";
import { SessionOverview } from "@/components/results/SessionOverview";
import type { OverviewStrings } from "@/components/results/overviewStrings";
import type { ResultsPartsStrings } from "@/components/results/partsStrings";
import type { OverviewScenario } from "@/lib/dev/overviewFixtures";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import { wheelNodeLabels, type WheelLocale } from "@/lib/flavorWheelLabels";
import { coffeeCards } from "@/lib/reports/coffeeCards";

/** One invented cupping drawn with the real overview and the real coffee
 *  cards. Opening a coffee does nothing here: the board has no coffee sheet. */
export function OverviewFixture({
  scenario,
  locale,
  familyLabels,
  parts,
  t,
  cards,
}: {
  scenario: OverviewScenario;
  locale: WheelLocale;
  familyLabels: Record<WheelFamilyId, string>;
  parts: ResultsPartsStrings;
  t: OverviewStrings;
  cards: CardsStrings;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <SessionOverview
        samples={scenario.samples}
        ctx={scenario.ctx}
        referenceId={scenario.referenceId}
        data={scenario.data}
        myAlignment={scenario.myAlignment}
        preliminary={scenario.preliminary}
        compare={{ closed: scenario.closed, t: cards }}
        familyLabels={familyLabels}
        parts={parts}
        t={t}
        onOpenSample={() => {}}
      >
      <CoffeeCards
        cards={coffeeCards({
          samples: scenario.samples,
          referenceId: scenario.referenceId,
          ctx: scenario.ctx,
          data: scenario.data,
        })}
        format={scenario.ctx.format}
        referencePinned={scenario.referencePinned}
        // the organizer of the open cupping: "Revelar" on a card
        canReveal={scenario.preliminary}
        onReveal={() => {}}
        onOpenSample={() => {}}
        familyLabels={familyLabels}
        nodeLabels={wheelNodeLabels(locale)}
        parts={parts}
        t={cards}
      />
      </SessionOverview>
    </div>
  );
}
