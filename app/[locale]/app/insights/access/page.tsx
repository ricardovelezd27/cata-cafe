import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAnalyticsAccess } from "@/lib/analytics/access";
import { listAnalyticsUsers } from "@/app/actions/analytics";
import { getLastDigestRun } from "@/lib/insightsDigestEmail";
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

  const [t, tc, tu, users, lastDigest] = await Promise.all([
    getTranslations("insights.access"),
    getTranslations("common"),
    getTranslations("insights.users"),
    listAnalyticsUsers(),
    getLastDigestRun(),
  ]);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <p className="text-caption text-on-surface-variant">{t("lead")}</p>
      <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-4">
        <h2 className="text-body">{t("digestTitle")}</h2>
        <p className="mt-1 text-caption text-on-surface-variant">
          {!lastDigest
            ? t("digestNone")
            : lastDigest.status === "running"
              ? t("digestRunning", { period: lastDigest.period })
              : t("digestLast", {
                  period: lastDigest.period,
                  sent: lastDigest.sent,
                  recipients: lastDigest.recipients,
                })}
        </p>
      </div>
      <AccessManager
        users={users}
        locale={locale}
        t={{
          search: t("search"),
          accessLabel: t("accessLabel"),
          superAdmin: t("superAdmin"),
          emailUnavailable: t("emailUnavailable"),
          toggleError: t("toggleError"),
          empty: t("empty"),
          // S10 (D-13): the kit table's controls and the headers, from the
          // keys the Usuarios directory already uses (no new copy).
          table: {
            showing: tc.raw("showing"),
            prev: tc("prev"),
            next: tc("next"),
            clearFilters: tc("clearFilters"),
            all: tc("all"),
          },
          colName: tu("colName"),
          colEmail: tu("colEmail"),
          colCountry: tu("colCountry"),
        }}
      />
    </div>
  );
}
