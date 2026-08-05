// Server-only. On group-session close, emails every participant:
//   1. their OWN individual CVA-form PDF (lib/pdf/CvaFormDocument), and
//   2. one shared, ANONYMOUS group-summary PDF (lib/pdf/GroupSummaryDocument),
//      built from the same aggregation the results page uses.
//
// Called by closeSession (app/actions/community.ts) AFTER the status update and
// syncCoffeeHistory. Email work must NEVER fail or block the close: the caller
// wraps this in try/catch and this function additionally isolates every send
// with Promise.allSettled. NEVER import from a client component — it uses the
// service-role admin client (email lookup) and @react-pdf/renderer (Node only).

import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, escapeHtml } from "@/lib/email";
import { CvaFormDocument, type CvaDocumentProps } from "@/lib/pdf/CvaFormDocument";
import {
  GroupSummaryDocument,
  type GroupSummarySample,
} from "@/lib/pdf/GroupSummaryDocument";
import { computeSampleBlockFrequencies } from "@/lib/resultsAggregation";
import { computeGroupAggregate } from "@/lib/scoring";
import { PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import esMessages from "@/messages/es.json";
import enMessages from "@/messages/en.json";

type Locale = "es" | "en";

export type CloseEmailSummary = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

const EMAIL_TEXT: Record<Locale, { subject: (name: string) => string; body: (args: { name: string; date: string }) => string; individualFile: string; summaryFile: string }> = {
  es: {
    subject: (name) => `Resultados — ${name}`,
    individualFile: "formulario",
    summaryFile: "resumen_grupal",
    body: ({ name, date }) => `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
        <h2 style="color:#3D5A3E; margin:0 0 8px;">Cata Café</h2>
        <p>Hola,</p>
        <p>La sesión de catación <strong>${escapeHtml(name)}</strong>${date ? ` (${escapeHtml(date)})` : ""} se ha cerrado.</p>
        <p>Adjuntamos dos documentos:</p>
        <ul>
          <li><strong>Tu formulario CVA individual</strong> — tu propia evaluación de las muestras.</li>
          <li><strong>Resumen grupal</strong> — un resumen estadístico anónimo de la sesión.</li>
        </ul>
        <p style="color:#7a7168; font-size:13px;">Gracias por participar.</p>
      </div>`,
  },
  en: {
    subject: (name) => `Results — ${name}`,
    individualFile: "form",
    summaryFile: "group_summary",
    body: ({ name, date }) => `
      <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5;">
        <h2 style="color:#3D5A3E; margin:0 0 8px;">Cata Café</h2>
        <p>Hello,</p>
        <p>The cupping session <strong>${escapeHtml(name)}</strong>${date ? ` (${escapeHtml(date)})` : ""} has been closed.</p>
        <p>Attached you'll find two documents:</p>
        <ul>
          <li><strong>Your individual CVA form</strong> — your own evaluation of the samples.</li>
          <li><strong>Group summary</strong> — an anonymous statistical summary of the session.</li>
        </ul>
        <p style="color:#7a7168; font-size:13px;">Thank you for taking part.</p>
      </div>`,
  },
};

/** ASCII-safe filename fragment (mirrors the cva-pdf route's slug). */
function slug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)
    .toLowerCase();
}

/**
 * Send the close emails for a group session. Returns a summary of how many
 * emails were sent / skipped / failed. Never throws for per-recipient problems
 * (email resolution, PDF render, send) — those are isolated per participant and
 * counted. A thrown error only escapes for a total failure to load the session,
 * which the caller (closeSession) still catches so the close itself is safe.
 *
 * Locale is resolved PER RECIPIENT from their Profile.preferredLang (batch
 * fetched below) — every participant gets subject/body/filenames and a
 * CvaFormDocument in their own language, not the session's. The `locale`
 * param is now only a fallback for the rare case a participant's Profile row
 * is missing entirely; the existing call site (community.ts closeSession)
 * doesn't pass it, so it still defaults to "es".
 */
