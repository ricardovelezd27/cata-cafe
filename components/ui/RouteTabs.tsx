"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { edgeHint, type EdgeHint } from "@/lib/viewAddress";

export type RouteTab = { href: string; label: string; active: boolean };

/**
 * THE route-level tabs (audit D-02, P5a): each tab is a LINK to its own page,
 * so it is not a tablist. The current one carries `aria-current="page"` and an
 * underline (never the action fill). When the row is wider than its box (a
 * phone), a fade at each edge that has more says so, and the current tab is
 * scrolled into view. Tabs INSIDE a page are `PillTabs`.
 */
export function RouteTabs({ tabs, ariaLabel, className = "" }: { tabs: RouteTab[]; ariaLabel?: string; className?: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState<EdgeHint>({ start: false, end: false });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const current = row.querySelector<HTMLElement>('[aria-current="page"]');
    if (current && row.scrollWidth > row.clientWidth) {
      row.scrollLeft = Math.max(0, current.offsetLeft - (row.clientWidth - current.offsetWidth) / 2);
    }
    const read = () => setHint(edgeHint(row.scrollLeft, row.scrollWidth, row.clientWidth));
    read();
    row.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(row);
    return () => {
      row.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, [tabs.length]);

  return (
    <nav aria-label={ariaLabel} className={`relative border-b border-outline-variant ${className}`}>
      <div ref={rowRef} className="flex gap-1 overflow-x-auto" data-route-tabs>
        {tabs.map(({ href, label, active }) => (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex min-h-[44px] shrink-0 items-center whitespace-nowrap border-b-2 px-4 text-caption transition-colors ${
              active
                ? "border-primary-container font-semibold text-on-surface"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      {hint.start ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface to-transparent" data-edge="start" />
      ) : null}
      {hint.end ? (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface to-transparent" data-edge="end" />
      ) : null}
    </nav>
  );
}
