import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { parseWizardHandoff } from "@/lib/sessionDefaults";
import { NewSessionForm } from "./NewSessionForm";
import { COFFEE_COUNTRIES } from "@/lib/analytics/normalize";
import { getUsableCoffees } from "@/lib/coffees/queries";
import type { UsableCoffee } from "@/components/coffees/CoffeePicker";

// Hosts createGroupSession, which can notify a tasting group by mail (S9-01 D-08).
export const maxDuration = 120;

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function NewSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; coffeeId?: string; name?: string; format?: string; n?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const requestedGroupId = sp.groupId;
  // "Configurar sesión completa" from the express form: bad values ignored.
  const handoff = parseWizardHandoff(sp);
  setRequestLocale(locale);
  const t = await getTranslations("session");
  const tc = await getTranslations("coffee");
  const tg = await getTranslations("group");
  const tw = await getTranslations("warmup");
  const ta = await getTranslations("actions");
  const tgroups = await getTranslations("groups");
  const tgroup = await getTranslations("group");
  const tCommon = await getTranslations("common");

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
    coffeeFarm: tc("farm"),
    coffeeSpecies: tc("species"),
    coffeeHarvest: tc("harvest"),
    coffeeHarvestPh: tc("newPage.harvestPh"),
    coffeeProcess: tc("process"),
    coffeeCertifications: tc("certifications"),
    coffeeNotes: tc("newPage.notes"),
    coffeeNotesPh: tc("newPage.notesPh"),
    addCoffee: t("addCoffee"),
    removeCoffee: t("removeCoffee"),
    // samples section
    addSample: t("addSample"),
    removeSample: t("removeSample"),
    sampleLabel: t("sampleLabel"),
    sampleCoffee: t("sampleCoffee"),
    start: t("start"),
    // warm-up
    warmup: {
      toggle: tw("wizard.toggle"),
      label: tw("wizard.label"),
      hint: tw("wizard.hint"),
      minutes: tw.raw("wizard.minutes") as string,
    },
    // group
    groupToggle: tg("toggle"),
    groupClosesAt: tg("closesAt"),
    groupClosesAtHint: tg("closesAtHint"),
    groupClosesAtLiveNotice: tg("closesAtLiveNotice"),
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
      moreDetails: t("newForm.moreDetails"),
      referenceTitle: t("newForm.referenceTitle"),
      referenceHelper: t("newForm.referenceHelper"),
      goToPanel: t("newForm.goToPanel"),
      goToPanelHint: t("newForm.goToPanelHint"),
      startNow: t("newForm.startNow"),
      startGroup: t("newForm.startGroup"),
      referenceMark: t.raw("newForm.referenceMark"),
      cupsHint: t("newForm.cupsHint"),
      referenceBadge: t("newForm.referenceBadge"),
      referenceNone: t("newForm.referenceNone"),
      referenceClear: t("newForm.referenceClear"),
      sampleWarning: {
        many: t("sampleCountWarning.many"),
        combined: t("sampleCountWarning.combined"),
      },
      notifyWhen: {
        checkbox: t("newForm.notifyWhen.checkbox"),
        legend: t("newForm.notifyWhen.legend"),
        onCreate: t("newForm.notifyWhen.onCreate"),
        onStart: t("newForm.notifyWhen.onStart"),
      },
      sampleLabelAuto: t("newForm.sampleLabelAuto"),
      samplesBlindHelper: t("newForm.samplesBlindHelper"),
      sampleKey: {
        title: t("newForm.sampleKey.title"),
        hint: t("newForm.sampleKey.hint"),
        noCoffee: t("newForm.sampleKey.noCoffee"),
      },
      // The WHOLE table: every code the validators can return needs copy
      // (S8-10 T2; tests/sessionErrorsCopy.test.ts enumerates them). Includes
      // S8-09's `offline` and S8-05's codes.
      errors: t.raw("newForm.errors") as Record<string, string> & { generic: string },
    },
    // coffee picker
    picker: {
      useExisting: tc("picker.useExisting"),
      title: tc("picker.title"),
      searchPlaceholder: tc("picker.searchPlaceholder"),
      mine: tc("picker.mine"),
      shared: tc("picker.shared"),
      public: tc("picker.public"),
      empty: tc("picker.empty"),
      linked: tc("picker.linked"),
      unlink: tc("picker.unlink"),
      close: tCommon("close"),
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
    sendRateLimited: tgroups("sendRateLimited"),
    skip: tgroups("skip"),
    inviteDefaultMessage: tgroups("inviteDefaultMessage"),
    // Groups v2: session wizard's "link a group" step-1 selector + step-2
    // auto-invite success strip.
    linkGroupLabel: tgroups("linkGroupLabel"),
    noGroupOption: tgroups("noGroupOption"),
    autoInviteLive: tgroups("autoInviteLive"),
    autoInviteAsync: tgroups("autoInviteAsync"),
    autoInviteSummary: tgroups.raw("autoInviteSummary"),
    autoInviteRateLimited: tgroups("autoInviteRateLimited"),
    startGroupNoticeFailed: tgroup("startGroupNoticeFailed"),
    startGroupNoticePartial: tgroup("startGroupNoticePartial"),
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

  // ?groupId=<id> prefill (e.g. the "Crear sesión para este grupo" CTA on a
  // group's page) — only honored when the id belongs to a group this user
  // owns (already the universe fetched above for the selector), never trusted
  // blindly from the query string.
  const initialGroupId = groupOptions.some((g) => g.id === requestedGroupId)
    ? requestedGroupId
    : undefined;

  const countries = COFFEE_COUNTRIES.map((c) => (locale === "en" ? c.nameEn : c.nameEs));

  const usableRaw = user ? await getUsableCoffees(user.id) : [];
  const usableCoffees: UsableCoffee[] = usableRaw.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    producer: c.producer,
    variety: c.variety,
    altitude: c.altitude,
    roastLevel: c.roastLevel,
    country: c.country,
    region: c.region,
    processType: c.processType,
    origin: c.createdBy === user!.id ? "mine" : c.visibility === "public" ? "public" : "shared",
  }));

  // ?coffeeId=<id> ("Catar este café"): honored only when the coffee is in the
  // set this user may use — usableCoffeeWhere ran inside getUsableCoffees —
  // so a foreign or anonymized id is silently ignored.
  const initialCoffee = usableCoffees.find((c) => c.id === sp.coffeeId) ?? null;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl text-primary-container mb-6">{translations.title}</h1>
      <NewSessionForm
        locale={locale}
        t={translations}
        groupsT={groupsT}
        groups={groupOptions}
        countries={countries}
        usableCoffees={usableCoffees}
        initialGroupId={initialGroupId}
        handoff={handoff}
        userId={user?.id ?? null}
        initialCoffee={initialCoffee}
      />
    </div>
  );
}
