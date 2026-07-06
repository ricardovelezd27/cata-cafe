import type { InsightRow } from "@/lib/analytics/types";

interface DescriptorBarListProps {
  rows: InsightRow[];
  emptyLabel: string;
}

/**
 * Server-rendered horizontal bar list for top flavor descriptors — mirrors the
 * Bars pattern in components/results/DescriptorFrequency.tsx. Colors come from
 * the flavor wheel (InsightRow.color).
 */
export function DescriptorBarList({ rows, emptyLabel }: DescriptorBarListProps) {
  if (rows.length === 0) {
    return <div className="text-sm text-brown-mid py-6 text-center">{emptyLabel}</div>;
  }

  const max = Math.max(...rows.map((r) => r.value));

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-3">
          <span className="w-32 shrink-0 text-xs text-brown-dark truncate" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 h-4 bg-[#F5F0E6] rounded overflow-hidden">
            <div
              className="h-full rounded"
              style={{
                width: `${max > 0 ? Math.max(4, (r.value / max) * 100) : 0}%`,
                backgroundColor: r.color ?? "#3D5A3E",
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-brown-dark tabular-nums">
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}
