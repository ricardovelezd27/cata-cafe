import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ComponentProps } from "react";

/**
 * A small action that reads as a link ("Ver todas", "Editar muestra",
 * "Omitir introducción", the language switch): the text stays small, the box
 * around it is 44 px painted (DESIGN.md "Interactive control vocabulary").
 * It replaces bare text links and icon buttons under 44 px.
 *
 * `tone` picks the text: `link` (the green, bold, underline-on-hover action
 * link), `quiet` (the muted one that darkens on hover) or `none` (the caller's
 * `className` carries the text style, for a call site whose look must not
 * change). The box never adds padding to the text's own line, so a short label
 * ("EN") gets a 44 x 44 box and a long one a 44 px tall box as wide as it is.
 * In a dense row the caller adds `-my-[15px]` so the row keeps its height while
 * the box still paints 44 px. No hooks: usable from server and client code.
 */
export type TextActionTone = "link" | "quiet" | "none";

const BOX = "inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1";

const TONE: Record<TextActionTone, string> = {
  link: "text-caption font-semibold text-primary-container hover:underline active:underline",
  quiet: "text-caption text-on-surface-variant transition-colors hover:text-on-surface active:text-on-surface",
  none: "",
};

/** Class string of a TextAction, for wrappers that render their own element
 *  (a `GuestGateLink`, the locale switch's anchor). */
export function textActionClasses(tone: TextActionTone = "link", className = ""): string {
  return `${BOX} ${TONE[tone]} ${className}`.trim();
}

export interface TextActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: TextActionTone;
}

/** A TextAction that performs an action (a button). */
export function TextAction({ tone = "link", className = "", type = "button", ...props }: TextActionProps) {
  return <button type={type} className={textActionClasses(tone, className)} {...props} />;
}

export type TextActionLinkProps = Omit<ComponentProps<typeof Link>, "className"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    tone?: TextActionTone;
    className?: string;
  };

/** A TextAction that goes somewhere (a Next.js link). */
export function TextActionLink({ tone = "link", className = "", ...props }: TextActionLinkProps) {
  return <Link className={textActionClasses(tone, className)} {...props} />;
}
