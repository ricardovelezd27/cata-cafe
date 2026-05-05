import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCoffeesWithStats } from "@/app/actions/coffees";
import CoffeesTable from "@/components/coffees/CoffeesTable";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function CoffeesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("coffee");

  const raw = await getCoffeesWithStats(user.id);
  const coffees = raw.map((c) => ({
    ...c,
    coffeeHistory: c.coffeeHistory.map((h) => ({
      ...h,
      tastedAt: h.tastedAt.toISOString(),
    })),
  }));

  const translations = {
    searchPlaceholder: t("searchPlaceholder"),
    colName: t("colName"),
    colOrigin: t("colOrigin"),
    colProcess: t("colProcess"),
    colVariety: t("colVariety"),
    colSessions: t("colSessions"),
    colLastScore: t("colLastScore"),
    colLastDate: t("colLastDate"),
    noData: t("noData"),
    showing: t("showing"),
    view: t("view"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-green-dark font-semibold">
          {t("list")}
        </h1>
        <p className="text-sm text-brown-mid mt-1">
          {t("registered", { count: coffees.length })}
        </p>
      </div>
      <CoffeesTable coffees={coffees} locale={locale} translations={translations} />
    </div>
  );
}
