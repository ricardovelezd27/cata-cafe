import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAnalyticsAccess } from "@/lib/analytics/access";
import { InsightsTabs } from "@/components/insights/InsightsTabs";
import type { ReactNode } from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <PageContainer>
      <PageHeader title={t("title")} description={t("subtitle")} />
      {/* The tabs and the tab's content are one block: the tabs open it. */}
      <div>
      <InsightsTabs
        locale={locale}
        isSuperAdmin={access.isSuperAdmin}
        isAiAdmin={access.isAiAdmin}
        labels={{
          dashboard: t("tabs.dashboard"),
          explorer: t("tabs.explorer"),
          benchmark: t("tabs.benchmark"),
          chat: t("tabs.chat"),
          access: t("tabs.access"),
          users: t("tabs.users"),
        }}
      />
      {children}
      </div>
    </PageContainer>
  );
}
