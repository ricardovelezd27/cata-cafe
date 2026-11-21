"use client";

import { GuestGateLink } from "@/components/guest/GuestGateLink";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive, type NavTranslations } from "@/components/layout/navItems";
import { useShellCovered } from "@/hooks/useShellLayer";

export default function BottomNav({
  locale,
  className = "",
  translations,
}: {
  locale: string;
  className?: string;
  translations: NavTranslations;
}) {
  const pathname = usePathname();
  // Six tabs at most (DESIGN.md "Breakpoint rule", F-14): Insights is reached
  // from Perfil on phones; the sidebar keeps its item.
  const tabs = NAV_ITEMS;
  // Inert while the full-screen cupping layer covers the shell (H-03).
  const covered = useShellCovered();

  return (
    <nav
      aria-label={translations.nav.mainNavLabel}
      inert={covered}
      className={`fixed bottom-0 left-0 right-0 bg-surface-container-lowest pb-safe ${className}`}
    >
      {/* border-t lives on the fixed-height row (border-box) so the nav's
          total height is exactly var(--bottom-nav-height) + safe-area. */}
      <div className="flex h-[var(--bottom-nav-height)] border-t border-outline-variant">
        {tabs.map(({ href, icon: Icon, i18nKey, exact }) => {
          const active = isActive(pathname, locale, href, exact);
          return (
            <GuestGateLink
              key={href}
              href={`/${locale}${href}`}
              aria-current={active ? "page" : undefined}
              // Labels paint 12 px (F-14); the active tab is marked by weight and a
              // bar along its top edge, not by colour alone.
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 text-caption transition-colors ${
                active
                  ? "font-semibold text-primary-container before:absolute before:inset-x-3 before:top-0 before:h-[3px] before:rounded-b-pill before:bg-primary-container before:content-['']"
                  : "text-on-surface-variant"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              {translations.nav[i18nKey]}
            </GuestGateLink>
          );
        })}
      </div>
    </nav>
  );
}
