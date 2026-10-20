// GET route: server-rendered "Resumen del participante" PDF — the CURRENT
// user's numbers against the anonymous group. Authorization mirrors cva-pdf
// (creator OR participant, super-admin read-only via the owner's lens) PLUS the
// results page's group-visibility gate (canViewGroupResults), so the PDF can
// never reveal what the results page hides.

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { deletedCoffeeLabel } from "@/lib/coffeeAnonymize";
import { canViewGroupResults } from "@/lib/sessionState";
import { loadSessionReportSource } from "@/lib/reports/sessionReportData";
import { buildParticipantSummary } from "@/lib/reports/participantSummary";
import { ParticipantSummaryDocument } from "@/lib/pdf/ParticipantSummaryDocument";
import { slug } from "@/lib/pdf/filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_READY = {
  es: "Los resultados del grupo aún no están disponibles",
  en: "Group results are not available yet",
} as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const locale: "es" | "en" = sp.get("locale") === "en" ? "en" : "es";
  const inline = sp.get("inline") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const isSuperAdmin = isSuperAdminEmail(user.email);
  const session = await prisma.cuppingSession.findFirst({
    where: isSuperAdmin
      ? { id }
      : {
          id,
          OR: [
            { createdBy: user.id },
            { participants: { some: { userId: user.id } } },
          ],
        },
    select: {
      id: true,
      name: true,
      createdBy: true,
      isGroup: true,
      status: true,
      closesAt: true,
      participants: { select: { userId: true } },
    },
  });
  if (!session) return new Response("Not found", { status: 404 });

  // Admin viewing someone else's session: owner-equivalent read, rendered from
  // the owner's lens (same as cva-pdf / results page).
  const isOwner = session.createdBy === user.id;
  const isAdminViewer = isSuperAdmin && !isOwner;
  const ownerRead = isOwner || isAdminViewer;
  const viewAsId = isAdminViewer ? session.createdBy : user.id;

  if (session.isGroup) {
    const submittedCuppers = await prisma.evaluation
      .groupBy({
        by: ["cupperId"],
        where: { sessionSample: { sessionId: id }, isDraft: false },
      })
      .then((rows) => rows.length);
    const total = session.participants.length;
    const allSubmitted = total > 0 && submittedCuppers >= total;
    const sessionExpired = session.closesAt
      ? session.closesAt < new Date()
      : false;
    const canView = canViewGroupResults({
      isGroup: true,
      ownerRead,
      status: session.status,
      allSubmitted,
      sessionExpired,
    });
    if (!canView) {
      return new Response(NOT_READY[locale], {
        status: 409,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  }

  const [tBlocks, tResults] = await Promise.all([
    getTranslations({ locale, namespace: "blocks" }),
    getTranslations({ locale, namespace: "results" }),
  ]);
  const labels = {
    coffeeDeleted: deletedCoffeeLabel(locale),
    soloTopDescriptors: tResults("dashboard.soloTopDescriptors"),
  };

  const source = await loadSessionReportSource(id, {
    locale,
    blockLabel: (blockId) => tBlocks(blockId as Parameters<typeof tBlocks>[0]),
  });
  if (!source) return new Response("Not found", { status: 404 });

  const model = buildParticipantSummary(source, {
    viewerId: viewAsId,
    locale,
    labels,
  });
  const buffer = await renderToBuffer(
    ParticipantSummaryDocument({ model, locale }),
  );

  const filename = `${locale === "en" ? "summary" : "resumen"}_${slug(session.name) || "sesion"}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
