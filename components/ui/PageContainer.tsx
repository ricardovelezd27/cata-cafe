import type { ReactNode } from "react";

/**
 * The paper page frame (DESIGN.md "The page frame: `PageContainer` (rule)"; package P1 of the
 * 2026-11-15 audit, findings F-09 and F-10).
 *
 *   |<- margin ->|<--------------- wide: up to 1200 px --------------->|
 *   |            | PageHeader (title, back link, one action)            |
 *   |            | sections ...                                         |
 *   |            |<----- form: up to 640 px ----->|                     |
 *
 * - Three widths: `wide` 1200 px (lists, profiles, Insights), `form` 640 px (creating and
 *   editing), `narrow` 400 px (arrival cards).
 * - ONE alignment: the column starts at the frame's left edge at every width, so a form's
 *   content lines up under its page header and is never centred beside it.
 * - The outer margin is the frame's (16 px on a phone, 24 px from 768 px, 32 px from 1280 px):
 *   while a page is in the frame, the shell's own padding steps aside (`.app-main:has(...)`
 *   in app/globals.css) except at the bottom, which the phone's tab bar needs.
 * - The rhythm comes from `.paper-page`: page header to first section 24 / 32 px, section
 *   to section 32 / 40 px. No section sets its own margin or padding.
 */

export type PageWidth = "wide" | "form" | "narrow";

const COLUMN: Record<PageWidth, string> = {
  wide: "max-w-[1200px]",
  form: "max-w-[640px]",
  narrow: "max-w-[400px]",
};

export function PageContainer({
  width = "wide",
  children,
}: {
  width?: PageWidth;
  /** The page: its PageHeader first, then its sections. */
  children: ReactNode;
}) {
  return (
    <div className="paper-container">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className={`paper-page ${COLUMN[width]}`}>{children}</div>
      </div>
    </div>
  );
}
