"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive } from "@/components/layout/navItems";

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
    <nav className="flex gap-1 border-b border-outline-variant mb-5 overflow-x-auto">
      {tabs.map(({ href, path: tabPath, label, exact }) => {
        const active = isActive(pathname, locale, tabPath, exact);
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2.5 text-caption whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active
                ? "border-primary-container text-primary-container font-semibold"
                : "border-transparent text-on-surface-variant hover:text-on-surface"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
