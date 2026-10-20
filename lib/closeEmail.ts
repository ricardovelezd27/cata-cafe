// Server-only. On group-session close, emails every participant a link back to
// the results page plus ONE small attachment: their personal summary PDF
// (lib/pdf/ParticipantSummaryDocument, model from lib/reports). The legacy
// per-recipient CVA form PDF is attached only when CLOSE_EMAIL_ATTACH_CVA=1;
// the anonymous group-summary PDF is retired.
//
// Called by closeSession (app/actions/community.ts) AFTER the status update and
// syncCoffeeHistory. Email work must NEVER fail or block the close: the caller
// wraps this in try/catch and this function additionally isolates every send
// with Promise.allSettled. NEVER import from a client component — it uses the
// service-role admin client (email lookup) and @react-pdf/renderer (Node only).

import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { orderReferenceFirst } from "@/lib/referenceRules";
import { coffeeDisplayName, deletedCoffeeLabel } from "@/lib/coffeeAnonymize";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { CvaFormDocument, type CvaDocumentProps } from "@/lib/pdf/CvaFormDocument";
import { ParticipantSummaryDocument } from "@/lib/pdf/ParticipantSummaryDocument";
import { slug } from "@/lib/pdf/filename";
import type { SessionReportSource } from "@/lib/reports/types";
import { loadSessionReportSource } from "@/lib/reports/sessionReportData";
import { buildParticipantSummary } from "@/lib/reports/participantSummary";
import { buildCloseEmailHtml, closeEmailSubject } from "@/lib/closeEmailBody";
import { buildResultsLoginUrl, siteOrigin } from "@/lib/inviteUrl";
import esMessages from "@/messages/es.json";
import enMessages from "@/messages/en.json";

type Locale = "es" | "en";

