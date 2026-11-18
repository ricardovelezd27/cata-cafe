"use client";

import { CoffeeCards } from "@/components/results/CoffeeCards";
import type { CardsStrings } from "@/components/results/cardsStrings";
import { Learnings } from "@/components/results/Learnings";
import type { LearningsStrings } from "@/components/results/learningsStrings";
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
  learningsT,
  pending,
}: {
  scenario: OverviewScenario;
  locale: WheelLocale;
  familyLabels: Record<WheelFamilyId, string>;
  parts: ResultsPartsStrings;
  t: OverviewStrings;
  cards: CardsStrings;
  learningsT: LearningsStrings;
  /** The organizer's "Pendiente en el panel" tile (its button does nothing on the board). */
  pending?: { title: string; text: string; action: string } | null;
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
        referencePinned={scenario.referencePinned}
        compare={{ closed: scenario.closed, t: cards }}
        pending={pending ? { ...pending, onOpen: () => {} } : null}
        familyLabels={familyLabels}
        parts={parts}
        t={t}
        onOpenSample={() => {}}
      />
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
      {/* "Aprendizajes": null while the invented cupping is open, as on the page. */}
      {scenario.learnings ? (
        <Learnings
          learnings={scenario.learnings}
          samples={scenario.samples}
          isGroup={scenario.ctx.isGroup}
          showMine
          viewerSent={scenario.samples.some((x) => x.myEvaluation.status === "submitted")}
          locale={locale}
          attributes={cards.attributes}
          defectTypes={t.defectTypes}
          t={learningsT}
        />
      ) : null}
    </div>
  );
}

/** The cap's one-line switch, shown both ways with the same invented cupping:
 *  the viewer has six sentences of their own and the section shows five. */
export function LearningsSwitchFixture({
  scenario,
  locale,
  labels,
  cards,
  t,
  learningsT,
}: {
  scenario: OverviewScenario;
  locale: WheelLocale;
  labels: { repeatedFirst: string; approved: string };
  cards: CardsStrings;
  t: OverviewStrings;
  learningsT: LearningsStrings;
}) {
  const one = (payload: OverviewScenario["learnings"], label: string, key: string) =>
    payload ? (
      <div data-learnings-order={key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.25 }}>{label}</p>
        <Learnings
          learnings={payload}
          samples={scenario.samples}
          isGroup={scenario.ctx.isGroup}
          showMine
          viewerSent={scenario.samples.some((x) => x.myEvaluation.status === "submitted")}
          locale={locale}
          attributes={cards.attributes}
          defectTypes={t.defectTypes}
          t={learningsT}
        />
      </div>
    ) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {one(scenario.learnings, labels.repeatedFirst, "repeated-first")}
      {one(scenario.learningsApprovedOrder, labels.approved, "approved")}
    </div>
  );
}
