import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
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
  const tc = await getTranslations("coffee");
  const tg = await getTranslations("group");
  const ta = await getTranslations("actions");
  const tgroups = await getTranslations("groups");

  const translations = {
    title: t("new"),
    name: t("name"),
    namePh: t("namePh"),
    date: t("date"),
    objective: t("objective"),
    objectivePh: t("objectivePh"),
    format: t("format"),
    cups: t("cups"),
    // coffee section
    coffees: t("coffees"),
    coffeeName: t("coffeeName"),
    producerRoaster: t("producerRoaster"),
    coffeeVariety: tc("variety"),
    coffeeAltitude: tc("altitude"),
    coffeeRoastLevel: tc("roastLevel"),
    coffeeCountry: tc("country"),
    coffeeRegion: tc("region"),
    addCoffee: t("addCoffee"),
    removeCoffee: t("removeCoffee"),
    sampleCoffee: t("sampleCoffee"),
    // samples
    samples: t("samples"),
    samplesHelper: t("samplesHelper"),
    addSample: t("addSample"),
    removeSample: t("removeSample"),
    sampleLabel: t("sampleLabel"),
    start: t("start"),
    formatDescriptive: t("formats.descriptive"),
    formatAffective: t("formats.affective"),
    formatCombined: t("formats.combined"),
    // group
    groupToggle: tg("toggle"),
    groupClosesAt: tg("closesAt"),
    groupInviteLink: tg("inviteLink"),
    groupCopyLink: tg("copyLink"),
    groupCopied: tg("copied"),
    groupStartCupping: ta("next"),
  };

  const groupsT = {
    notifyGroupTitle: tgroups("notifyGroupTitle"),
    selectGroup: tgroups("selectGroup"),
    noGroupsYet: tgroups("noGroupsYet"),
    subject: tgroups("subject"),
    message: tgroups("message"),
    send: tgroups("send"),
    sending: tgroups("sending"),
    sendSummary: tgroups.raw("sendSummary"),
    sendSkippedNotice: tgroups("sendSkippedNotice"),
    skip: tgroups("skip"),
    inviteDefaultMessage: tgroups("inviteDefaultMessage"),
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const groups = user
    ? await prisma.tastingGroup.findMany({
        where: { createdBy: user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, _count: { select: { members: true } } },
      })
    : [];

  const groupOptions = groups.map((g) => ({ id: g.id, name: g.name, memberCount: g._count.members }));

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl text-green-dark mb-6">{translations.title}</h1>
      <NewSessionForm locale={locale} t={translations} groupsT={groupsT} groups={groupOptions} />
    </div>
  );
}
