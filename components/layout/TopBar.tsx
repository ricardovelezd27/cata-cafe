"use client";

import { LocaleSwitchLink } from "@/components/layout/LocaleSwitchLink";
import type { NavTranslations } from "@/components/layout/navItems";
import { textActionClasses } from "@/components/ui/TextAction";
import { Wordmark, WORDMARK, WORDMARK_SUFFIX } from "@/components/brand/Wordmark";
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
      {/* The landing's wordmark, linking home (K-05); its name for a screen reader is the product's. */}
      <Wordmark href={`/${locale}/app`} label={`${translations.brand.name}, ${WORDMARK}${WORDMARK_SUFFIX}`} className="-ml-1" />
      <LocaleSwitchLink
        locale={locale}
        // A 44 px box (F-14); the negative margin keeps the label where it was.
        className={textActionClasses(
          "none",
          "label-caps -mr-[15px] hover:text-on-surface transition-colors",
        )}
      >
        {otherLocale}
      </LocaleSwitchLink>
    </header>
  );
}
