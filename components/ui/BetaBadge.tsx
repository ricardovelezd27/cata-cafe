/**
 * Small uppercase mono pill used to flag sections that are not fully wired
 * up yet (Extrinsic / Physical evaluation). Visibility-only marker — does
 * not gate any functionality.
 */
export function BetaBadge({ label = "Beta" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-secondary px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-secondary bg-surface-container">
      {label}
    </span>
  );
}
