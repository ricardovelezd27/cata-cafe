import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { COFFEE_COUNTRIES } from "@/lib/analytics/normalize";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoffeeForm } from "@/components/coffees/CoffeeForm";

// Auth'd page with a dynamic [id] segment: must render per-request. With
// generateStaticParams present, prod attempts on-demand static generation and
// the cookies() call inside createClient() 500s (dev always renders dynamic,
// so the crash only appears in production). Same pattern as coffees/[id].
export const dynamic = "force-dynamic";

export default async function EditCoffeePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const coffee = await prisma.coffee.findUnique({ where: { id } });
  if (!coffee || coffee.createdBy !== user.id) notFound();

  const t = await getTranslations("coffee");
  const ta = await getTranslations("actions");

  const translations = {
    // field labels (shared with the coffee profile "details grid")
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
    // newPage-scoped microcopy — reused here since edit has no dedicated keys
    // for notes/visibility copy (visibility section itself is hidden in edit mode).
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
    // edit-specific failure copy (create flow uses newPage.error instead)
    error: t("updateError"),
  };

  const countries = COFFEE_COUNTRIES.map((c) => (locale === "en" ? c.nameEn : c.nameEs));

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title={t("editTitle")}
        description={t("editSubtitle")}
        backHref={`/${locale}/app/coffees/${id}`}
        backLabel={ta("back")}
      />
      <CoffeeForm
        locale={locale}
        translations={translations}
        countries={countries}
        mode="edit"
        coffeeId={id}
        initialValues={{
          name: coffee.name,
          country: coffee.country ?? "",
          region: coffee.region ?? "",
          farm: coffee.farm ?? "",
          producer: coffee.producer ?? "",
          species: coffee.species ?? "",
          variety: coffee.variety ?? "",
          harvestYear: coffee.harvestYear ?? "",
          processType: coffee.processType ?? "",
          altitude: coffee.altitude ?? "",
          roastLevel: coffee.roastLevel ?? "",
          certifications: coffee.certifications,
          notes: coffee.notes ?? "",
        }}
        submitLabel={t("saveChanges")}
        submittingLabel={t("savingChanges")}
      />
    </div>
  );
}
