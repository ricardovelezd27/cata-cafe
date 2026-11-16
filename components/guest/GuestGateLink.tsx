"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { isGuestAllowedPath, stripLocale } from "@/lib/guestScope";
import { useGuestGate } from "./GuestGateProvider";

/**
 * Drop-in replacement for `next/link` on any link that a GUEST-reachable page
 * points at a guest-GATED destination (Cafés, Grupos, Insights, the new-session
 * wizard, coffee detail…). For registered users it renders exactly the plain
 * <Link>; for an anonymous guest it renders a same-looking <button> that opens
 * the "finish creating your account" modal instead of navigating — so the nav
 * and pages look identical for everyone and only the access differs.
 *
 * Gating uses the same `isGuestAllowedPath` predicate as proxy.ts, so the
 * client and the server gate can never disagree.
 */
export function GuestGateLink({
  href,
  className,
  children,
  prefetch,
  title,
  "aria-label": ariaLabel,
  "aria-current": ariaCurrent,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
  title?: string;
  "aria-label"?: string;
  "aria-current"?: "page";
}) {
  const { isGuest, openGate } = useGuestGate();
  const inner = stripLocale(href.split(/[?#]/)[0]);
  const gated = isGuest && inner.startsWith("/app") && !isGuestAllowedPath(inner);

  if (gated) {
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-label={ariaLabel}
        aria-current={ariaCurrent}
        onClick={() => openGate(href)}
      >
        {children}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={className}
      prefetch={prefetch}
      title={title}
      aria-label={ariaLabel}
      aria-current={ariaCurrent}
    >
      {children}
    </Link>
  );
}
