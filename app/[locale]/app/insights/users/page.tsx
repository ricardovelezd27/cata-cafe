import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAnalyticsAccess } from "@/lib/analytics/access";
import { listAnalyticsUsers } from "@/app/actions/analytics";
import { UsersDirectory } from "@/components/insights/UsersDirectory";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function InsightsUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The insights layout already requires analytics access; this page is
  // additionally super-admin only (a granted colleague gets a 404 here).
  const access = await getAnalyticsAccess();
  if (!access?.isSuperAdmin) notFound();

  const [t, tc, ta, users] = await Promise.all([
    getTranslations("insights.users"),
    getTranslations("common"),
    getTranslations("insights.access"),
    listAnalyticsUsers(),
  ]);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <p className="text-sm text-brown-mid">{t("lead")}</p>
      <UsersDirectory
        users={users}
        locale={locale}
        t={{
          table: {
            searchPlaceholder: tc("searchPlaceholder"),
            showing: tc.raw("showing"),
            prev: tc("prev"),
            next: tc("next"),
            clearFilters: tc("clearFilters"),
            all: tc("all"),
          },
          colName: t("colName"),
          colEmail: t("colEmail"),
          colCountry: t("colCountry"),
          colRole: t("colRole"),
          colSessions: t("colSessions"),
          colCoffees: t("colCoffees"),
          colJoined: t("colJoined"),
          empty: t("empty"),
          emailUnavailable: ta("emailUnavailable"),
          noResults: tc("noResults"),
        }}
      />
    </div>
  );
}
