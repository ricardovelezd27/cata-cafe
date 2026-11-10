"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { localeSwitchHref } from "@/lib/localeSwitch";

/** Language switch that keeps the current page, query and hash (F-cuenta-3). */
export function LocaleSwitchLink({
  locale,
  className,
  children,
}: {
  locale: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const target = locale === "es" ? "en" : "es";
  // Query and hash only exist in the browser; the base href (no query) is the
  // server-rendered fallback for middle-click / no-JS.
  const baseHref = localeSwitchHref(pathname, "", "", target);

  return (
    <a
      href={baseHref}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        router.push(
          localeSwitchHref(pathname, window.location.search, window.location.hash, target),
        );
      }}
    >
      {children}
    </a>
  );
}
