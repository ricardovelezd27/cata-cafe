"use client";

import { LocaleSwitchLink } from "@/components/layout/LocaleSwitchLink";
import type { NavTranslations } from "@/components/layout/navItems";
import { textActionClasses } from "@/components/ui/TextAction";
import { useShellCovered } from "@/hooks/useShellLayer";

export default function TopBar({
  locale,
  translations,
}: {
  locale: string;
  translations: NavTranslations;
}) {
  const otherLocale = locale === "es" ? "en" : "es";
  // Inert while the full-screen cupping layer covers the shell (H-03).
  const covered = useShellCovered();

  return (
    <header
      inert={covered}
      className="h-14 flex items-center justify-between px-4 bg-surface border-b border-outline-variant shrink-0 lg:hidden"
    >
      <span className="font-display text-base text-primary-container leading-tight">
        {translations.brand.name}
      </span>
      <LocaleSwitchLink
        locale={locale}
        // A 44 px box (F-14); the negative margin keeps the label where it was.
        className={textActionClasses(
          "none",
          "-mr-[15px] text-xs text-on-surface-variant uppercase hover:text-on-surface transition-colors",
        )}
      >
        {otherLocale}
      </LocaleSwitchLink>
    </header>
  );
}
