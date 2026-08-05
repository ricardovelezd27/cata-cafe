import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { NewSessionForm } from "./NewSessionForm";
import { COFFEE_COUNTRIES } from "@/lib/analytics/normalize";

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
    formatDescriptive: t("formats.descriptive"),
    formatAffective: t("formats.affective"),
    formatCombined: t("formats.combined"),
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
    // samples section
    addSample: t("addSample"),
    removeSample: t("removeSample"),
    sampleLabel: t("sampleLabel"),
    sampleCoffee: t("sampleCoffee"),
    start: t("start"),
    // group
    groupToggle: tg("toggle"),
    groupClosesAt: tg("closesAt"),
    groupInviteLink: tg("inviteLink"),
    groupCopyLink: tg("copyLink"),
    groupCopied: tg("copied"),
    groupCopyImage: tg("copyImage"),
    groupDownloadQr: tg("downloadQr"),
    groupStartCupping: ta("next"),
    // new form microcopy
    newForm: {
      required: t("newForm.required"),
      optionalSuffix: t("newForm.optionalSuffix"),
      coffeeCard: t("newForm.coffeeCard"),
      sampleChip: t("newForm.sampleChip"),
      samplesTitle: t("newForm.samplesTitle"),
      samplesHelper: t("newForm.samplesHelper"),
      errors: {
        no_samples: t("newForm.errors.no_samples"),
        no_coffees: t("newForm.errors.no_coffees"),
        missing_coffee_fields: t("newForm.errors.missing_coffee_fields"),
        sample_without_coffee: t("newForm.errors.sample_without_coffee"),
        generic: t("newForm.errors.generic"),
      },
    },
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
    // Groups v2: session wizard's "link a group" step-1 selector + step-2
    // auto-invite success strip.
    linkGroupLabel: tgroups("linkGroupLabel"),
    noGroupOption: tgroups("noGroupOption"),
    autoInviteToggle: tgroups("autoInviteToggle"),
    autoInviteSummary: tgroups.raw("autoInviteSummary"),
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

  const countries = COFFEE_COUNTRIES.map((c) => (locale === "en" ? c.nameEn : c.nameEs));

  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl text-green-dark mb-6">{translations.title}</h1>
      <NewSessionForm
        locale={locale}
        t={translations}
        groupsT={groupsT}
        groups={groupOptions}
        countries={countries}
      />
    </div>
  );
}
