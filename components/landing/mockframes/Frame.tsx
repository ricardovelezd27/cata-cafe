import type { ReactNode } from "react";

// Shared device-style frame for the stylized app recreations: always a SOLID
// surface (DESIGN.md "Stage and surfaces"), never glass. Inner content is
// decorative (a "screenshot"), so it is aria-hidden; each frame gets a
// translated aria-label on the wrapper.
export default function Frame({
  ariaLabel,
  tab,
  children,
}: {
  ariaLabel: string;
  /** Label on the top bar ("01 · Percibe"): stays readable when another
   *  screen is piled on top of this one. */
  tab?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="flex h-full flex-col rounded-device border border-outline-variant/60 bg-surface-container-lowest p-1.5 shadow-screen"
    >
      <div
        aria-hidden="true"
        className="flex-1 rounded-device-inner bg-surface px-4 pb-5 pt-3"
      >
        <div className="mb-3 flex h-4 items-center justify-between gap-3">
          {tab ? (
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-secondary">
              {tab}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
            <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
            <span className="h-1.5 w-8 rounded-full bg-outline-variant/60" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
