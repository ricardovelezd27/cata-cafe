import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAnalyticsAccess } from "@/lib/analytics/access";
import { InsightsTabs } from "@/components/insights/InsightsTabs";
import type { ReactNode } from "react";

// Access boundary for the whole insights area: unauthorized users get a 404
// so the area's existence is not advertised. Server actions are guarded
// independently in app/actions/analytics.ts.
export default async function InsightsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const access = await getAnalyticsAccess();
  if (!access) notFound();

  const t = await getTranslations("insights");

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="font-display text-2xl text-brown-dark mb-1">{t("title")}</h1>
      <p className="text-sm text-brown-mid mb-4">{t("subtitle")}</p>
      <InsightsTabs
        locale={locale}
        isSuperAdmin={access.isSuperAdmin}
        labels={{
          dashboard: t("tabs.dashboard"),
          explorer: t("tabs.explorer"),
          benchmark: t("tabs.benchmark"),
          share: t("tabs.share"),
          access: t("tabs.access"),
        }}
      />
      {children}
    </div>
  );
}
