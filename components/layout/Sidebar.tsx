"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Languages, UserCog } from "lucide-react";
import { signOut, switchAccount } from "@/app/actions/auth";
import { NAV_ITEMS, INSIGHTS_ITEM, isActive, type NavTranslations } from "@/components/layout/navItems";

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
  const otherPath = pathname.replace(`/${locale}/`, `/${otherLocale}/`);

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-surface-container border-r border-outline-variant h-full">
      <div className="h-14 flex items-center px-5 border-b border-outline-variant">
        <span className="font-display text-base text-primary-container leading-tight">
          {translations.brand.name}
        </span>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, i18nKey, exact, startsGroup }) => {
          const active = isActive(pathname, locale, href, exact);
          return (
            <div key={href}>
              {startsGroup && (
                <hr className="my-2 mx-5 border-t border-outline-variant" />
              )}
              <Link
                href={`/${locale}${href}`}
                className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-l-[3px] border-primary-container bg-primary-fixed text-primary-container font-semibold pl-[17px]"
                    : "border-l-[3px] border-transparent text-on-surface hover:bg-surface-container-high pl-[17px]"
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                {translations.nav[i18nKey]}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-outline-variant py-3 px-5 flex flex-col gap-1">
        <Link
          href={otherPath}
          className="flex items-center gap-3 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Languages size={18} strokeWidth={1.8} />
          {otherLocale.toUpperCase()}
        </Link>
        <form action={switchAccount.bind(null, locale)}>
          <button
            type="submit"
            className="flex items-center gap-3 py-2 text-sm text-on-surface-variant hover:text-on-surface transition-colors w-full text-left"
          >
            <UserCog size={18} strokeWidth={1.8} />
            {translations.nav.switchAccount}
          </button>
        </form>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-3 py-2 text-sm text-on-surface-variant hover:text-error transition-colors w-full text-left"
          >
            <LogOut size={18} strokeWidth={1.8} />
            {translations.nav.logout}
          </button>
        </form>
      </div>
    </aside>
  );
}
