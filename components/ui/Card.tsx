"use client";

import { createContext, useContext, type MouseEventHandler, type ReactNode } from "react";
import Link from "next/link";
import { LABEL_CLASSES } from "./PaperSectionHeading";
import { CARD_FRAME, CARD_INTERACTIVE, CARD_PADDING, CARD_TONE, cardClasses, type CardPadding, type CardTone } from "./cardRecipe";

/**
 * The paper card (DESIGN.md "`Card` and `Notice`"; package P2 of the 2026-11-15
 * audit, finding D-07). One anatomy for every card:
 *
 *   +------------------------------------------------+  rounded-card, 1 px outline-variant, no shadow
 *   | EYEBROW (optional)               [action slot] |
 *   | Title                                          |
 *   | children                                       |
 *   | ---------------------------------------------- |  optional footer on a hairline
 *   | footer                                         |
 *   +------------------------------------------------+
 *
 * - `tone`: default `surface-container-lowest`, quiet `surface-container-low`,
 *   selected `primary-fixed`. Never a shadow, never a terracotta ground.
 * - `padding`: "regular" is the paper rhythm (16 px on a phone, 20 px from 768 px);
 *   "compact" stays 16 px; "row" is the rhythm's row in a list (12 x 16 px), for a
 *   list whose items are cards (a session, a coffee).
 * - Interactive: give it `href` (a real link) or `onClick` (a real button). The
 *   whole card is then the control, with the base focus ring (T6) and a
 *   `surface-container-high` hover. An interactive card takes no `action` (a
 *   control inside a control): the types refuse it.
 * - No nesting: a Card inside a Card renders its content WITHOUT a second frame
 *   (and says so in development). Cards do not nest.
 * - `stat`: a stat card is capped at 240 px wide.
 * - `className` is for placing the card in its layout (a grid span), not for
 *   painting it.
 * - `cardClasses()` gives the same recipe to a wrapper that must render its own
 *   element (GuestGateLink: a link for members, a button for guests), as
 *   `buttonClasses()` does for buttons.
 */

const InsideCard = createContext(false);

export type { CardTone, CardPadding };
// The recipe lives in a plain module so a server component can call cardClasses().
export { cardClasses };

type CardBase = {
  as?: "div" | "section" | "article" | "li";
  tone?: CardTone;
  padding?: CardPadding;
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** The title's heading level; 3 by default (a card heading). */
  titleLevel?: 2 | 3 | 4;
  footer?: ReactNode;
  stat?: boolean;
  className?: string;
  children?: ReactNode;
};
type StaticCard = CardBase & { action?: ReactNode; href?: never; onClick?: never };
type LinkCard = CardBase & { href: string; prefetch?: boolean; action?: never; onClick?: never };
type ButtonCard = CardBase & {
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  action?: never;
  href?: never;
};
export type CardProps = StaticCard | LinkCard | ButtonCard;

const TONE = CARD_TONE;
const PADDING = CARD_PADDING;
const FRAME = CARD_FRAME;
const INTERACTIVE = CARD_INTERACTIVE;

export function Card(props: CardProps) {
  const nested = useContext(InsideCard);
  const {
    as = "div",
    tone = "default",
    padding = "regular",
    eyebrow,
    title,
    titleLevel = 3,
    footer,
    stat = false,
    className = "",
    children,
  } = props;
  const action = "action" in props ? props.action : undefined;
  const Tag = as;
  const Heading = titleLevel === 2 ? "h2" : titleLevel === 4 ? "h4" : "h3";

  const header =
    eyebrow || title || action ? (
      <div className={`flex items-start justify-between gap-3 ${children ? "mb-[12px]" : ""}`}>
        <div className="min-w-0 flex-1">
          {eyebrow && <p className={`${LABEL_CLASSES} ${title ? "mb-1" : ""}`}>{eyebrow}</p>}
          {title && <Heading className="text-card text-on-surface">{title}</Heading>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    ) : null;
  const body = (
    <>
      {header}
      {children}
      {footer && <div className="mt-[16px] border-t border-outline-variant pt-[12px]">{footer}</div>}
    </>
  );

  if (nested) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Card: a Card inside a Card renders without its frame. Cards do not nest (DESIGN.md).");
    }
    return <Tag className={className || undefined}>{body}</Tag>;
  }

  const frame = `${FRAME} ${TONE[tone]} ${PADDING[padding]} ${stat ? "max-w-[240px]" : ""}`;

  if ("href" in props && props.href) {
    const link = (
      <Link href={props.href} prefetch={props.prefetch} className={`${frame} ${INTERACTIVE} ${as === "li" ? "" : className}`}>
        {body}
      </Link>
    );
    return <InsideCard.Provider value>{as === "li" ? <li className={className || undefined}>{link}</li> : link}</InsideCard.Provider>;
  }
  if ("onClick" in props && props.onClick) {
    const button = (
      <button
        type="button"
        onClick={props.onClick}
        disabled={props.disabled}
        // A <button> centres its content when a grid stretches it: start at the top instead.
        className={`${frame} ${INTERACTIVE} flex flex-col justify-start ${as === "li" ? "" : className}`}
      >
        {body}
      </button>
    );
    return <InsideCard.Provider value>{as === "li" ? <li className={className || undefined}>{button}</li> : button}</InsideCard.Provider>;
  }
  return (
    <InsideCard.Provider value>
      <Tag className={`${frame} ${className}`}>{body}</Tag>
    </InsideCard.Provider>
  );
}
