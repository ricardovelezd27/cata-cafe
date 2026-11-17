"use client";

import { SessionOverview } from "@/components/results/SessionOverview";
import type { OverviewStrings } from "@/components/results/overviewStrings";
import type { ResultsPartsStrings } from "@/components/results/partsStrings";
import type { OverviewScenario } from "@/lib/dev/overviewFixtures";
import type { WheelFamilyId } from "@/lib/flavorWheel";

/** One invented cupping drawn with the real overview. Opening a coffee does
 *  nothing here: the board has no coffee sheet. */
export function OverviewFixture({
  scenario,
  familyLabels,
  parts,
  t,
}: {
  scenario: OverviewScenario;
  familyLabels: Record<WheelFamilyId, string>;
  parts: ResultsPartsStrings;
  t: OverviewStrings;
}) {
  return (
    <SessionOverview
      samples={scenario.samples}
      ctx={scenario.ctx}
      referenceId={scenario.referenceId}
      data={scenario.data}
      myAlignment={scenario.myAlignment}
      preliminary={scenario.preliminary}
      referencePinned={scenario.referencePinned}
      familyLabels={familyLabels}
      parts={parts}
      t={t}
      onOpenSample={() => {}}
    />
  );
}
