"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clipboard, Coffee, Users, User, LogOut, Languages, BarChart3 } from "lucide-react";
import { signOut } from "@/app/actions/auth";

const NAV_ITEMS = [
  { href: "/app", icon: Home, label: "Inicio", exact: true },
  { href: "/app/sessions", icon: Clipboard, label: "Sesiones", exact: false },
  { href: "/app/coffees", icon: Coffee, label: "Cafés", exact: false },
  { href: "/app/team", icon: Users, label: "Catadores", exact: false },
  { href: "/app/profile", icon: User, label: "Perfil", exact: false },
];

const INSIGHTS_ITEM = { href: "/app/insights", icon: BarChart3, label: "Análisis", exact: false };

export default function Sidebar({
  locale,
  showInsights = false,
}: {
  locale: string;
  showInsights?: boolean;
}) {
  const pathname = usePathname();
  const navItems = showInsights ? [...NAV_ITEMS, INSIGHTS_ITEM] : NAV_ITEMS;
  const otherLocale = locale === "es" ? "en" : "es";
  const otherPath = pathname.replace(`/${locale}/`, `/${otherLocale}/`);

  function isActive(href: string, exact: boolean) {
    const full = `/${locale}${href}`;
    return exact ? pathname === full : pathname.startsWith(full);
  }

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-[#F5F0E6] border-r border-[#E8E0D0] h-full">
      <div className="h-14 flex items-center px-5 border-b border-[#E8E0D0]">
        <span className="font-serif text-base text-[#3D5A3E] leading-tight">
          Cata Café Sensible
        </span>
      </div>

      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                active
                  ? "border-l-[3px] border-[#3D5A3E] bg-[#E8F0E8] text-[#3D5A3E] font-semibold pl-[17px]"
                  : "border-l-[3px] border-transparent text-brown-dark hover:bg-[#EDE8DB] pl-[17px]"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[#E8E0D0] py-3 px-5 flex flex-col gap-1">
        <Link
          href={otherPath}
          className="flex items-center gap-3 py-2 text-sm text-brown-mid hover:text-brown-dark transition-colors"
        >
          <Languages size={18} strokeWidth={1.8} />
          {otherLocale.toUpperCase()}
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex items-center gap-3 py-2 text-sm text-brown-mid hover:text-red-defect transition-colors w-full text-left"
          >
            <LogOut size={18} strokeWidth={1.8} />
            Salir
          </button>
        </form>
      </div>
    </aside>
  );
}
