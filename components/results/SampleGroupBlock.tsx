import type { ReactNode } from "react";
import { DotPlot, type DotPlotStrings } from "@/components/ui/DotPlot";
import { ScoreWithContext, type ScoreContextStrings } from "@/components/ui/ScoreWithContext";
import type { QualityRow } from "@/lib/reports/coffeeCards";
import { QUALITY_SCALE } from "@/lib/resultsScales";
import type { ScoreContext } from "@/lib/scoreContext";

/**
 * "El grupo en este café", inside a coffee's drill-down, in the viewer's own
 * lens. It carries what the table of 17 columns and the radar cards carried
 * about the GROUP and the cards do not: the group's score with its context,
 * how it was calculated, the declared partial evaluations in its averages,
 * the viewer's own difference against the reference, and the group's value
 * per quality attribute beside the viewer's on ONE fixed scale (1 to 9).
 *
 * It decides nothing: `context` is the card's own (`coffeeCards`), `quality`
 * is `qualityRows` (the group's value only under the page's gate and from two
 * included cuppers), and the caller renders it only where the viewer may read
 * the group's results. Until package R3 builds the coffee's sheet.
 */
export function SampleGroupBlock({
  title,
  context,
  scoreStrings,
  partialLine,
  ownDeltaLine,
  breakdown,
  quality,
}: {
  title: string;
  /** The group's score and what is said beside it. */
  context: ScoreContext;
  scoreStrings: ScoreContextStrings;
  /** "Incluye n evaluaciones parciales…", already filled; null when there is none. */
  partialLine: string | null;
  /** "Tu puntaje frente a la referencia: +1.25", already filled; null when it does not apply. */
  ownDeltaLine: string | null;
  /** "¿Cómo se calculó?" of the group's score. */
  breakdown: ReactNode;
  /** The eight quality attributes, mine beside the group's; null when another
   *  part of the drill-down already shows them, or there is nothing to show. */
  quality: { title: string; rows: QualityRow[]; labels: Record<string, string>; strings: DotPlotStrings } | null;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-outline-variant bg-surface-container-lowest p-4">
      <h3 className="text-[17.5px] leading-tight">{title}</h3>
      <ScoreWithContext context={context} strings={scoreStrings} size="md" />
      {ownDeltaLine ? <p className="m-0 text-[12.25px] text-on-surface-variant">{ownDeltaLine}</p> : null}
      {partialLine ? <p className="m-0 text-[12.25px] text-on-surface-variant">{partialLine}</p> : null}
      {breakdown}
      {quality ? (
        <div className="flex flex-col gap-2 border-t border-outline-variant pt-3">
          <h4 className="text-[14px] font-sans font-semibold leading-tight">{quality.title}</h4>
          <DotPlot
            scale={QUALITY_SCALE}
            items={quality.rows.map((row) => ({
              id: row.id,
              label: quality.labels[row.id] ?? row.id,
              mine: row.mine,
              group: row.group,
            }))}
            strings={quality.strings}
            ariaLabel={quality.title}
          />
        </div>
      ) : null}
    </section>
  );
}
