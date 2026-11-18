import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireAppUser } from "@/lib/auth";
import { COFFEE_COUNTRIES } from "@/lib/analytics/normalize";
import { CoffeeForm } from "@/components/coffees/CoffeeForm";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

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

  const user = await requireAppUser(locale, `/${locale}/app/coffees/new`);

  const t = await getTranslations("coffee");
  const ta = await getTranslations("actions");

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
    <PageContainer width="form">
      <PageHeader
        title={t("newPage.title")}
        description={t("newPage.subtitle")}
        backHref={`/${locale}/app/coffees`}
        backLabel={ta("back")}
      />
      <CoffeeForm locale={locale} translations={translations} countries={countries} />
    </PageContainer>
  );
}
