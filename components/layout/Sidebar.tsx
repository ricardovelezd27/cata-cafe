"use client";

import { LocaleSwitchLink } from "@/components/layout/LocaleSwitchLink";
import { GuestGateLink } from "@/components/guest/GuestGateLink";
import { usePathname } from "next/navigation";
import { LogOut, Languages, UserCog } from "lucide-react";
import { SignOutButton } from "@/components/layout/SignOutButton";
import { NAV_ITEMS, INSIGHTS_ITEM, isActive, type NavTranslations } from "@/components/layout/navItems";
import { useShellCovered } from "@/hooks/useShellLayer";

export default function Sidebar({
  locale,
  showInsights = false,
  translations,
}: {
  locale: string;
  showInsights?: boolean;
  translations: NavTranslations;
}) {
  const pathname = usePathname();
  const navItems = showInsights ? [...NAV_ITEMS, INSIGHTS_ITEM] : NAV_ITEMS;
  const otherLocale = locale === "es" ? "en" : "es";
  // Inert while the full-screen cupping layer covers the shell (H-03).
  const covered = useShellCovered();

  return (
    <aside
      inert={covered}
      className="hidden lg:flex flex-col w-60 shrink-0 bg-surface-container border-r border-outline-variant h-full"
    >
      <div className="h-14 flex items-center px-5 border-b border-outline-variant">
        <span className="font-display text-body text-primary-container leading-tight">
          {translations.brand.name}
        </span>
      </div>

      <nav aria-label={translations.nav.mainNavLabel} className="flex-1 py-3 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, i18nKey, exact, startsGroup }) => {
          const active = isActive(pathname, locale, href, exact);
          return (
            <div key={href}>
              {startsGroup && (
                <hr className="my-2 mx-5 border-t border-outline-variant" />
              )}
              <GuestGateLink
                href={`/${locale}${href}`}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] items-center gap-3 px-5 py-2.5 text-caption transition-colors ${
                  active
                    ? "border-l-[3px] border-primary-container bg-primary-fixed text-primary-container font-semibold pl-[17px]"
                    : "border-l-[3px] border-transparent text-on-surface hover:bg-surface-container-high pl-[17px]"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                {translations.nav[i18nKey]}
              </GuestGateLink>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-outline-variant py-3 px-5 flex flex-col gap-1">
        <LocaleSwitchLink
          locale={locale}
          className="flex min-h-[44px] items-center gap-3 py-2 text-caption text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Languages size={18} strokeWidth={1.8} />
          {otherLocale.toUpperCase()}
        </LocaleSwitchLink>
        <SignOutButton
          mode="switchAccount"
          locale={locale}
          className="flex min-h-[44px] items-center gap-3 py-2 text-caption text-on-surface-variant hover:text-on-surface transition-colors w-full text-left"
        >
          <UserCog size={18} strokeWidth={1.8} />
          {translations.nav.switchAccount}
        </SignOutButton>
        <SignOutButton
          mode="signOut"
          locale={locale}
          className="flex min-h-[44px] items-center gap-3 py-2 text-caption text-on-surface-variant hover:text-error transition-colors w-full text-left"
        >
          <LogOut size={18} strokeWidth={1.8} />
          {translations.nav.logout}
        </SignOutButton>
      </div>
    </aside>
  );
}
