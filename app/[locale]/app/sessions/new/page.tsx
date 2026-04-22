import { getTranslations, setRequestLocale } from "next-intl/server";
import { NewSessionForm } from "./NewSessionForm";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function NewSessionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("session");
  const tg = await getTranslations("group");
  const ta = await getTranslations("actions");

  const translations = {
    title: t("new"),
    name: t("name"),
    namePh: t("namePh"),
    date: t("date"),
    objective: t("objective"),
    objectivePh: t("objectivePh"),
    format: t("format"),
    cups: t("cups"),
    samples: t("samples"),
    addSample: t("addSample"),
    removeSample: t("removeSample"),
    sampleLabel: t("sampleLabel"),
    start: t("start"),
    formatDescriptive: t("formats.descriptive"),
    formatAffective: t("formats.affective"),
    formatCombined: t("formats.combined"),
    // group
    groupToggle: tg("toggle"),
    groupAsync: tg("async"),
    groupClosesAt: tg("closesAt"),
    groupInviteLink: tg("inviteLink"),
    groupCopyLink: tg("copyLink"),
    groupCopied: tg("copied"),
    groupStartCupping: ta("next"),
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl text-green-dark mb-6">{translations.title}</h1>
      <NewSessionForm locale={locale} t={translations} />
    </div>
  );
}
