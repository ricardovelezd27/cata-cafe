import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { dateInZone } from "@/lib/closeRules";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { getUsableCoffees } from "@/lib/coffees/queries";
import type { UsableCoffee } from "@/components/coffees/CoffeePicker";
import { normalizeReferenceMode } from "@/lib/referenceRules";
import { EditSessionForm, type EditSessionFormTranslations } from "./EditSessionForm";

// Authed page with an extra [id] dynamic segment: force-dynamic, never
// generateStaticParams — see CLAUDE.md "authed pages with an extra dynamic
// segment" (on-demand static generation would crash the cookies() call
// inside createClient() in production; see app/[locale]/join/[token]/page.tsx).
export const dynamic = "force-dynamic";

export default async function EditSessionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireAppUser(locale, `/${locale}/app/sessions/${id}/edit`);

  const session = await prisma.cuppingSession.findUnique({
    where: { id },
    include: {
      samples: {
        orderBy: { position: "asc" },
        include: { _count: { select: { evaluations: true } } },
      },
    },
  });
  // referenceSampleId is a scalar column on CuppingSession — included by
  // default with findUnique (no separate select needed alongside `include`).

  if (!session || session.createdBy !== user.id) notFound();

  // Same relation-based count updateSession itself uses to decide the
  // format/cups lock — never the denormalized Evaluation.sessionId (nullable
  // on old rows; see the Evaluation model comment in schema.prisma).
  const evalCount = await prisma.evaluation.count({
    where: { sessionSample: { sessionId: id } },
  });

  const groups = session.isGroup
    ? await prisma.tastingGroup.findMany({
        where: { createdBy: user.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  // Same source and mapping as the wizard (sessions/new/page.tsx):
  // getUsableCoffees runs usableCoffeeWhere; addSessionSample re-validates.
  const usableRaw = session.status === "closed" ? [] : await getUsableCoffees(user.id);
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
    origin: c.createdBy === user.id ? "mine" : c.visibility === "public" ? "public" : "shared",
  }));

  const t = await getTranslations("session");
  const tcoffee = await getTranslations("coffee");
  const tc = await getTranslations("common");
  const tw = await getTranslations("warmup");
  const tg = await getTranslations("group");

  const translations: EditSessionFormTranslations = {
    warmup: {
      toggle: tw("wizard.toggle"),
      label: tw("wizard.label"),
      hint: tw("wizard.hint"),
      minutes: tw.raw("wizard.minutes") as string,
    },
    name: t("name"),
    namePh: t("namePh"),
    date: t("date"),
    objective: t("objective"),
    objectivePh: t("objectivePh"),
    format: t("format"),
    cups: t("cups"),
    formats: {
      descriptive: t("formats.descriptive"),
      affective: t("formats.affective"),
      combined: t("formats.combined"),
    },
    formatLocked: t("edit.formatLocked"),
    linkedGroup: t("edit.linkedGroup"),
    noGroup: t("edit.noGroup"),
    samplesTitle: t("edit.samplesTitle"),
    addSample: t("edit.addSample"),
    sampleLabel: t("sampleLabel"),
    sampleHasEvals: t("edit.sampleHasEvals"),
    removeSampleTitle: t("edit.removeSampleTitle"),
    removeSampleBody: t.raw("edit.removeSampleBody"),
    removeSample: t("removeSample"),
    cancel: tc("cancel"),
    close: tc("close"),
    save: t("edit.save"),
    saving: t("edit.saving"),
    saved: t("edit.saved"),
    error: t("edit.error"),
    referenceTitle: t("edit.referenceTitle"),
    referenceNone: t("edit.referenceNone"),
    referenceHelper: t("edit.referenceHelper"),
    referenceHelperFree: t("edit.referenceHelperFree"),
    referenceModeLegend: t("newForm.referenceMode.legend"),
    referenceModeAnchor: t("newForm.referenceMode.anchor"),
    referenceModeFree: t("newForm.referenceMode.free"),
    referenceModeAnchorHelp: t("newForm.referenceMode.anchorHelp"),
    referenceModeFreeHelp: t("newForm.referenceMode.freeHelp"),
    referenceModeLocked: t("edit.referenceModeLocked"),
    referenceSaved: t("edit.referenceSaved"),
    closesAt: t("edit.closesAt"),
    closesAtHint: t("edit.closesAtHint"),
    closesAtPast: t("edit.closesAtPast"),
    closesAtLiveNotice: tg("closesAtLiveNotice"),
    sessionClosed: t("edit.sessionClosed"),
    warmupLocked: t("edit.warmupLocked"),
    repinTitle: t("edit.repinTitle"),
    repinBody: t.raw("edit.repinBody") as string,
    sampleHasData: t("edit.sampleHasData"),
    removeRepinTitle: t("edit.removeRepinTitle"),
    removeRepinBody: t.raw("edit.removeRepinBody") as string,
    removeRepinConfirm: t("edit.removeRepinConfirm"),
    referenceRepinBlocked: t("edit.referenceRepinBlocked"),
    formatLockedStarted: t("edit.formatLockedStarted"),
    invalidWarmup: t("newForm.errors.invalid_warmup"),
    picker: {
      useExisting: tcoffee("picker.useExisting"),
      title: tcoffee("picker.title"),
      searchPlaceholder: tcoffee("picker.searchPlaceholder"),
      mine: tcoffee("picker.mine"),
      shared: tcoffee("picker.shared"),
      public: tcoffee("picker.public"),
      empty: tcoffee("picker.empty"),
    },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("edit.title")}
        description={t("edit.subtitle")}
        backHref={`/${locale}/app/sessions`}
        backLabel={t("edit.backToSessions")}
      />

      <EditSessionForm
        locale={locale}
        sessionId={session.id}
        usableCoffees={usableCoffees}
        initial={{
          name: session.name,
          date: session.date.toISOString().slice(0, 10),
          objective: session.objective ?? "",
          format: session.format as "descriptive" | "affective" | "combined",
          cupsPerSample: session.cupsPerSample,
          isGroup: session.isGroup,
          groupId: session.groupId,
          referenceSampleId: session.referenceSampleId,
          referenceMode: normalizeReferenceMode(session.referenceMode),
          // Stored as the END of the day the owner picked IN THEIR ZONE, so the
          // read-back uses that zone (null = UTC for legacy rows).
          closesAt: session.closesAt ? dateInZone(session.closesAt, session.closesAtZone) : "",
          warmupExerciseId: session.warmupExerciseId,
          started: session.startedAt !== null,
          closed: session.status === "closed",
        }}
        samples={session.samples.map((s) => ({
          id: s.id,
          label: s.label,
          evalCount: s._count.evaluations,
          referenceRank: s.referenceRank,
        }))}
        groups={groups}
        evalCount={evalCount}
        translations={translations}
      />
    </div>
  );
}
