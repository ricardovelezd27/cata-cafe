"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Clipboard, Coffee, Users, User } from "lucide-react";

const TABS = [
  { href: "/app", icon: Home, label: "Inicio", exact: true },
  { href: "/app/sessions", icon: Clipboard, label: "Sesiones", exact: false },
  { href: "/app/coffees", icon: Coffee, label: "Cafés", exact: false },
  { href: "/app/team", icon: Users, label: "Catadores", exact: false },
  { href: "/app/profile", icon: User, label: "Perfil", exact: false },
];

export default function BottomNav({
  locale,
  className = "",
}: {
  locale: string;
  className?: string;
}) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    const full = `/${locale}${href}`;
    return exact ? pathname === full : pathname.startsWith(full);
  }

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 bg-white border-t border-[#E8E0D0] pb-safe ${className}`}
    >
      <div className="flex">
        {TABS.map(({ href, icon: Icon, label, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-xs transition-colors ${
                active ? "text-[#3D5A3E]" : "text-brown-mid"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
