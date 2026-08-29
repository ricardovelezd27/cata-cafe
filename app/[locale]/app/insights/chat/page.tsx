import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAnalyticsAccess } from "@/lib/analytics/access";
import { ChatPanel } from "@/components/insights/ChatPanel";
import { DIMENSIONS, MEASURES } from "@/lib/analytics/types";
import type { DimensionId, MeasureId } from "@/lib/analytics/types";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function InsightsChatPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // AI chat is gated separately from the base insights area — the layout's
  // getAnalyticsAccess() check already lets non-AI-admins reach /insights,
  // so this page independently 404s them rather than showing a locked tab.
  const access = await getAnalyticsAccess();
  if (!access?.isAiAdmin) notFound();

  const [t, tExplorer, tCharts, tKpi] = await Promise.all([
    getTranslations("insights.chat"),
    getTranslations("insights.explorer"),
    getTranslations("insights.charts"),
    getTranslations("insights.kpi"),
  ]);

  // Bulk-build option-label records; the dynamic keys defeat next-intl's
  // template-literal typing, so go through an untyped alias (mirrors
  // app/[locale]/app/insights/explorer/page.tsx's record() helper).
  const trExplorer = tExplorer as unknown as (key: string) => string;
  const record = <K extends string>(keys: readonly K[], prefix: string) =>
    Object.fromEntries(keys.map((k) => [k, trExplorer(`${prefix}.${k}`)])) as Record<K, string>;

  return (
    <ChatPanel
      locale={locale}
      t={{
        title: t("title"),
        subtitle: t("subtitle"),
        placeholder: t("placeholder"),
        send: t("send"),
        thinking: t("thinking"),
        disclaimer: t("disclaimer"),
        notConfigured: t("notConfigured"),
        error: t("error"),
        noAnswer: t("noAnswer"),
        retry: t("retry"),
        // Raw ICU templates — {limit}/{remaining} are only known once the
        // server action returns usage at runtime, so they're interpolated
        // client-side (see next-intl placeholder gotcha in project memory).
        limitReachedTemplate: t.raw("limitReached"),
        remainingTemplate: t.raw("remaining"),
        emptyTitle: t("emptyTitle"),
        emptyHint: t("emptyHint"),
        examples: [t("example1"), t("example2"), t("example3")],
        clear: t("clear"),
        you: t("you"),
        assistant: t("assistant"),
        benchmark: {
          mine: t("benchmark.mine"),
          benchmark: t("benchmark.benchmark"),
          n: t("benchmark.n"),
          avg: t("benchmark.avg"),
          min: t("benchmark.min"),
          max: t("benchmark.max"),
          p25: t("benchmark.p25"),
          p75: t("benchmark.p75"),
        },
        origin: {
          year: t("origin.year"),
          production: t("origin.production"),
          myActivity: t("origin.myActivity"),
        },
        session: {
          candidatesTitle: t("session.candidatesTitle"),
          sample: t("session.sample"),
          community: t("session.community"),
          average: t("session.average"),
          submitted: t("session.submitted"),
        },
        explorer: {
          dimensions: record<DimensionId>(DIMENSIONS, "dimensions"),
          measures: record<MeasureId>(MEASURES, "measures"),
          tableCount: tExplorer("table.count"),
          chartEmpty: tCharts("empty"),
        },
        // get_dashboard_overview KPI chip labels: reuse the dashboard's own
        // insights.kpi.* strings where they're usable standalone; the two
        // fields whose only existing translation is a "{count} ..." subtext
        // template get a small dedicated pair under insights.chat.overview.
        overview: {
          coffeesRegistered: t("overview.coffeesRegistered"),
          coffeesCupped: tKpi("coffeesCupped"),
          sessionsTotal: tKpi("sessions"),
          evaluationsSubmitted: tKpi("evaluations"),
          activeCuppers30d: tKpi("activeCuppers"),
          totalUsers: t("overview.totalUsers"),
          avgIndividualScore: tKpi("avgScore"),
          avgCommunityScore: tKpi("avgCommunity"),
        },
      }}
    />
  );
}
