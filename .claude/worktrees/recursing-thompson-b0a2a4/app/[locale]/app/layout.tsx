import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import type { ReactNode } from "react";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("nav");
  const otherLocale = locale === "es" ? "en" : "es";

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-brown-light bg-[#FDFBF7]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href={`/${locale}/app`} className="font-serif text-lg text-green-dark">
            Cata Café Sensible
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href={`/${locale}/app/sessions`} className="text-brown-dark hover:text-green-dark">
              {t("sessions")}
            </Link>
            <Link href={`/${locale}/app/coffees`} className="text-brown-dark hover:text-green-dark">
              {t("coffees")}
            </Link>
            <Link href={`/${locale}/app/profile/history`} className="text-brown-dark hover:text-green-dark">
              {t("history")}
            </Link>
            <Link href={`/${locale}/app/profile`} className="text-brown-dark hover:text-green-dark">
              {t("profile")}
            </Link>
            <Link href={`/${otherLocale}/app`} className="text-brown-mid text-xs uppercase">
              {otherLocale}
            </Link>
            <form action={signOut}>
              <button className="text-brown-mid text-sm hover:text-red-defect">
                {t("logout")}
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">{children}</main>
    </div>
  );
}
