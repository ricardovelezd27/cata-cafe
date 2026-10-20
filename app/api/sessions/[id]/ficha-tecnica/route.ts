// GET route: OWNER-tier "Ficha tecnica" PDF (per-sample sheets + owner appendix
// + teacher notes). Authorization: the session CREATOR, or the super-admin
// (read-only, rendered as the owner). Everyone else — participants included —
// gets 404 (not 403) so the route does not leak that the session exists.

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { deletedCoffeeLabel } from "@/lib/coffeeAnonymize";
import { loadSessionReportSource } from "@/lib/reports/sessionReportData";
import { buildFichaTecnica } from "@/lib/reports/fichaTecnica";
import { buildTeacherNotes } from "@/lib/reports/teacherNotes";
import { FichaTecnicaDocument } from "@/lib/pdf/FichaTecnicaDocument";
import { slug } from "@/lib/pdf/filename";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    where: isSuperAdmin ? { id } : { id, createdBy: user.id },
    select: { id: true, name: true },
  });
  if (!session) return new Response("Not found", { status: 404 });

  const [tBlocks, tResults] = await Promise.all([
    getTranslations({ locale, namespace: "blocks" }),
    getTranslations({ locale, namespace: "results" }),
  ]);

  const source = await loadSessionReportSource(id, {
    locale,
    blockLabel: (blockId) => tBlocks(blockId as Parameters<typeof tBlocks>[0]),
  });
  if (!source) return new Response("Not found", { status: 404 });

  const model = buildFichaTecnica(source, {
    tier: "owner",
    locale,
    labels: {
      coffeeDeleted: deletedCoffeeLabel(locale),
      soloTopDescriptors: tResults("soloTopDescriptors"),
    },
  });
  const teacherNotes = buildTeacherNotes(source);

  const buffer = await renderToBuffer(
    FichaTecnicaDocument({ model, teacherNotes, locale }),
  );

  const filename = `ficha_${slug(session.name) || "sesion"}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
