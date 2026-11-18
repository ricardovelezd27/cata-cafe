"use client";

import { usePathname } from "next/navigation";
import { isActive } from "@/components/layout/navItems";
import { RouteTabs } from "@/components/ui/RouteTabs";

interface InsightsTabsProps {
  locale: string;
  isSuperAdmin: boolean;
  isAiAdmin: boolean;
  labels: {
    dashboard: string;
    explorer: string;
    benchmark: string;
    chat: string;
    access: string;
    users: string;
    /** The row's name for a screen reader (optional; the layout can pass it). */
    nav?: string;
  };
}

export function InsightsTabs({ locale, isSuperAdmin, isAiAdmin, labels }: InsightsTabsProps) {
  const pathname = usePathname();
  // `path` is the locale-less route `isActive` compares (the default locale is
  // served unprefixed, so the full `href` never matched the pathname in Spanish: D-03).
  const path = "/app/insights";
  const base = `/${locale}${path}`;

  const tabs = [
    { href: base, path, label: labels.dashboard, exact: true },
    { href: `${base}/explorer`, path: `${path}/explorer`, label: labels.explorer, exact: false },
    { href: `${base}/benchmark`, path: `${path}/benchmark`, label: labels.benchmark, exact: false },
    ...(isAiAdmin ? [{ href: `${base}/chat`, path: `${path}/chat`, label: labels.chat, exact: false }] : []),
    ...(isSuperAdmin ? [{ href: `${base}/access`, path: `${path}/access`, label: labels.access, exact: false }] : []),
    ...(isSuperAdmin || isAiAdmin
      ? [{ href: `${base}/users`, path: `${path}/users`, label: labels.users, exact: false }]
      : []),
  ];

  return (
    <RouteTabs
      className="mb-5"
      ariaLabel={labels.nav}
      tabs={tabs.map(({ href, path: tabPath, label, exact }) => ({
        href,
        label,
        active: isActive(pathname, locale, tabPath, exact),
      }))}
    />
  );
}
