import { getTranslations, setRequestLocale } from "next-intl/server";
import { Coffee, ClipboardList, CheckCircle2, Users, Download } from "lucide-react";
import { getDashboardData } from "@/lib/analytics/queries";
import { requireAnalyticsAccess } from "@/lib/analytics/access";
import { scopeFor } from "@/lib/analytics/scope";
import { StatCard } from "@/components/dashboard/StatCard";
import { TrendChart } from "@/components/insights/TrendChart";
import { InsightChart } from "@/components/insights/InsightChart";
import { DescriptorBarList } from "@/components/insights/DescriptorBarList";
import { AiSummaryPanel } from "@/components/insights/AiSummaryPanel";
import type { ReactNode } from "react";
import { cardClasses } from "@/components/ui/cardRecipe";
import { ButtonLink } from "@/components/ui/Button";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={cardClasses()}>
      <h2 className="label-caps font-sans mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function InsightsDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const scope = scopeFor(await requireAnalyticsAccess());
  const [t, data] = await Promise.all([
    getTranslations("insights"),
    getDashboardData(locale === "en" ? "en" : "es", scope),
  ]);

  const statusSub = ["draft", "active", "closed"]
    .filter((s) => data.sessionsByStatus[s])
    .map((s) => `${data.sessionsByStatus[s]} ${t(`status.${s}`)}`)
    .join(" · ");

  const chartLabels = {
    valueLabel: t("explorer.measures.count"),
    dimensionLabel: "",
    countLabel: t("explorer.table.count"),
    emptyLabel: t("charts.empty"),
  };

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex items-center justify-end">
        <ButtonLink
          href={`/api/insights/report?locale=${locale}`}
          variant="secondary"
          size="sm"
          icon={<Download size={16} aria-hidden />}
        >
          {t("report.download")}
        </ButtonLink>
      </div>

      {/* F-11 (P1c): a stat card is never as wide as the row. Two per row on a phone; from
          768 px three per row, each capped at 240 px: the dashboard's grid. Not auto-fill: with
          a 240 px maximum, auto-fill counts columns by the maximum (see app/[locale]/app/page.tsx). */}
      <div className="grid grid-cols-2 gap-[12px] md:grid-cols-[repeat(3,minmax(0,240px))] md:gap-[16px]">
        <StatCard
          label={t("kpi.coffeesCupped")}
          value={String(data.coffeesCupped)}
          subtext={t("kpi.coffeesRegistered", { count: data.coffeesRegistered })}
          icon={<Coffee size={18} />}
        />
        <StatCard
          label={t("kpi.sessions")}
          value={String(data.sessionsTotal)}
          subtext={statusSub || t("kpi.noData")}
          icon={<ClipboardList size={18} />}
        />
        <StatCard
          label={t("kpi.evaluations")}
          value={String(data.evaluationsSubmitted)}
          subtext={t("kpi.evaluationsSub")}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label={t("kpi.activeCuppers")}
          value={String(data.activeCuppers30d)}
          subtext={t("kpi.totalUsers", { count: data.totalUsers })}
          icon={<Users size={18} />}
        />
        <StatCard
          label={t("kpi.avgScore")}
          value={data.avgIndividualScore != null ? data.avgIndividualScore.toFixed(2) : "—"}
          subtext={t("kpi.avgScoreSub")}
          accent
        />
        <StatCard
          label={t("kpi.avgCommunity")}
          value={data.avgCommunityScore != null ? data.avgCommunityScore.toFixed(2) : "—"}
          subtext={t("kpi.avgCommunitySub")}
          accent
        />
      </div>

      <AiSummaryPanel
        locale={locale}
        target={{ kind: "dashboard" }}
        translations={{
          generate: t("ai.generate"),
          generating: t("ai.generating"),
          regenerate: t("ai.regenerate"),
          disclaimer: t("ai.disclaimer"),
          notConfigured: t("ai.notConfigured"),
          error: t("ai.error"),
        }}
      />

      <ChartCard title={t("charts.trend")}>
        <TrendChart
          data={data.monthlyTrend}
          evaluationsLabel={t("charts.seriesEvaluations")}
          sessionsLabel={t("charts.seriesSessions")}
        />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title={t("charts.topOrigins")}>
          <InsightChart rows={data.topOrigins} chartType="bar" {...chartLabels} />
        </ChartCard>
        <ChartCard title={t("charts.topProcesses")}>
          <InsightChart rows={data.topProcesses} chartType="bar" {...chartLabels} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard title={t("charts.scoreDistribution")}>
          <InsightChart rows={data.scoreDistribution} chartType="bar" {...chartLabels} />
        </ChartCard>
        <ChartCard title={t("charts.topDescriptors")}>
          <DescriptorBarList rows={data.topDescriptors} emptyLabel={t("charts.empty")} />
        </ChartCard>
      </div>
    </div>
  );
}
