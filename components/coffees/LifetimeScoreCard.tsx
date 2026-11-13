import { Badge } from "@/components/ui";
import type { LifetimeLines } from "@/lib/coffeeLifetimeLines";

/**
 * The plain-language lines under a coffee's lifetime score (S10 WP1c). Pure
 * presentation of `buildLifetimeLines`; the headline number itself is the
 * StatCard on the coffee page. No hooks, no client state.
 * TODO(kim-validar:A2)
 */
export function LifetimeScoreCard({ title, lines }: { title: string; lines: LifetimeLines }) {
  return (
    <section
      aria-label={title}
      className="col-span-2 flex flex-col gap-1.5 rounded-card border border-outline-variant bg-surface-container-lowest p-4 text-sm text-on-surface xl:col-span-4"
    >
      {lines.roundingNote && <p className="text-xs text-on-surface-variant">{lines.roundingNote}</p>}
      {lines.accumulated && <p className="font-semibold">{lines.accumulated}</p>}
      {lines.arithmetic && <p className="text-on-surface-variant">{lines.arithmetic}</p>}
      {lines.tally && <p>{lines.tally}</p>}
      {lines.byType && <p className="text-on-surface-variant">{lines.byType}</p>}
      {lines.nonUniform && <p className="text-on-surface-variant">{lines.nonUniform}</p>}
      {lines.indicative && (
        <p className="flex flex-wrap items-center gap-2 text-on-surface-variant">
          <Badge tone="accent" size="xs">
            {lines.indicative.badge}
          </Badge>
          {lines.indicative.note}
        </p>
      )}
      {lines.anchorNote && <p className="text-on-surface-variant">{lines.anchorNote}</p>}
      {lines.noBase && <p className="text-on-surface-variant">{lines.noBase}</p>}
      <p className="text-xs text-on-surface-variant">{lines.note}</p>
    </section>
  );
}
