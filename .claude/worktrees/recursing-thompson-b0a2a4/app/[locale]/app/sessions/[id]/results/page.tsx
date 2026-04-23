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

  const session = await prisma.cuppingSession.findFirst({
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
        },
      },
    },
  });

  if (!session) notFound();

  const isOwner = session.createdBy === user.id;
  const canViewGroup =
    session.isGroup && (session.status === "closed" || isOwner);

  const tCommunity = await getTranslations("community");

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
      }}
    />
  );
}
