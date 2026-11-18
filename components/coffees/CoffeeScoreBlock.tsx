import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { textActionClasses } from "@/components/ui/TextAction";
import type { LifetimeLines } from "@/lib/coffeeLifetimeLines";
import { cardClasses } from "@/components/ui/cardRecipe";

/**
 * The coffee page's ONE score block (package S9 of the 2026-11-15 UI/UX audit, I-07).
 * It replaced three stat cards and the seven-line lifetime card: the number, what it
 * rests on, "Indicativo" when it applies, and the rest of the arithmetic on demand
 * (a native <details>, opened by a TextAction-styled summary; no client code).
 *
 * Pure presentation of `buildLifetimeLines` (S10 WP1c): nothing here computes, and
 * every line the card printed is still printed, in the same words. The score is a
 * number in ink (DESIGN.md "Data display"). TODO(kim-validar:A2)
 */
export function CoffeeScoreBlock({
  title,
  lines,
  showLines,
  counts,
  detailsLabel,
  children,
}: {
  /** The score's full name ("Puntaje Café Sensible (base CVA)"), said once on the page. */
  title: string;
  lines: LifetimeLines;
  /** False when no closed, revealed session of this coffee is visible: as before, only the number and the counts. */
  showLines: boolean;
  counts: { sessionsLabel: string; sessions: number; evaluationsLabel: string; evaluations: number };
  /** "¿Cómo se calculó?" */
  detailsLabel: string;
  /** More of what the number rests on, shown inside the disclosure (the latest evaluations). */
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      // P2c (D-07): the card recipe (no shadow); what it shows and where it sits are unchanged.
      className={`${cardClasses()} col-span-2 flex flex-col gap-1.5 xl:col-span-4`}
    >
      <span className="label-caps">{title}</span>
      <span className="mt-1 font-display text-4xl leading-none tabular-nums text-on-surface">
        {lines.headline ?? "—"}
      </span>
      {showLines && lines.accumulated && (
        <p className="max-w-[68ch] text-body text-on-surface-variant">{lines.accumulated}</p>
      )}
      {showLines && lines.indicative && (
        <p className="flex max-w-[68ch] flex-wrap items-center gap-2 text-caption text-on-surface-variant">
          <Badge tone="accent" size="xs">
            {lines.indicative.badge}
          </Badge>
          {lines.indicative.note}
        </p>
      )}
      {showLines && lines.noBase && <p className="max-w-[68ch] text-body text-on-surface-variant">{lines.noBase}</p>}

      <details className="group mt-1">
        <summary
          className={textActionClasses(
            "link",
            "w-fit cursor-pointer list-none justify-start [&::-webkit-details-marker]:hidden",
          )}
        >
          {detailsLabel}
          <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 flex max-w-[68ch] flex-col gap-1.5 text-caption text-on-surface">
          {showLines && lines.arithmetic && <p>{lines.arithmetic}</p>}
          {showLines && lines.roundingNote && (
            <p className="text-caption text-on-surface-variant">{lines.roundingNote}</p>
          )}
          {showLines && lines.tally && <p>{lines.tally}</p>}
          {showLines && lines.byType && <p className="text-on-surface-variant">{lines.byType}</p>}
          {showLines && lines.nonUniform && <p className="text-on-surface-variant">{lines.nonUniform}</p>}
          {showLines && lines.anchorNote && <p className="text-on-surface-variant">{lines.anchorNote}</p>}
          <p className="text-on-surface-variant tabular-nums">
            {counts.sessionsLabel} {counts.sessions} · {counts.evaluationsLabel} {counts.evaluations}
          </p>
          {showLines && <p className="text-caption text-on-surface-variant">{lines.note}</p>}
          {children}
        </div>
      </details>
    </section>
  );
}
