import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { getCoffeesWithStats } from "@/app/actions/coffees";
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
    searchPlaceholder: t("searchPlaceholder"),
    colName: t("colName"),
    colOrigin: t("colOrigin"),
    colProcess: t("colProcess"),
    colVariety: t("colVariety"),
    colSessions: t("colSessions"),
    colLastScore: t("colLastScore"),
    colLastDate: t("colLastDate"),
    noData: t("noData"),
    // Raw template — CoffeesTable interpolates {from}/{to}/{total} client-side.
    showing: t.raw("showing"),
    view: t("view"),
    listPublic: t("listPublic"),
    listPrivate: t("listPrivate"),
    adminOwnerPrefix: t("adminOwnerPrefix"),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-green-dark font-semibold">
          {t("list")}
        </h1>
        <p className="text-sm text-brown-mid mt-1">
          {t("registered", { count: coffees.length })}
        </p>
        {isAdmin && (
          <p className="text-xs text-amber-warm font-semibold mt-1">
            {t("adminBadge")}
          </p>
        )}
      </div>
      <CoffeesTable
        coffees={coffees}
        locale={locale}
        translations={translations}
        isAdmin={isAdmin}
      />
    </div>
  );
}
