import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { PrintClient } from "./PrintClient";

export default async function PrintPage({
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

  const [session, profile] = await Promise.all([
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
            coffee: { select: { name: true } },
            evaluations: { where: { cupperId: user.id } },
            physical: true,
            extrinsic: true,
          },
        },
      },
    }),
    prisma.profile.findUnique({ where: { id: user.id }, select: { displayName: true } }),
  ]);

  if (!session) notFound();

  const dateStr = session.date.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <PrintClient
      session={{
        id: session.id,
        name: session.name,
        format: session.format,
        cupsPerSample: session.cupsPerSample,
        date: dateStr,
        objective: session.objective,
        cupperName: profile?.displayName ?? "",
        samples: session.samples.map((s) => {
          const ev = s.evaluations[0];
          return {
            id: s.id,
            label: s.label,
            coffeeName: s.coffee?.name ?? null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            physical: (s.physical?.data as Record<string, unknown>) ?? {},
            extrinsic: (s.extrinsic?.data as Record<string, unknown>) ?? {},
          };
        }),
      }}
    />
  );
}
