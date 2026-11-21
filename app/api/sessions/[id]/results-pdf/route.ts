// GET route: the "results of the page" PDF (package OR-E part 3): the "Por café"
// view of the results page for the CURRENT user, with the page's own look.
// Authorization mirrors participant-summary (creator OR participant, super-admin
// read-only via the owner's lens) PLUS the results page's group-visibility gate
// (viewerMayReadGroupResults), so the file can never hold what the page hides.
// What each part shows is the page's own models (lib/reports/resultsPdf.ts).

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { deletedCoffeeLabel } from "@/lib/coffeeAnonymize";
import { wheelFamilyLabels, wheelNodeLabels } from "@/lib/flavorWheelLabels";
import { viewerMayReadGroupResults } from "@/lib/sessionState";
import { buildCardsStrings } from "@/components/results/cardsStrings";
import { buildOverviewStrings } from "@/components/results/overviewStrings";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { loadSessionReportSource } from "@/lib/reports/sessionReportData";
import { buildResultsPdfModel } from "@/lib/reports/resultsPdf";
import { ResultsDocument, type ResultsPdfStrings } from "@/lib/pdf/ResultsDocument";
import { CVA_TEXT } from "@/lib/pdf/cvaFormData";
import { pdfDisposition } from "@/lib/pdf/disposition";
import { slug, dateSlug } from "@/lib/pdf/filename";
import { pdfFailureResponse } from "@/lib/pdf/routeFailure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_READY = {
  es: "Los resultados del grupo aún no están disponibles",
  en: "Group results are not available yet",
} as const;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
      : { id, OR: [{ createdBy: user.id }, { participants: { some: { userId: user.id } } }] },
    select: { id: true, name: true, createdBy: true, isGroup: true, status: true, closesAt: true },
  });
  if (!session) return new Response("Not found", { status: 404 });

  // Admin viewing someone else's session: owner-equivalent read, rendered from
  // the owner's lens (same as the results page and the other report routes).
  const isOwner = session.createdBy === user.id;
  const isAdminViewer = isSuperAdmin && !isOwner;
  const ownerRead = isOwner || isAdminViewer;

  // The same single call site as the results page.
  const canViewGroup = viewerMayReadGroupResults(session, { ownerRead });
  if (session.isGroup && !canViewGroup) {
    return new Response(NOT_READY[locale], {
      status: 409,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  let buffer: Buffer;
  try {
    const [tResults, tCups, tAttr, tGroup] = await Promise.all([
      getTranslations({ locale, namespace: "results" }),
      getTranslations({ locale, namespace: "cupping.cups" }),
      getTranslations({ locale, namespace: "attributes" }),
      getTranslations({ locale, namespace: "group" }),
    ]);
    const source = await loadSessionReportSource(id, { locale });
    if (!source) return new Response("Not found", { status: 404 });

    const model = buildResultsPdfModel(source, {
      viewerId: user.id,
      viewAsId: isAdminViewer ? session.createdBy : user.id,
      isAdminViewer,
      canViewGroup,
      coffeeDeleted: deletedCoffeeLabel(locale),
    });

    const dateOf = (d: Date, options: Intl.DateTimeFormatOptions) =>
      d.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", options);
    const strings: ResultsPdfStrings = {
      facts: [
        `${tResults("overview.pageKind")} · ${dateOf(source.session.date, { year: "numeric", month: "long", day: "numeric" })}`,
        session.isGroup && source.session.closedAt
          ? tResults("closedOn", { date: dateOf(source.session.closedAt, { dateStyle: "medium" }) })
          : null,
      ]
        .filter((part): part is string => typeof part === "string" && part.length > 0)
        .join(" · "),
      overview: buildOverviewStrings(tResults, {
        rankHelp: tResults("dashboard.rankHelp"),
        communityPending: tResults("communityPending"),
        defectTypes: {
          moldy: tCups("types.moldy"),
          phenolic: tCups("types.phenolic"),
          potato: tCups("types.potato"),
        },
      }),
      cards: buildCardsStrings(tResults, {
        inProgress: tResults("table.inProgress"),
        notEvaluated: tResults("table.notEvaluated"),
        inProgressLegend: tResults("table.inProgressLegend"),
        partialLabel: tResults("partial.label"),
        reveal: tGroup("reveal"),
        revealed: tGroup("revealed"),
        referenceBadge: tResults("referenceBadge"),
        attributes: Object.fromEntries(
          AFFECTIVE_ATTRIBUTES.map((a) => [a.id, tAttr(a.id as Parameters<typeof tAttr>[0])]),
        ),
      }),
      parts: buildResultsPartsStrings(tResults),
      familyLabels: wheelFamilyLabels(locale),
      nodeLabels: wheelNodeLabels(locale),
      attribution: CVA_TEXT[locale].attribution,
    };
    buffer = await renderToBuffer(ResultsDocument({ model, strings, locale }));
  } catch (err) {
    return pdfFailureResponse("results-pdf", { sessionId: id }, locale, err);
  }

  const filename = `${locale === "en" ? "results" : "resultados"}_${slug(session.name) || "sesion"}_${dateSlug()}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": pdfDisposition(inline, filename),
      "Cache-Control": "no-store",
    },
  });
}
