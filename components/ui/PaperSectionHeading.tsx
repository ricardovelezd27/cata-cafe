import type { ReactNode } from "react";

/**
 * How a section of a PAPER screen opens (DESIGN.md "`SectionHeading` (paper)";
 * package P2 of the 2026-11-15 audit, finding B-04).
 *
 *   SECTION NAME (uppercase label, on-surface-variant)        [action / info / count]
 *   Section title (section size, primary-container)
 *   Assertion line, optional (caption size, on-surface-variant)
 *
 * Named `PaperSectionHeading`, not `SectionHeading`, on purpose: the stage (the
 * landing) has its own `components/landing/SectionHeading.tsx`, centred, cream on
 * the dark ground. They are different things; the name says which mode this is,
 * and tests/p2aPrimitives.test.ts fails if either side imports the other's.
 *
 * - Left-aligned at every width (paper is read down a left edge).
 * - `level` is the heading's LEVEL (2 for a section, 3 for a title inside a card);
 *   the look follows the role: level 2 is the section heading (21 px, green, from
 *   `.section-title`), level 3 is the card heading (17.5 px, ink).
 * - Its gap to its content is `.paper-section-head` (12 px on a phone, 16 px from 768 px: the
 *   paper rhythm, app/globals.css), so no section sets its own; inside a `.paper-section`
 *   the section's own row gap takes over.
 */

/** The uppercase label role (11 px, the floor). Shared with `Card`'s eyebrow. */
// B-05 (P3b): the one label recipe, `.label-caps` (app/globals.css): 11 px, 600, capitals, 0.1em,
// on-surface-variant: the same paint as the class list it replaced.
export const LABEL_CLASSES = "label-caps";

export type PaperSectionHeadingProps = {
  /** The title (the section heading, or a card's title at level 3). */
  title: ReactNode;
  /** The section's small name above the title (uppercase label). */
  name?: ReactNode;
  /** One line under the title that says what the section claims or holds. */
  assertion?: ReactNode;
  /** 2 for a section of the page (default), 3 for a title inside a card. */
  level?: 2 | 3;
  /** At the right end of the first row: one action, a count, a link. */
  action?: ReactNode;
  /** An `InfoHint` (or another small explainer) right after the title. */
  info?: ReactNode;
  id?: string;
  /** Drop the gap under the heading (a card that lays out its own body). */
  flush?: boolean;
};

export function PaperSectionHeading({
  title,
  name,
  assertion,
  level = 2,
  action,
  info,
  id,
  flush = false,
}: PaperSectionHeadingProps) {
  const Tag = level === 3 ? "h3" : "h2";
  const titleClasses = level === 3 ? "text-card text-on-surface" : "section-title text-section";
  return (
    <div className={`flex items-start justify-between gap-3 ${flush ? "" : "paper-section-head"}`}>
      <div className="min-w-0 flex-1">
        {name && <p className={`${LABEL_CLASSES} mb-1`}>{name}</p>}
        <div className="flex items-center gap-1">
          <Tag id={id} className={`min-w-0 ${titleClasses}`}>
            {title}
          </Tag>
          {info}
        </div>
        {assertion && <p className="mt-1 text-caption text-on-surface-variant">{assertion}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
