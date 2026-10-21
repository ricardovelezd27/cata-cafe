import { getTranslations, setRequestLocale } from "next-intl/server";
import { defaultExpressName } from "@/lib/expressSession";
import { ExpressForm, type ExpressFormTranslations } from "./ExpressForm";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function ExpressSessionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("session");

  const defaultName = defaultExpressName(new Date(), locale);

  const translations: ExpressFormTranslations = {
    title: t("express.title"),
    subtitle: t("express.subtitle"),
    back: t("express.back"),
    name: t("express.name"),
    format: t("express.format"),
    formatDescriptive: t("formats.descriptive"),
    formatAffective: t("formats.affective"),
    formatCombined: t("formats.combined"),
    samples: t("express.samples"),
    samplesHint: t("express.samplesHint"),
    decrement: t("express.decrement"),
    increment: t("express.increment"),
    cta: t("express.cta"),
    creating: t("express.creating"),
    fullWizard: t("express.fullWizard"),
  };

  return (
    <ExpressForm locale={locale} defaultName={defaultName} translations={translations} />
  );
}
