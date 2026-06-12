import type { ReactNode } from "react";

// Shared device-style frame for the stylized app recreations.
// Inner content is decorative (a "screenshot"), so it is aria-hidden;
// each frame gets a translated aria-label on the wrapper.
export default function Frame({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="rounded-[1.75rem] border border-outline-variant/60 bg-surface-container-lowest p-1.5 shadow-[0_16px_40px_-20px_rgba(31,27,25,0.25)]"
    >
      <div aria-hidden="true" className="rounded-[1.4rem] bg-surface px-4 pb-5 pt-3">
        <div className="mb-3 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
          <span className="h-1.5 w-1.5 rounded-full bg-outline-variant" />
          <span className="h-1.5 w-8 rounded-full bg-outline-variant/60" />
        </div>
        {children}
      </div>
    </div>
  );
}
