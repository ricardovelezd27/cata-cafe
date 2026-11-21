"use client";

import { CoffeeCards } from "@/components/results/CoffeeCards";
import { Reflection, type ReflectionStrings } from "@/components/results/Reflection";
import type { CardsStrings } from "@/components/results/cardsStrings";
import { SessionOverview } from "@/components/results/SessionOverview";
import type { OverviewStrings } from "@/components/results/overviewStrings";
import type { ResultsPartsStrings } from "@/components/results/partsStrings";
import type { OverviewScenario } from "@/lib/dev/overviewFixtures";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import { wheelNodeLabels, type WheelLocale } from "@/lib/flavorWheelLabels";
import { coffeeCards } from "@/lib/reports/coffeeCards";

/** One invented cupping drawn with the real overview, the real coffee cards
 *  and, once closed, the real reflection (its buttons call the real action: not
 *  to be pressed on the board). Opening a coffee does nothing here. */
export function OverviewFixture({
  scenario,
  locale,
  familyLabels,
  parts,
  t,
  cards,
  reflection,
  oldDated,
  closeLabel,
}: {
  scenario: OverviewScenario;
  locale: WheelLocale;
  familyLabels: Record<WheelFamilyId, string>;
  parts: ResultsPartsStrings;
  t: OverviewStrings;
  cards: CardsStrings;
  reflection: ReflectionStrings;
  oldDated: string;
  closeLabel: string;
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
      {scenario.closed ? (
        <Reflection
          sessionId={`dev-${scenario.id}`}
          // one cupping shows a saved reflection, the others the empty editor
          mine={
            scenario.id === "closed-owner"
              ? { text: "La mesa coincidió más de lo que esperaba. La próxima, dos tazas más por muestra.", at: "2026-11-21T09:15:00.000Z" }
              : { text: null, at: null }
          }
          oldNotes={[]}
          onlyReader={!scenario.ctx.isGroup || scenario.id === "closed-owner"}
          locale={locale}
          userId="dev"
          oldDated={oldDated}
          closeLabel={closeLabel}
          t={reflection}
        />
      ) : null}
    </div>
  );
}