export type CloseEmailSummary = {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
};

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
          coffee: { select: { name: true, deletedAt: true, roastLevel: true } },
          physical: true,
          extrinsic: true,
        },
      },
      participants: { select: { userId: true, excludedFromResults: true } },
    },
  });

  if (!session || !session.isGroup) return empty;
  // Reference first in every emailed sheet/summary (lib/referenceRules.ts).
  session.samples = orderReferenceFirst(session.samples, session.referenceSampleId);

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

  // ── Per-locale assets: date string + the participant-summary report source.
  // The source (one DB read each) is shared by every recipient of that locale —
  // at most 2 loads (es/en) however many participants there are. ──
  const localesNeeded = new Set<Locale>(
    session.participants.map((p) => resolveRecipientLocale(p.userId)),
  );
  type LocaleAssets = { dateStr: string; source: SessionReportSource | null; sourceError?: string };
  const assetsByLocale = new Map<Locale, LocaleAssets>();
  const attachCva = process.env.CLOSE_EMAIL_ATTACH_CVA === "1";

  for (const loc of localesNeeded) {
    const dateStr = session.date.toLocaleDateString(loc === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const messages = loc === "en" ? enMessages : esMessages;
    const blockLabels = messages.blocks as Record<string, string>;
    let source: SessionReportSource | null = null;
    let sourceError: string | undefined;
    try {
      source = await loadSessionReportSource(sessionId, {
        locale: loc,
        blockLabel: (blockId) => blockLabels[blockId] ?? blockId,
      });
      if (!source) sourceError = "report_source_missing";
    } catch (err) {
      sourceError = `report_source: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
    }
    assetsByLocale.set(loc, { dateStr, source, sourceError });
  }

  const admin = createAdminClient();
  const nameSlug = slug(session.name);

  // Every participant RECEIVES email (including excluded-from-results cuppers —
  // they still get their own summary)
  // — EXCEPT those already marked "sent" in close_email_deliveries. That ledger
  // is what makes a re-run (double click, cron retry, owner "resend") safe.
  const alreadySent = new Set(
    (
      await prisma.closeEmailDelivery.findMany({
        where: { sessionId, status: "sent" },
        select: { userId: true },
      })
    ).map((d) => d.userId),
  );
  const recipients = session.participants.filter((p) => !alreadySent.has(p.userId));

  type Outcome = { status: "sent" | "skipped" | "failed"; error?: string };

  const sendOne = async (p: (typeof recipients)[number]): Promise<Outcome> => {
      // Resolve the recipient's email via the service-role admin client — the
      // Profile model has no email column. Anonymous guests have none: that is
      // "skipped" (nothing to retry), not a failure.
      const { data, error } = await admin.auth.admin.getUserById(p.userId);
      const email = data?.user?.email;
      if (error) {
        console.warn(
          `[closeEmail] could not resolve participant ${p.userId} in session ${sessionId}: ${error.message}`,
        );
        return { status: "failed", error: `lookup: ${error.message}` };
      }
      if (!email) return { status: "skipped", error: "no_email" };

      const recipientLocale = resolveRecipientLocale(p.userId);
      const assets = assetsByLocale.get(recipientLocale)!;
      const profile = profileById.get(p.userId);
      const isEn = recipientLocale === "en";

      // Guard: a model failure marks THIS recipient failed, never the loop.
      if (!assets.source) return { status: "failed", error: assets.sourceError ?? "report_source" };
      // A participant who submitted nothing would get a mostly empty PDF: send
      // the link-only email (ledger status is still "sent").
      const hasSubmitted = (evalsByCupper.get(p.userId)?.size ?? 0) > 0;
      let summaryBuffer: Buffer | null = null;
      try {
        if (hasSubmitted) {
        const messages = isEn ? enMessages : esMessages;
        const model = buildParticipantSummary(assets.source, {
          viewerId: p.userId,
          locale: recipientLocale,
          labels: {
            coffeeDeleted: deletedCoffeeLabel(recipientLocale),
            soloTopDescriptors: messages.results.dashboard.soloTopDescriptors,
          },
        });
        summaryBuffer = await renderToBuffer(
          ParticipantSummaryDocument({ model, locale: recipientLocale }),
        );
        }
      } catch (err) {
        return {
          status: "failed",
          error: `summary: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300),
        };
      }

      const attachments: { filename: string; content: Buffer }[] = summaryBuffer
        ? [{ filename: `${isEn ? "summary" : "resumen"}_${nameSlug || "session"}.pdf`, content: summaryBuffer }]
        : [];

      if (attachCva) {
        // Legacy opt-in: also attach this participant's own CVA form.
        const own = evalsByCupper.get(p.userId);
        const isOwnerRecipient = p.userId === session.createdBy;
        const cvaProps: CvaDocumentProps = {
          ownerView: isOwnerRecipient,
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
              coffeeName: s.coffee
                ? coffeeDisplayName(s.coffee, deletedCoffeeLabel(recipientLocale))
                : null,
              roastLevel: s.coffee?.roastLevel ?? null,
              isReference: s.id === session.referenceSampleId,
              descriptive: (ev?.descriptiveData as Record<string, unknown>) ?? {},
              affective: (ev?.affectiveData as Record<string, unknown>) ?? {},
              combined: (ev?.combinedData as Record<string, unknown>) ?? {},
              physical: isOwnerRecipient
                ? ((s.physical?.data as Record<string, unknown>) ?? {})
                : {},
              extrinsic:
                isOwnerRecipient || s.revealed
                  ? ((s.extrinsic?.data as Record<string, unknown>) ?? {})
                  : {},
            };
          }),
        };
        const cvaBuffer = await renderToBuffer(CvaFormDocument(cvaProps));
        attachments.push({
          filename: `cva_${isEn ? "form" : "formulario"}_${nameSlug || "session"}.pdf`,
          content: cvaBuffer,
        });
      }

      const result = await sendEmail({
        to: email,
        subject: closeEmailSubject(recipientLocale, session.name),
        html: buildCloseEmailHtml({
          locale: recipientLocale,
          sessionName: session.name,
          dateStr: assets.dateStr,
          resultsUrl: buildResultsLoginUrl(siteOrigin(), recipientLocale, sessionId),
        }),
        attachments,
      });

      if (result.skipped) return { status: "skipped", error: "email_not_configured" };
      if (!result.ok) {
        console.warn(
          `[closeEmail] send failed for participant ${p.userId} in session ${sessionId}: ${result.error}`,
        );
        return { status: "failed", error: result.error };
      }
      return { status: "sent" };
  };

  const summary: CloseEmailSummary = {
    attempted: recipients.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  };

  // Bounded fan-out: each recipient costs one GoTrue lookup + one @react-pdf
  // render + one Resend POST. Unbounded Promise.all on a 30-person session
  // meant 30 concurrent PDF renders in one function invocation.
  const CONCURRENCY = 4;
  for (let i = 0; i < recipients.length; i += CONCURRENCY) {
    const chunk = recipients.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(chunk.map(sendOne));
    for (let j = 0; j < chunk.length; j++) {
      const r = settled[j];
      const outcome: Outcome =
        r.status === "fulfilled"
          ? r.value
          : { status: "failed", error: String(r.reason).slice(0, 300) };
      if (r.status === "rejected") {
        console.warn(`[closeEmail] recipient task rejected: ${String(r.reason)}`);
      }
      if (outcome.status === "sent") summary.sent += 1;
      else if (outcome.status === "skipped") summary.skipped += 1;
      else summary.failed += 1;

      // Ledger row per recipient — never lets a bookkeeping failure sink the
      // send loop itself.
      try {
        await prisma.closeEmailDelivery.upsert({
          where: { sessionId_userId: { sessionId, userId: chunk[j].userId } },
          create: {
            sessionId,
            userId: chunk[j].userId,
            status: outcome.status,
            lastError: outcome.error?.slice(0, 300) ?? null,
          },
          update: {
            status: outcome.status,
            attempts: { increment: 1 },
            lastError: outcome.error?.slice(0, 300) ?? null,
          },
        });
      } catch (err) {
        console.warn(
          `[closeEmail] could not record delivery for ${chunk[j].userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return summary;
}
