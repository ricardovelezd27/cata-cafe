import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const session = await prisma.cuppingSession.findUnique({
    where: { id },
    include: {
      samples: {
        orderBy: { position: "asc" },
        include: { _count: { select: { evaluations: true } } },
      },
    },
  });

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

  const t = await getTranslations("session");
  const tc = await getTranslations("common");

  const translations: EditSessionFormTranslations = {
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
        initial={{
          name: session.name,
          date: session.date.toISOString().slice(0, 10),
          objective: session.objective ?? "",
          format: session.format as "descriptive" | "affective" | "combined",
          cupsPerSample: session.cupsPerSample,
          isGroup: session.isGroup,
          groupId: session.groupId,
        }}
        samples={session.samples.map((s) => ({
          id: s.id,
          label: s.label,
          evalCount: s._count.evaluations,
        }))}
        groups={groups}
        evalCount={evalCount}
        translations={translations}
      />
    </div>
  );
}
