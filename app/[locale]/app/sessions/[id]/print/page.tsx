import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { buildInviteUrl } from "@/lib/inviteUrl";
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
      // Super-admin god mode: read-only access to any session's print sheet
      // (the invite QR below stays owner-gated).
      where: isSuperAdminEmail(user.email)
        ? { id }
        : {
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

  const isOwner = session.createdBy === user.id;

  // Only the owner of a group session gets a join QR on the print sheet, and
  // only if a valid invite already exists — this page never mints one.
  let inviteUrl: string | null = null;
  if (session.isGroup && isOwner) {
    const invite = await prisma.sessionInvite.findFirst({
      where: {
        sessionId: session.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });
    const isUsable =
      invite && (invite.maxUses === null || invite.useCount < invite.maxUses);
    if (isUsable) {
      const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      inviteUrl = buildInviteUrl(siteOrigin, locale, invite.token);
    }
  }

  const tg = await getTranslations("group");
  const scanToJoinLabel = tg("scanToJoin");

  const dateStr = session.date.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <PrintClient
      locale={locale}
      inviteUrl={inviteUrl}
      scanToJoinLabel={scanToJoinLabel}
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
            revealed: s.revealed,
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
