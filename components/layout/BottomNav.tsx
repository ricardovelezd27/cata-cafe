"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, INSIGHTS_ITEM, isActive, type NavTranslations } from "@/components/layout/navItems";

export default function BottomNav({
  locale,
  className = "",
  showInsights = false,
  translations,
}: {
  locale: string;
  className?: string;
  showInsights?: boolean;
  translations: NavTranslations;
}) {
  const pathname = usePathname();
  const tabs = showInsights ? [...NAV_ITEMS, INSIGHTS_ITEM] : NAV_ITEMS;

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-surface-container-lowest border-t border-outline-variant pb-safe ${className}`}
    >
      <div className="flex">
        {tabs.map(({ href, icon: Icon, i18nKey, exact }) => {
          const active = isActive(pathname, locale, href, exact);
          return (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors ${
                active ? "text-primary-container" : "text-on-surface-variant"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              {translations.nav[i18nKey]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
