"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const base = `/${locale}/app/insights`;

  const tabs = [
    { href: base, label: labels.dashboard, exact: true },
    { href: `${base}/explorer`, label: labels.explorer, exact: false },
    { href: `${base}/benchmark`, label: labels.benchmark, exact: false },
    ...(isAiAdmin ? [{ href: `${base}/chat`, label: labels.chat, exact: false }] : []),
    ...(isSuperAdmin ? [{ href: `${base}/access`, label: labels.access, exact: false }] : []),
    ...(isSuperAdmin ? [{ href: `${base}/users`, label: labels.users, exact: false }] : []),
  ];

  return (
    <nav className="flex gap-1 border-b border-[#E8E0D0] mb-5 overflow-x-auto">
      {tabs.map(({ href, label, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              active
                ? "border-[#3D5A3E] text-[#3D5A3E] font-semibold"
                : "border-transparent text-brown-mid hover:text-brown-dark"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
