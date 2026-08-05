import type { LucideIcon } from "lucide-react";
import { Home, Clipboard, Coffee, Users, User, BarChart3 } from "lucide-react";

/**
 * Keys into the `nav` i18n namespace (messages/{es,en}.json) that label a
 * primary nav destination. Kept separate from the full `nav` namespace
 * (which also has logout/signin/switchAccount — non-item strings).
 */
export type NavItemKey = "home" | "sessions" | "coffees" | "groups" | "profile" | "insights";

export interface NavItem {
  href: string;
  icon: LucideIcon;
  i18nKey: NavItemKey;
  exact?: boolean;
  /** Renders a visual divider ABOVE this item in the Sidebar — separates the
   *  personal group (Inicio, Perfil) from the work group (Sesiones, Cafés, Grupos). */
  startsGroup?: boolean;
}

/** Shared translations shape passed down from app/[locale]/app/layout.tsx (server) to
 * Sidebar / TopBar / BottomNav (client components — never call useTranslations directly). */
export interface NavTranslations {
  nav: {
    home: string;
    sessions: string;
    coffees: string;
    groups: string;
    profile: string;
    insights: string;
    switchAccount: string;
    logout: string;
  };
  brand: {
    name: string;
    tagline: string;
  };
}

/** Primary nav destinations, shared by Sidebar and BottomNav.
 *  Order is deliberate: personal (Inicio, Perfil) first, then the work group. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/app", icon: Home, i18nKey: "home", exact: true },
  { href: "/app/profile", icon: User, i18nKey: "profile" },
  { href: "/app/sessions", icon: Clipboard, i18nKey: "sessions", startsGroup: true },
  { href: "/app/coffees", icon: Coffee, i18nKey: "coffees" },
  { href: "/app/groups", icon: Users, i18nKey: "groups" },
];

/** Appended conditionally when the current user has analytics access (see showInsights). */
export const INSIGHTS_ITEM: NavItem = {
  href: "/app/insights",
  icon: BarChart3,
  i18nKey: "insights",
};

export function isActive(pathname: string, locale: string, href: string, exact = false): boolean {
  const full = `/${locale}${href}`;
  return exact ? pathname === full : pathname.startsWith(full);
}
