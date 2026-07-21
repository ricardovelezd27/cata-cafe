interface SourceAttributionProps {
  lines: string[];
}

/**
 * Tiny presentational footer for third-party reference-dataset attribution.
 * Server-safe (no "use client") — rendered directly from RSC pages that
 * display numbers derived from lib/analytics/referenceSources.ts.
 */
export function SourceAttribution({ lines }: SourceAttributionProps) {
  if (lines.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5 px-1">
      {lines.map((line) => (
        <p key={line} className="text-[11px] text-brown-mid/70 leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}
