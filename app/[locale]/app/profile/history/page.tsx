import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const history = await prisma.userCoffeeHistory.findMany({
    where: { userId: user.id },
    orderBy: { tastedAt: "desc" },
    include: {
      coffee: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
    },
  });

  const t = await getTranslations("history");
  const tc = await getTranslations("common");
  const tSession = await getTranslations("session");
  // These two column-facet labels borrow real strings from the insights
  // namespace (deliberately — no new i18n keys were added for this table).
  const tScoreBand = await getTranslations("insights.explorer.dimensions");
  const tYear = await getTranslations("insights.chat.origin");

  const rows: HistoryRow[] = history.map((h) => ({
    id: h.id,
    coffeeId: h.coffee.id,
    coffeeName: h.coffee.name,
    sessionId: h.session.id,
    sessionName: h.session.name,
    individualScore: h.individualScore,
    communityScore: h.communityScore,
    tastedAt: h.tastedAt.toISOString(),
  }));

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
    noResults: tc("noResults"),
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} />
      <HistoryTable
        rows={rows}
        locale={locale}
        newSessionHref={`/${locale}/app/sessions/new`}
        translations={tableTranslations}
      />
    </div>
  );
}
