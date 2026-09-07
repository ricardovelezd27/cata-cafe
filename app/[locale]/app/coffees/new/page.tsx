import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { COFFEE_COUNTRIES } from "@/lib/analytics/normalize";
import { CoffeeForm } from "@/components/coffees/CoffeeForm";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function NewCoffeePage({
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

  const translations = {
    title: t("newPage.title"),
    subtitle: t("newPage.subtitle"),
    // field labels (shared with the coffee profile "details grid";
    // "name" reuses the list column label — "Nombre" / "Name" — since the
    // newPage namespace has no dedicated key for it)
    name: t("colName"),
    country: t("country"),
    region: t("region"),
    farm: t("farm"),
    producer: t("producer"),
    species: t("species"),
    variety: t("variety"),
    harvest: t("harvest"),
    process: t("process"),
    altitude: t("altitude"),
    roastLevel: t("roastLevel"),
    certifications: t("certifications"),
    // newPage-scoped microcopy
    notes: t("newPage.notes"),
    notesPh: t("newPage.notesPh"),
    harvestPh: t("newPage.harvestPh"),
    visibilityLabel: t("newPage.visibilityLabel"),
    visibilityPrivate: t("newPage.visibilityPrivate"),
    visibilityPrivateHint: t("newPage.visibilityPrivateHint"),
    visibilityShared: t("newPage.visibilityShared"),
    visibilitySharedHint: t("newPage.visibilitySharedHint"),
    visibilityPublic: t("newPage.visibilityPublic"),
    visibilityPublicHint: t("newPage.visibilityPublicHint"),
    create: t("newPage.create"),
    creating: t("newPage.creating"),
    nameRequired: t("newPage.nameRequired"),
    error: t("newPage.error"),
  };

  const countries = COFFEE_COUNTRIES.map((c) => (locale === "en" ? c.nameEn : c.nameEs));

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl text-primary-container font-semibold">
          {t("newPage.title")}
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">{t("newPage.subtitle")}</p>
      </div>
      <CoffeeForm locale={locale} translations={translations} countries={countries} />
    </div>
  );
}
