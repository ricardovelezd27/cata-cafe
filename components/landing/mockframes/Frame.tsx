import type { ReactNode } from "react";

// Shared device-style frame for the stylized app recreations.
// Inner content is decorative (a "screenshot"), so it is aria-hidden;
// each frame gets a translated aria-label on the wrapper.
export default function Frame({
  ariaLabel,
  translucent = false,
  children,
}: {
  ariaLabel: string;
  /** When the frame overlaps a photo: frosted surface + deeper shadow so it reads as floating, not cut out. */
  translucent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={
        translucent
          ? "rounded-[1.75rem] border border-surface/40 bg-surface-container-lowest/80 p-1.5 shadow-[0_28px_60px_-24px_rgba(21,53,38,0.7)] backdrop-blur-md"
          : "rounded-[1.75rem] border border-outline-variant/60 bg-surface-container-lowest p-1.5 shadow-[0_16px_40px_-20px_rgba(31,27,25,0.25)]"
      }
    >
      <div
        aria-hidden="true"
        className={`rounded-[1.4rem] px-4 pb-5 pt-3 ${translucent ? "bg-surface/85" : "bg-surface"}`}
      >
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
