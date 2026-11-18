"use client";

import { useRef, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";

/**
 * A sentence that tells the person something about the screen (DESIGN.md "A notice
 * is not a card"; package P2 of the 2026-11-15 audit, finding E-05).
 *
 *   [icon]  One sentence that says what happened.        [one optional action]  [x]
 *
 * - `tone`: info `surface-container`, warning `warning-container`, error
 *   `error-container`. Never terracotta: the accent is not a notice colour.
 * - Never colour alone: every tone has its own icon, and `label` adds a word
 *   ("Aviso", "Error") in front of the sentence where the icon is not enough.
 * - Role: an error is `alert` (read out at once); info and warning are `status`
 *   (read out politely). `live={false}` drops the role for a notice that is part
 *   of the page from the start and must not be announced as news.
 * - `onDismiss` adds a 44 px close button; its name (`dismissLabel`) is required.
 *   Closing moves the focus to the next control of the page (or the previous one),
 *   so a keyboard user is never dropped on <body> when the notice disappears.
 */

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** The control a keyboard user lands on once `root` is gone: the next one, else the previous one. */
function focusAfter(root: HTMLElement): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => !root.contains(el) && el.getClientRects().length > 0,
  );
  const next = all.find((el) => root.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (next) return next;
  return [...all].reverse().find((el) => root.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) ?? null;
}

export type NoticeTone = "info" | "warning" | "error";

type NoticeBase = {
  tone?: NoticeTone;
  children: ReactNode;
  /** A word before the sentence (bold), e.g. "Aviso". */
  label?: ReactNode;
  /** Replaces the tone's icon (decorative: it is hidden from screen readers). */
  icon?: ReactNode;
  /** One optional action: a `Button size="sm"` or a `TextAction`. */
  action?: ReactNode;
  live?: boolean;
  className?: string;
};
type Dismissible = { onDismiss: () => void; dismissLabel: string };
type Fixed = { onDismiss?: never; dismissLabel?: never };
export type NoticeProps = NoticeBase & (Dismissible | Fixed);

const TONE: Record<NoticeTone, string> = {
  info: "bg-surface-container text-on-surface",
  warning: "bg-warning-container text-on-warning-container",
  error: "bg-error-container text-on-error-container",
};
const ICON: Record<NoticeTone, ReactNode> = {
  info: <Info size={18} aria-hidden />,
  warning: <AlertTriangle size={18} aria-hidden />,
  error: <AlertCircle size={18} aria-hidden />,
};

export function Notice({
  tone = "info",
  children,
  label,
  icon,
  action,
  live = true,
  className = "",
  onDismiss,
  dismissLabel,
}: NoticeProps) {
  const role = !live ? undefined : tone === "error" ? "alert" : "status";
  const rootRef = useRef<HTMLDivElement>(null);
  const dismiss = () => {
    const target = rootRef.current ? focusAfter(rootRef.current) : null;
    onDismiss?.();
    if (target) requestAnimationFrame(() => target.isConnected && target.focus());
  };
  return (
    <div ref={rootRef} role={role} className={`flex items-start gap-3 rounded-card px-[16px] py-[12px] text-body ${TONE[tone]} ${className}`}>
      {/* The icon and the sentence are one block (the icon on the first line); the action
          sits beside that block, centred on it, or wraps under it on a narrow screen. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-[200px] items-start gap-3">
          <span className="mt-[3px] shrink-0" aria-hidden>
            {icon ?? ICON[tone]}
          </span>
          <p className="min-w-0 flex-1">
            {label && <strong className="font-semibold">{label} </strong>}
            {children}
          </p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={dismiss}
          aria-label={dismissLabel}
          className="-my-[10px] -mr-[8px] inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-pill transition-opacity hover:opacity-70"
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}
