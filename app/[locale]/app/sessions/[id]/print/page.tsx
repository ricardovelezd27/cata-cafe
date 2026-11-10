import { notFound } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { orderReferencesFirst } from "@/lib/referenceRules";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { buildInviteUrl } from "@/lib/inviteUrl";
import { sheetSampleIdentity, sheetSampleRecords } from "@/lib/pdf/sheetSource";
import { PrintClient } from "./PrintClient";

export default async function PrintPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireAppUser(locale, `/${locale}/app/sessions/${id}/print`);

  // Super-admin god mode (read-only): any session, rendered from the OWNER's
  // evaluation — same lens as the cva-pdf route. The invite QR below stays
  // gated on the REAL owner.
  const isSuperAdmin = isSuperAdminEmail(user.email);
  const adminTarget = isSuperAdmin
    ? await prisma.cuppingSession.findUnique({ where: { id }, select: { createdBy: true } })
    : null;
  const viewAsId =
    adminTarget && adminTarget.createdBy !== user.id ? adminTarget.createdBy : user.id;

  const [session, profile] = await Promise.all([
    prisma.cuppingSession.findFirst({
      where: isSuperAdmin
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
            coffee: { select: { name: true, deletedAt: true, roastLevel: true } },
            evaluations: { where: { cupperId: viewAsId } },
            physical: true,
            extrinsic: true,
          },
        },
      },
    }),
    prisma.profile.findUnique({ where: { id: viewAsId }, select: { displayName: true } }),
  ]);

  if (!session) notFound();

  const isOwner = session.createdBy === user.id;
  // Sheet lens: whose evaluation (and owner-only data) the sheet renders.
  const ownerView = session.createdBy === viewAsId;

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
  const tc = await getTranslations("common");
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
        ownerView,
        samples: orderReferencesFirst(session.samples).map((s) => {
          const ev = s.evaluations[0];
          return {
            id: s.id,
            label: s.label,
            revealed: s.revealed,
            ...sheetSampleIdentity(s, tc("coffeeDeleted")),
            isReference: s.referenceRank != null,
            referenceRank: s.referenceRank ?? null,
            descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
            affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
            combined: (ev?.combinedData as Record<string, unknown>) ?? {},
            ...sheetSampleRecords(s, ownerView),
          };
        }),
      }}
    />
  );
}
