// No "use client" on purpose (K-03): EmptyState has no state and no handler, so
// it renders where its caller renders. A server page's icon then reaches it as
// the real lucide element, and the shape can be read from it; across a
// server-to-client boundary the element would arrive without its identity.

import { isValidElement, type ReactNode } from "react";
import { Clipboard, Coffee, UserPlus, Users } from "lucide-react";
import type { FormationKind } from "@/lib/canvas/shapes";
import { Formation } from "./Formation";

/**
 * The shape an empty state draws (audit K-03), one per meaning:
 *   bowls      no sessions yet (cupping bowls from above): the sessions list, the dashboard
 *   wheel      no coffees yet (the flavour wheel)
 *   gathering  no groups, no people yet (people around a table)
 * A page may name it with `formation`; without it, it is read from the icon the
 * page already passes, so every existing call keeps working: a coffee cup or a
 * clipboard means sessions, people mean a group. Any other icon keeps the old
 * icon-in-a-circle; no icon, no picture (as before).
 */
function formationFor(icon: ReactNode): FormationKind | null {
  if (!isValidElement(icon)) return null;
  if (icon.type === Coffee || icon.type === Clipboard) return "bowls";
  if (icon.type === Users || icon.type === UserPlus) return "gathering";
  return null;
}

export function EmptyState({
  icon,
  formation,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  /** The still formation to draw; read from `icon` when absent. `false` keeps the icon. */
  formation?: FormationKind | false;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const kind = formation === false ? null : (formation ?? formationFor(icon));
  return (
    <div className="py-16 text-center">
      {kind ? (
        <div className="mx-auto mb-4 flex justify-center" data-empty-formation={kind}>
          <Formation kind={kind} />
        </div>
      ) : icon ? (
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-surface-container text-on-surface-variant">
          {icon}
        </div>
      ) : null}
      <h3 className="text-card">{title}</h3>
      {body && <p className="mx-auto mt-1 max-w-sm text-caption text-on-surface-variant">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
