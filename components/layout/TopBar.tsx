"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TopBar({ locale }: { locale: string }) {
  const pathname = usePathname();
  const otherLocale = locale === "es" ? "en" : "es";
  const otherPath = pathname.replace(`/${locale}/`, `/${otherLocale}/`);

  return (
    <header className="h-14 flex items-center justify-between px-4 bg-[#FDFBF7] border-b border-[#E8E0D0] shrink-0 lg:hidden">
      <span className="font-serif text-base text-[#3D5A3E] leading-tight">
        Cata Café Sensible
      </span>
      <Link
        href={otherPath}
        className="text-xs text-brown-mid uppercase hover:text-brown-dark transition-colors"
      >
        {otherLocale}
      </Link>
    </header>
  );
}
