/**
 * Small uppercase mono pill used to flag sections that are not fully wired
 * up yet (Extrinsic / Physical evaluation). Visibility-only marker — does
 * not gate any functionality.
 */
export function BetaBadge({ label = "Beta" }: { label?: string }) {
  return (
    <span className="label-caps inline-flex items-center rounded-pill border border-secondary px-2 py-0.5 text-secondary bg-surface-container">
      {label}
    </span>
  );
}
