// GET route: coffee-scoped "Ficha tecnica" PDF. Authorization mirrors the coffee
// profile page: the coffee must be usable by the viewer (owned / public / shared
// with them) and not anonymized — otherwise 404 (no existence leak). The
// cross-session community block is only included when the viewer is the owner
// or the owner published the results (super-admin: read-only, like the page).

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { usableCoffeeWhere } from "@/lib/coffeeAccess";
import { computeCoffeeAggregate } from "@/lib/coffeeAggregate";
import { loadCoffeeAggregateSamples } from "@/lib/coffees/aggregateSamples";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { CoffeeFichaDocument, type CoffeeFichaModel } from "@/lib/pdf/CoffeeFichaDocument";
import { slug } from "@/lib/pdf/filename";
import { logError, errorMessage } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SERVER_ERROR = {
  es: "No se pudo generar el PDF. Inténtalo de nuevo en unos minutos.",
  en: "The PDF could not be generated. Please try again in a few minutes.",
} as const;

function failureResponse(
  where: string,
  ids: { sessionId?: string; coffeeId?: string },
  locale: "es" | "en",
  err: unknown,
): Response {
  const digest = Math.random().toString(36).slice(2, 10);
  logError({ where, code: "pdf_render_failed", digest, locale, ...ids, message: errorMessage(err) });
  return new Response(`${SERVER_ERROR[locale]} (${digest})`, {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

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
  // Guests (QR walk-ups) never reach the coffees area: same as the page's gate.
  if (user.is_anonymous) return new Response("Not found", { status: 404 });

  const isAdmin = isSuperAdminEmail(user.email);
  const coffee = await prisma.coffee.findFirst({
    where: isAdmin ? { id, deletedAt: null } : { id, AND: [usableCoffeeWhere(user.id)] },
  });
  if (!coffee || coffee.deletedAt) return new Response("Not found", { status: 404 });

  let buffer: Buffer;
  try {
    const isOwner = coffee.createdBy === user.id;
    const showResults = isOwner || coffee.resultsPublished || isAdmin;

    let results: CoffeeFichaModel["results"] = null;
    if (showResults) {
      const aggregate = computeCoffeeAggregate(await loadCoffeeAggregateSamples(id));
      results = {
        sessionsCount: aggregate.sessionsCount,
        evaluationsCount: aggregate.evaluationsCount,
        affective: {
          communityScore: aggregate.communityAvg,
          sd: null,
          included: aggregate.evaluationsCount,
          submitted: aggregate.evaluationsCount,
          attrAverages: AFFECTIVE_ATTRIBUTES.map((a) => ({
            id: a.id,
            label: a.label,
            value: aggregate.attrAverages[a.label] ?? null,
          })),
          uniformityPenalty: 0,
          defectPenalty: 0,
        },
        sessions: aggregate.sessionRows.map((r) => ({
          name: r.sessionName,
          date: r.sessionDate,
          score: r.communityScore,
        })),
      };
    }

    const model: CoffeeFichaModel = {
      identity: {
        label: coffee.name,
        isReference: false,
        revealed: true,
        coffeeName: null,
        code: coffee.code,
        roastLevel: coffee.roastLevel,
        coffee: {
          country: coffee.country,
          region: coffee.region,
          farm: coffee.farm,
          producer: coffee.producer,
          variety: coffee.variety,
          processType: coffee.processType,
          altitude: coffee.altitude,
        },
      },
      // Only the fields IdentityBlock does not already print (it shows origin facts).
      extrinsic: {
        ext_especie_val: coffee.species ?? "",
        ext_cosecha_val: coffee.harvestYear ?? "",
        ext_certs: coffee.certifications,
      },
      // Private owner text: never printed for other viewers (the profile page omits it too).
      notes: isOwner ? coffee.notes : null,
      results,
    };

    buffer = await renderToBuffer(CoffeeFichaDocument({ model, locale }));
  } catch (err) {
    return failureResponse("coffee-ficha", { coffeeId: id }, locale, err);
  }

  const filename = `ficha_cafe_${slug(coffee.name) || "cafe"}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
