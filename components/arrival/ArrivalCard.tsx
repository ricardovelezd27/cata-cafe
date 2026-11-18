import type { ReactNode, Ref } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

/**
 * The ONE anatomy of an arrival card's content (package S8, audit D-11): every
 * state and every error of the arrival screens is drawn with it, so a refused
 * link, an expired link, "check your email" and a question all read the same
 * way and each ends in a next step.
 *
 *   (mark)                 one tone per meaning, with its own icon
 *   Title                  the page's h1 (or an h2 under it): what happened
 *   One or two sentences   what it means and what to do
 *   [the form, a notice]   optional
 *   [ Primary action ]     the next step; quieter actions under it
 *
 * Tones (the kit's `Notice` tones, so a meaning has one colour in the app):
 *   plain    a question or an ask (sign in, "¿Eres …?", "Vas a entrar como …")
 *   info     something was done and the person is told (check your email)
 *   warning  this link or this session no longer lets you in (expired, used,
 *            closed, entries closed, full, not valid): nobody's mistake
 *   error    something failed on our side and can be tried again
 * A tone is never colour alone: each has its icon, and the title says it.
 *
 * It draws only. Roles, live regions, focus targets and ids are passed in by
 * the screens exactly as they had them (`role`, `titleRef`, `titleId`).
 */
export type ArrivalTone = "plain" | "info" | "warning" | "error";

const MARK: Record<Exclude<ArrivalTone, "plain">, { box: string; icon: ReactNode }> = {
  info: { box: "bg-surface-container text-primary-container", icon: <Info size={18} aria-hidden /> },
  warning: { box: "bg-warning-container text-on-warning-container", icon: <AlertTriangle size={18} aria-hidden /> },
  error: { box: "bg-error-container text-on-error-container", icon: <AlertCircle size={18} aria-hidden /> },
};

/** The tone's mark alone, for a state that brings its own heading (`EmailSentState`). */
export function ArrivalMark({ tone, icon }: { tone: Exclude<ArrivalTone, "plain">; icon?: ReactNode }) {
  const mark = MARK[tone];
  return (
    <span
      aria-hidden="true"
      data-arrival-tone={tone}
      className={`inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full ${mark.box}`}
    >
      {icon ?? mark.icon}
    </span>
  );
}

export function ArrivalCard({
  tone = "plain",
  icon,
  title,
  titleAs: Title = "h1",
  titleRef,
  titleId,
  titleFocusable = false,
  lead,
  children,
  actions,
  role,
  className = "",
}: {
  tone?: ArrivalTone;
  /** Replaces the tone's icon (decorative). */
  icon?: ReactNode;
  title: ReactNode;
  /** `h1` for the page's own title; `h2` for a state under a page title. */
  titleAs?: "h1" | "h2";
  titleRef?: Ref<HTMLHeadingElement>;
  titleId?: string;
  /** The title is a programmatic focus target (`tabIndex={-1}`, no ring). */
  titleFocusable?: boolean;
  /** One or two sentences under the title. */
  lead?: ReactNode;
  children?: ReactNode;
  /** The next step first, then any quieter action. Stacked, full width. */
  actions?: ReactNode;
  /** `alert` / `status`, exactly as the screen announced the state before. */
  role?: "alert" | "status";
  className?: string;
}) {
  return (
    <div role={role} data-arrival-state={tone} className={`flex flex-col gap-[16px] ${className}`}>
      <div className="flex flex-col gap-[8px]">
        {tone !== "plain" ? <ArrivalMark tone={tone} icon={icon} /> : null}
        <Title
          id={titleId}
          ref={titleRef}
          tabIndex={titleFocusable ? -1 : undefined}
          className={`${Title === "h1" ? "page-title" : "text-card"} break-words ${titleFocusable ? "outline-none" : ""}`}
        >
          {title}
        </Title>
        {typeof lead === "string" ? (
          <p className="text-body text-on-surface-variant">{lead}</p>
        ) : lead ? (
          <div className="flex flex-col gap-[8px] text-body text-on-surface-variant">{lead}</div>
        ) : null}
      </div>
      {children}
      {actions ? (
        <div className="flex flex-col gap-[8px]" data-arrival-actions="">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