export async function sendCloseEmails(
  sessionId: string,
  locale: Locale = "es",
): Promise<CloseEmailSummary> {
  const empty: CloseEmailSummary = { attempted: 0, sent: 0, skipped: 0, failed: 0 };

  const session = await prisma.cuppingSession.findUnique({
    where: { id: sessionId },
    include: {
      samples: {
        orderBy: { position: "asc" },
        include: {
          coffee: { select: { name: true } },
          physical: true,
          extrinsic: true,
        },
      },
      participants: { select: { userId: true, excludedFromResults: true } },
    },
  });

  if (!session || !session.isGroup) return empty;

  // Every submitted evaluation for the session (used for both the group
  // aggregation and each participant's own CVA PDF).
  const evals = await prisma.evaluation.findMany({
    where: { sessionSample: { sessionId }, isDraft: false },
    select: {
      cupperId: true,
      sessionSampleId: true,
      descriptiveData: true,
      affectiveData: true,
      combinedData: true,
      nonUniformCups: true,
      defectiveCups: true,
    },
  });

  const excludedUserIds = new Set(
    session.participants.filter((p) => p.excludedFromResults).map((p) => p.userId),
  );

  // ── Per-sample community score (complete-only, excluded-free) — same as page ──
  // Locale-independent — computed once regardless of how many locales the
  // recipients need.
  const aggBySample = new Map<string, ReturnType<typeof computeGroupAggregate>>();
  {
    const bySample = new Map<string, (typeof evals)[number][]>();
    for (const ev of evals) {
      if (excludedUserIds.has(ev.cupperId)) continue;
      const list = bySample.get(ev.sessionSampleId);
      if (list) list.push(ev);
      else bySample.set(ev.sessionSampleId, [ev]);
    }
    for (const [sampleId, list] of bySample) {
      aggBySample.set(
        sampleId,
        computeGroupAggregate(
          list.map((ev) => ({
            data: (session.format === "combined"
              ? ev.combinedData
              : ev.affectiveData) as Record<string, unknown>,
            nonUniformCups: ev.nonUniformCups,
            defectiveCups: ev.defectiveCups,
          })),
          session.cupsPerSample,
        ),
      );
    }
  }

  const evalsByCupper = new Map<string, Map<string, (typeof evals)[number]>>();
  for (const ev of evals) {
    let m = evalsByCupper.get(ev.cupperId);
    if (!m) {
      m = new Map();
      evalsByCupper.set(ev.cupperId, m);
    }
    m.set(ev.sessionSampleId, ev);
  }

  // Batch-fetch every participant's Profile once (displayName + preferredLang)
  // instead of one query per recipient inside the send loop.
  const participantIds = session.participants.map((p) => p.userId);
  const profiles =
    participantIds.length > 0
      ? await prisma.profile.findMany({
          where: { id: { in: participantIds } },
          select: { id: true, displayName: true, preferredLang: true },
        })
      : [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  function resolveRecipientLocale(userId: string): Locale {
    const pref = profileById.get(userId)?.preferredLang;
    if (pref === "en") return "en";
    if (pref === "es") return "es";
    return locale; // Profile row missing entirely — fall back to the default param.
  }

  const localesNeeded = new Set<Locale>(
    session.participants.map((p) => resolveRecipientLocale(p.userId)),
  );

  // ── Per-locale assets (date string, anonymous block sentences, group-summary
  // PDF) — memoized so each locale (es/en, at most 2) is only built once no
  // matter how many recipients share it. ──
  type LocaleAssets = { dateStr: string; summaryBuffer: Buffer };
  const assetsByLocale = new Map<Locale, LocaleAssets>();

  for (const loc of localesNeeded) {
    const dateStr = session.date.toLocaleDateString(loc === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const messages = loc === "en" ? enMessages : esMessages;
    const blockLabels = messages.blocks as Record<string, string>;
    const blockLabel = (blockId: string) => blockLabels[blockId] ?? blockId;

    const freq = computeSampleBlockFrequencies({
      format: session.format,
      samples: session.samples.map((s) => ({ id: s.id, label: s.label })),
      evals: evals.map((ev) => ({
        cupperId: ev.cupperId,
        sessionSampleId: ev.sessionSampleId,
        descriptiveData: ev.descriptiveData,
        combinedData: ev.combinedData,
      })),
      excludedUserIds,
      blockLabel,
      locale: loc,
    });
    const freqBySample = new Map(freq?.map((f) => [f.sampleId, f]) ?? []);

    const summarySamples: GroupSummarySample[] = session.samples.map((s) => {
      const agg = aggBySample.get(s.id);
      const f = freqBySample.get(s.id);
      // Sentences in canonical block order; drop nulls at render time.
      const sentences = PERCEPTUAL_BLOCKS.map((b) => ({
        blockId: b.id,
        text: f?.summary[b.id] ?? null,
      }));
      return {
        label: s.label,
        coffeeName: s.revealed ? (s.coffee?.name ?? null) : null,
        communityScore: agg?.communityScore ?? null,
        evaluators: f?.totalEvaluators ?? 0,
        sentences,
      };
    });

    const summaryBuffer = await renderToBuffer(
      GroupSummaryDocument({
        sessionName: session.name,
        date: dateStr,
        participantCount: session.participants.length,
        locale: loc,
        samples: summarySamples,
      }),
    );

    assetsByLocale.set(loc, { dateStr, summaryBuffer });
  }

  const admin = createAdminClient();
  const nameSlug = slug(session.name);

  // Every participant RECEIVES email (including excluded-from-results cuppers —
  // they still get their own PDF; the group summary is the same for everyone).
  const recipients = session.participants;

  const results = await Promise.allSettled(
    recipients.map(async (p) => {
      // Resolve the recipient's email via the service-role admin client — the
      // Profile model has no email column.
      const { data, error } = await admin.auth.admin.getUserById(p.userId);
      const email = data?.user?.email;
      if (error || !email) {
        console.warn(
          `[closeEmail] could not resolve email for participant ${p.userId} in session ${sessionId}: ${error?.message ?? "no email"}`,
        );
        return { status: "failed" as const };
      }

      const recipientLocale = resolveRecipientLocale(p.userId);
      const assets = assetsByLocale.get(recipientLocale)!;
      const text = EMAIL_TEXT[recipientLocale];
      const profile = profileById.get(p.userId);

      // This participant's own CVA PDF (per-cupper data, mirroring cva-pdf route).
      const own = evalsByCupper.get(p.userId);
      const cvaProps: CvaDocumentProps = {
        sessionName: session.name,
        date: assets.dateStr,
        cupperName: profile?.displayName ?? "",
        purpose: session.objective ?? "",
        cupsPerSample: session.cupsPerSample,
        format: session.format,
        locale: recipientLocale,
        samples: session.samples.map((s) => {
          const ev = own?.get(s.id);
          return {
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
      };

      const cvaBuffer = await renderToBuffer(CvaFormDocument(cvaProps));

      const result = await sendEmail({
        to: email,
        subject: text.subject(session.name),
        html: text.body({ name: session.name, date: assets.dateStr }),
        attachments: [
          { filename: `cva_${text.individualFile}_${nameSlug}.pdf`, content: cvaBuffer },
          { filename: `${text.summaryFile}_${nameSlug}.pdf`, content: assets.summaryBuffer },
        ],
      });

      if (result.skipped) return { status: "skipped" as const };
      if (!result.ok) {
        console.warn(
          `[closeEmail] send failed for ${email} in session ${sessionId}: ${result.error}`,
        );
        return { status: "failed" as const };
      }
      return { status: "sent" as const };
    }),
  );

  const summary: CloseEmailSummary = {
    attempted: recipients.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  for (const r of results) {
    if (r.status === "rejected") {
      summary.failed += 1;
      console.warn(`[closeEmail] recipient task rejected: ${String(r.reason)}`);
      continue;
    }
    if (r.value.status === "sent") summary.sent += 1;
    else if (r.value.status === "skipped") summary.skipped += 1;
    else summary.failed += 1;
  }

  return summary;
}
