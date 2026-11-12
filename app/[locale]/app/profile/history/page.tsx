import { historyCupsPerSample, isQuickImpression } from "@/lib/historyRules";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { historyDisplay, type HistorySnapshotLike } from "@/lib/historyDisplay";
import { HistoryTable, type HistoryRow, type HistoryTableTranslations } from "./HistoryTable";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireAppUser(locale, `/${locale}/app/profile/history`);

  const history = await prisma.userCoffeeHistory.findMany({
    where: { userId: user.id },
    orderBy: { tastedAt: "desc" },
    include: {
      coffee: { select: { id: true, name: true, deletedAt: true } },
      session: { select: { id: true, name: true, cupsPerSample: true } },
    },
  });

  const t = await getTranslations("history");
  const tc = await getTranslations("common");
  const tSession = await getTranslations("session");
  // These two column-facet labels borrow real strings from the insights
  // namespace (deliberately — no new i18n keys were added for this table).
  const tScoreBand = await getTranslations("insights.explorer.dimensions");
  const tYear = await getTranslations("insights.chat.origin");

  const rows: HistoryRow[] = history.map((h) => {
    // A deleted session detaches this row (session → null) instead of
    // cascading it away — `snapshot` carries the last-known session name.
    const snapshot = h.snapshot as HistorySnapshotLike;
    const d = historyDisplay({
      coffeeId: h.coffeeId,
      coffee: h.coffee,
      session: h.session,
      snapshot,
    });
    return {
      id: h.id,
      // Label-only rows (S8-16) name no coffee: sample label + localized reason.
      coffeeId: d.linksToCoffee ? d.coffeeId : null,
      coffeeName:
        d.kind === "label_only"
          ? d.labelReason === "unrevealed"
            ? t("coffeeUnrevealed")
            : t("noCoffeeAssigned")
          : coffeeDisplayName(h.coffee!, tc("coffeeDeleted")),
      sampleLabel: d.kind === "label_only" ? d.sampleLabel : null,
      coffeeDeleted: d.coffeeDeleted,
      sessionId: d.sessionId,
      sessionName: d.sessionName ?? "—",
      individualScore: h.individualScore,
      communityScore: h.communityScore,
      quickImpression: isQuickImpression(historyCupsPerSample(h.session, snapshot)),
      tastedAt: h.tastedAt.toISOString(),
    };
  });

  const tableTranslations: HistoryTableTranslations = {
    table: {
      searchPlaceholder: tc("searchPlaceholder"),
      showing: tc.raw("showing"),
      prev: tc("prev"),
      next: tc("next"),
      clearFilters: tc("clearFilters"),
      all: tc("all"),
    },
    colCoffee: tSession("newForm.coffeeCard"),
    colSession: tSession("table.colName"),
    colDate: t("tasted"),
    yourScore: t("yourScore"),
    communityScore: t("communityScore"),
    filterScoreBand: tScoreBand("scoreBucket"),
    filterYear: tYear("year"),
    emptyBody: t("empty"),
    newSessionLabel: tSession("new"),
    expressLabel: tSession("express.cta"),
    noResults: tc("noResults"),
    sessionDeleted: t("sessionDeleted"),
    quickImpression: t("quickImpression"),
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <HistoryTable
        rows={rows}
        locale={locale}
        newSessionHref={`/${locale}/app/sessions/new`}
        expressHref={`/${locale}/app/sessions/express`}
        translations={tableTranslations}
      />
    </div>
  );
}
