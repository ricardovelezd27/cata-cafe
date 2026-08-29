// GET route: server-rendered CVA-form PDF for the CURRENT user's own evaluation
// of a session. Auth + authorization mirror the print page
// (app/[locale]/app/sessions/[id]/print/page.tsx): creator OR participant, and
// each user only ever sees their own evaluation (evaluations scoped to
// cupperId). react-pdf needs Node APIs, so this handler runs on the Node runtime.

import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { CvaFormDocument, type CvaDocumentProps } from "@/lib/pdf/CvaFormDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const localeParam = request.nextUrl.searchParams.get("locale");
  const locale: "es" | "en" = localeParam === "en" ? "en" : "es";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Super-admin god mode (read-only): any session, rendered from the OWNER's
  // evaluation — mirrors the results page's viewAs behavior.
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
            OR: [{ createdBy: user.id }, { participants: { some: { userId: user.id } } }],
          },
      include: {
        samples: {
          orderBy: { position: "asc" },
          include: {
            coffee: { select: { name: true } },
            evaluations: { where: { cupperId: viewAsId } },
            physical: true,
            extrinsic: true,
          },
        },
      },
    }),
    prisma.profile.findUnique({
      // viewAsId, so the admin variant labels the sheet with the owner whose
      // evaluation it actually renders.
      where: { id: viewAsId },
      select: { displayName: true },
    }),
  ]);

  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const dateStr = session.date.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const props: CvaDocumentProps = {
    sessionName: session.name,
    date: dateStr,
    cupperName: profile?.displayName ?? "",
    purpose: session.objective ?? "",
    cupsPerSample: session.cupsPerSample,
    format: session.format,
    locale,
    samples: session.samples.map((sample) => {
      const ev = sample.evaluations[0];
      return {
        label: sample.label,
        revealed: sample.revealed,
        coffeeName: sample.coffee?.name ?? null,
        descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
        affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
        combined: (ev?.combinedData as Record<string, unknown>) ?? {},
        physical: (sample.physical?.data as Record<string, unknown>) ?? {},
        extrinsic: (sample.extrinsic?.data as Record<string, unknown>) ?? {},
      };
    }),
  };

  const buffer = await renderToBuffer(CvaFormDocument(props));

  const firstLabel = session.samples[0]?.label ?? "";
  const lastLabel = session.samples[session.samples.length - 1]?.label ?? "";
  const range =
    session.samples.length <= 1 ? firstLabel : `${firstLabel}-${lastLabel}`;
  const filename = `cva_${slug(session.name)}${range ? `_${slug(range)}` : ""}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** ASCII-safe filename fragment (Content-Disposition filenames choke on accents). */
function slug(input: string): string {
  // NFD splits accented letters into base + combining mark; the alnum filter
  // then drops the marks, so "Café" → "cafe" without a fragile combining-range.
  return input
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .toLowerCase();
}
