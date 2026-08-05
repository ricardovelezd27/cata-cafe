import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { getCoffeesWithStats } from "@/app/actions/coffees";
import { PageHeader } from "@/components/ui";
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
  const tc = await getTranslations("common");
  const isAdmin = isSuperAdminEmail(user.email);

  const raw = await getCoffeesWithStats(user.id, { all: isAdmin });
  const coffees = raw.map((c) => {
    // Strip `creator` before handing rows to the client component — only the
    // admin-gated ownerName may cross the server/client boundary; shipping
    // every owner's displayName to every browser would leak data the UI hides.
    const { creator, ...rest } = c;
    const isMine = c.createdBy === user.id;
    const ownerName = isAdmin && !isMine ? creator?.displayName ?? null : null;
    return {
      ...rest,
      isMine,
      ownerName,
      coffeeHistory: rest.coffeeHistory.map((h) => ({
        ...h,
        tastedAt: h.tastedAt.toISOString(),
      })),
    };
  });

  const translations = {
    colName: t("colName"),
    colOrigin: t("colOrigin"),
    colProcess: t("colProcess"),
    colVariety: t("colVariety"),
    colSessions: t("colSessions"),
    colLastScore: t("colLastScore"),
    colLastDate: t("colLastDate"),
    view: t("view"),
    listPublic: t("listPublic"),
    listPrivate: t("listPrivate"),
    listShared: t("listShared"),
    sharedWithMe: t("sharedWithMe"),
    adminOwnerPrefix: t("adminOwnerPrefix"),
    noData: t("noData"),
    // Generic table controls — shared common.* strings, not coffee-scoped.
    searchPlaceholder: tc("searchPlaceholder"),
    // Raw template — DataTable interpolates {from}/{to}/{total} client-side.
    showing: tc.raw("showing"),
    prev: tc("prev"),
    next: tc("next"),
    clearFilters: tc("clearFilters"),
    all: tc("all"),
    noResults: tc("noResults"),
    // Facets
    filterProcess: t("filterProcess"),
    filterCountry: t("filterCountry"),
    filterOwnership: t("filterOwnership"),
    ownershipMine: t("ownershipMine"),
    ownershipShared: t("ownershipShared"),
    ownershipPublic: t("ownershipPublic"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("list")}
        description={
          <>
            {t("registered", { count: coffees.length })}
            {isAdmin && (
              <span className="mt-1 block text-xs font-semibold text-secondary">
                {t("adminBadge")}
              </span>
            )}
          </>
        }
        action={
          <Link
            href={`/${locale}/app/coffees/new`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-primary-container px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary"
          >
            <Plus size={16} />
            {t("createCoffee")}
          </Link>
        }
      />
      <CoffeesTable
        coffees={coffees}
        locale={locale}
        translations={translations}
        isAdmin={isAdmin}
      />
    </div>
  );
}
