import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAnalyticsAccess } from "@/lib/analytics/access";
import { listAnalyticsUsers } from "@/app/actions/analytics";
import { AccessManager } from "@/components/insights/AccessManager";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function InsightsAccessPage({
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

  const [t, users] = await Promise.all([
    getTranslations("insights.access"),
    listAnalyticsUsers(),
  ]);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <p className="text-sm text-brown-mid">{t("lead")}</p>
      <AccessManager
        users={users}
        t={{
          search: t("search"),
          accessLabel: t("accessLabel"),
          superAdmin: t("superAdmin"),
          emailUnavailable: t("emailUnavailable"),
          toggleError: t("toggleError"),
          empty: t("empty"),
        }}
      />
    </div>
  );
}
