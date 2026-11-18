import { stillFormation, type FormationKind } from "@/lib/canvas/shapes";

const TONE = {
  ink: "fill-primary-container",
  soft: "fill-primary-muted",
  accent: "fill-secondary",
} as const;

/**
 * A STILL formation of the landing's shapes, on paper (audit K-03): three
 * cupping bowls from above, the flavour wheel, or people gathering around a
 * table. Inline SVG in the paper ink (`primary-container`), a softer ink
 * (`primary-muted`) and the paper accent (`secondary`). No canvas, no script,
 * nothing that moves; decorative, so `aria-hidden`. The geometry is
 * lib/canvas/shapes.ts, the same numbers the landing's constellation uses.
 */
export function Formation({ kind, className = "" }: { kind: FormationKind; className?: string }) {
  const f = stillFormation(kind);
  return (
    <svg
      viewBox={`0 0 ${f.width} ${f.height}`}
      width={f.width}
      height={f.height}
      aria-hidden="true"
      focusable="false"
      data-formation={kind}
      className={className}
    >
      {f.dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} className={TONE[d.tone]} />
      ))}
    </svg>
  );
}
