import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ResultsClient } from "./ResultsClient";

export default async function ResultsPage({
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

  const [session, submittedCupperCount] = await Promise.all([
    prisma.cuppingSession.findFirst({
      where: {
        id,
        OR: [
          { createdBy: user.id },
          { participants: { some: { userId: user.id } } },
        ],
      },
      include: {
        samples: {
          orderBy: { position: "asc" },
          include: {
            evaluations: { where: { cupperId: user.id } },
            physical: true,
            extrinsic: true,
            aggregateScore: true,
            coffee: {
              select: {
                name: true,
                country: true,
                region: true,
                producer: true,
                variety: true,
                altitude: true,
                roastLevel: true,
              },
            },
          },
        },
        participants: { select: { userId: true } },
      },
    }),
    prisma.evaluation
      .groupBy({
        by: ["cupperId"],
        where: { sessionSample: { sessionId: id }, isDraft: false },
      })
      .then((rows) => rows.length),
  ]);

  if (!session) notFound();

  const isOwner = session.createdBy === user.id;

  // Master-only: every cupper's submitted evaluation, for the Individual view.
  // Gated by isOwner so non-owners never receive other participants' data.
  type ParticipantResult = {
    id: string;
    name: string;
    samples: {
      id: string;
      label: string;
      revealed: boolean;
      coffee: { name: string } | null;
      descriptive: Record<string, unknown>;
      affective: Record<string, unknown>;
      combined: Record<string, unknown>;
    }[];
  };
  let participantResults: ParticipantResult[] | null = null;
  if (isOwner && session.isGroup) {
    const evals = await prisma.evaluation.findMany({
      where: { sessionSample: { sessionId: id }, isDraft: false },
      select: {
        cupperId: true,
        sessionSampleId: true,
        descriptiveData: true,
        affectiveData: true,
        combinedData: true,
        cupper: { select: { id: true, displayName: true } },
      },
    });

    // Index evaluations by cupper, then by sample.
    const byCupper = new Map<
      string,
      { name: string; bySample: Map<string, (typeof evals)[number]> }
    >();
    for (const ev of evals) {
      let entry = byCupper.get(ev.cupperId);
      if (!entry) {
        entry = { name: ev.cupper.displayName, bySample: new Map() };
        byCupper.set(ev.cupperId, entry);
      }
      entry.bySample.set(ev.sessionSampleId, ev);
    }

    participantResults = [...byCupper.entries()]
      .map(([cupperId, entry]) => ({
        id: cupperId,
        name: entry.name,
        samples: session.samples.map((s) => {
          const ev = entry.bySample.get(s.id);
          return {
            id: s.id,
            label: s.label,
            revealed: s.revealed,
            coffee: s.revealed && s.coffee ? { name: s.coffee.name } : null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
          };
        }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale === "es" ? "es" : "en"));
  }

  const totalParticipants = session.participants.length;
  const allSubmitted = totalParticipants > 0 && submittedCupperCount >= totalParticipants;
  const sessionExpired = session.closesAt ? session.closesAt < new Date() : false;
  const canViewGroup =
    session.isGroup &&
    (isOwner || session.status === "closed" || allSubmitted || sessionExpired);

  const tCommunity = await getTranslations("community");
  const tg = await getTranslations("group");

  const dateStr = session.date.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <ResultsClient
      locale={locale}
      isOwner={isOwner}
      isGroup={session.isGroup}
      sessionStatus={session.status}
      canViewGroup={canViewGroup}
      participants={participantResults}
      session={{
        id: session.id,
        name: session.name,
        format: session.format,
        cupsPerSample: session.cupsPerSample,
        date: dateStr,
        samples: session.samples.map((s) => {
          const ev = s.evaluations[0];
          const agg = s.aggregateScore;
          return {
            id: s.id,
            label: s.label,
            revealed: s.revealed,
            coffee: s.revealed && s.coffee ? s.coffee : null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            physical: (s.physical?.data as Record<string, unknown>) ?? {},
            extrinsic: (s.extrinsic?.data as Record<string, unknown>) ?? {},
            aggregateScore: agg
              ? {
                  communityScore: agg.communityScore,
                  avgRawScore: agg.avgRawScore,
                  participantCount: agg.participantCount,
                  totalCups: agg.totalCups,
                  totalNonUniform: agg.totalNonUniform,
                  totalDefective: agg.totalDefective,
                  uniformityPenalty: agg.uniformityPenalty,
                  defectPenalty: agg.defectPenalty,
                  attrAverages: (agg.attrAverages as Record<string, number>) ?? {},
                }
              : null,
          };
        }),
      }}
      translations={{
        myResults: locale === "es" ? "Mis resultados" : "My results",
        groupResults: locale === "es" ? "Resultados grupales" : "Group results",
        communityScore: tCommunity("score"),
        avgRaw: tCommunity("avgRaw"),
        participantCount: tCommunity("participantCount", { n: 0 }).replace("0", ""),
        radarChart: tCommunity("radarChart"),
        myScore: tCommunity("myScore"),
        delta: tCommunity("delta"),
        noGroupData: tCommunity("noGroupData"),
        reveal: tg("reveal"),
        revealed: tg("revealed"),
      }}
    />
  );
}
