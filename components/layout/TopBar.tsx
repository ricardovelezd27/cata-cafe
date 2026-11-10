"use client";

import { LocaleSwitchLink } from "@/components/layout/LocaleSwitchLink";
import type { NavTranslations } from "@/components/layout/navItems";

export default function TopBar({
  locale,
  translations,
}: {
  locale: string;
  translations: NavTranslations;
}) {
  const otherLocale = locale === "es" ? "en" : "es";

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-surface border-b border-outline-variant shrink-0 lg:hidden">
      <span className="font-display text-base text-primary-container leading-tight">
        {translations.brand.name}
      </span>
      <LocaleSwitchLink
        locale={locale}
        className="text-xs text-on-surface-variant uppercase hover:text-on-surface transition-colors"
      >
        {otherLocale}
      </LocaleSwitchLink>
    </header>
  );
}
