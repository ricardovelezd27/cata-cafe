// Server-only. Builds and sends the monthly insights digest email to every
// analytics user (analyticsAccess=true plus the super-admin). Called by the
// cron route app/api/cron/insights-digest/route.ts.
//
// Claim-first (S8-14, F-insights-3): the period is claimed as a `running`
// DigestRun row BEFORE anything is sent (the unique period is the lock), then
// marked `done` with per-recipient results. A concurrent or repeated call sees
// the claim and does nothing; a run that sent nothing releases the month; a
// crashed `running` claim is taken over after 30 minutes (lib/digestClaim.ts).
// Per-recipient failures are isolated with Promise.allSettled
// (pattern cloned from lib/closeEmail.ts). NEVER import from a client
// component — uses the service-role admin client and server-only AI modules.

import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/log";
import { listAllAuthUsers } from "@/lib/supabase/adminUsers";
import { sendEmail } from "@/lib/email";
import { getSuperAdminEmail, isSuperAdminEmail } from "@/lib/analytics/access";
import { runInsightQuery } from "@/lib/analytics/queries";
import { cachedGenerate } from "@/lib/ai/cache";
import { siteOrigin } from "@/lib/inviteUrl";
import {
  classifyExistingRun,
  countSent,
  digestInsightsUrl,
  mergeResults,
  parseResults,
  recipientsStillToSend,
  shouldReleasePeriod,
  type DigestResults,
} from "@/lib/digestClaim";
import {
  buildDigestRequest,
  type DigestInputs,
  type NarrativeContent,
} from "@/lib/ai/narratives";

type Locale = "es" | "en";

export type DigestSummary = {
  ok: boolean;
  /** Set when nothing was attempted because no super-admin address is configured. */
  error?: "no_super_admin";
  period: string;
  alreadyRan?: boolean;
  /** Another invocation holds the period right now (alreadyRan is also true). */
  inProgress?: boolean;
  recipients: number;
  sent: number;
  failed: number;
  aiSkipped: boolean;
};

const EMAIL_TEXT: Record<
  Locale,
  {
    subject: (period: string) => string;
    kpis: { evaluations: string; sessions: string; newCoffees: string; avgScore: string };
    vsPrev: string;
    highlights: string;
    openInsights: string;
    aiDisclaimer: string;
  }
> = {
  es: {
    subject: (period) => `Café Sensible — Resumen de insights ${period}`,
    kpis: {
      evaluations: "Evaluaciones enviadas",
      sessions: "Sesiones",
      newCoffees: "Cafés nuevos",
      avgScore: "Puntaje promedio",
    },
    vsPrev: "mes anterior",
    highlights: "Destacados",
    openInsights: "Abrir el panel de insights",
    aiDisclaimer: "Resumen generado con IA a partir de datos agregados — puede contener errores.",
  },
  en: {
    subject: (period) => `Café Sensible — Insights digest ${period}`,
    kpis: {
      evaluations: "Evaluations submitted",
      sessions: "Sessions",
      newCoffees: "New coffees",
      avgScore: "Average score",
    },
    vsPrev: "previous month",
    highlights: "Highlights",
    openInsights: "Open the insights dashboard",
    aiDisclaimer: "AI-generated summary from aggregated data — may contain errors.",
  },
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monthRange(period: string): { gte: Date; lt: Date } {
  const [y, m] = period.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
}

function periodOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function previousPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return periodOf(new Date(Date.UTC(y, m - 2, 1)));
}

const round2 = (x: number | null) => (x == null ? null : Math.round(x * 100) / 100);

async function monthStats(period: string) {
  const range = monthRange(period);
  const where = { gte: range.gte, lt: range.lt };
  const [evaluations, sessions, newCoffees, avg] = await Promise.all([
    prisma.evaluation.count({ where: { isDraft: false, submittedAt: where } }),
    prisma.cuppingSession.count({ where: { date: where } }),
    prisma.coffee.count({ where: { createdAt: where } }),
    prisma.evaluation.aggregate({
      _avg: { individualScore: true },
      where: { isDraft: false, submittedAt: where, individualScore: { not: null } },
    }),
  ]);
  return {
    evaluations,
    sessions,
    newCoffees,
    avgScore: round2(avg._avg.individualScore),
  };
}

async function buildDigestInputs(period: string): Promise<DigestInputs> {
  const prev = previousPeriod(period);
  const range = monthRange(period);
  const filters = {
    dateFrom: range.gte.toISOString().slice(0, 10),
    // runInsightQuery's dateTo is inclusive; last day of the month.
    dateTo: new Date(range.lt.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
  const [current, previous, topOrigins, topDescriptors] = await Promise.all([
    monthStats(period),
    monthStats(prev),
    runInsightQuery(
      { dataset: "evaluations", dimension: "coffeeCountry", measure: "count", chartType: "bar", filters, limit: 5 },
      "es",
    ),
    runInsightQuery(
      { dataset: "evaluations", dimension: "flavorDescriptor", measure: "count", chartType: "bar", filters, limit: 5 },
      "es",
    ),
  ]);
  return {
    period,
    prevPeriod: prev,
    evaluations: { current: current.evaluations, previous: previous.evaluations },
    sessions: { current: current.sessions, previous: previous.sessions },
    newCoffees: { current: current.newCoffees, previous: previous.newCoffees },
    avgScore: { current: current.avgScore, previous: previous.avgScore },
    topOrigins: topOrigins.map((r) => ({ label: r.label, value: r.value })),
    topDescriptors: topDescriptors.map((r) => ({ label: r.label, value: r.value })),
  };
}

function deltaBadge(current: number, previous: number): string {
  const diff = current - previous;
  if (diff === 0) return `<span style="color:#7a7168;">=</span>`;
  const color = diff > 0 ? "#3D5A3E" : "#A83232";
  const sign = diff > 0 ? "+" : "";
  return `<span style="color:${color};">${sign}${diff}</span>`;
}

function floatDeltaBadge(current: number | null, previous: number | null): string {
  if (current == null || previous == null) return `<span style="color:#7a7168;">—</span>`;
  const diff = Math.round((current - previous) * 100) / 100;
  if (diff === 0) return `<span style="color:#7a7168;">=</span>`;
  const color = diff > 0 ? "#3D5A3E" : "#A83232";
  const sign = diff > 0 ? "+" : "";
  return `<span style="color:${color};">${sign}${diff.toFixed(2)}</span>`;
}

function digestHtml(
  locale: Locale,
  inputs: DigestInputs,
  narrative: NarrativeContent | null,
  siteUrl: string,
): string {
  const t = EMAIL_TEXT[locale];
  const kpiRow = (label: string, current: string, delta: string) => `
    <tr>
      <td style="padding:6px 12px 6px 0; color:#5a5148;">${label}</td>
      <td style="padding:6px 12px; font-weight:bold; text-align:right;">${current}</td>
      <td style="padding:6px 0; text-align:right; font-size:13px;">${delta} <span style="color:#a49a8e; font-size:12px;">(${t.vsPrev})</span></td>
    </tr>`;

  const avgCurrent = inputs.avgScore.current != null ? inputs.avgScore.current.toFixed(2) : "—";
  const avgDelta = floatDeltaBadge(inputs.avgScore.current, inputs.avgScore.previous);

  const narrativeBlock = narrative
    ? `
      <h3 style="color:#3D5A3E; margin:20px 0 6px;">${escapeHtml(narrative.headline)}</h3>
      ${narrative.body
        .split(/\n{2,}/)
        .map((p) => `<p style="margin:8px 0;">${escapeHtml(p.trim())}</p>`)
        .join("")}
      <p style="margin:12px 0 4px; font-weight:bold;">${t.highlights}</p>
      <ul style="margin:4px 0 0; padding-left:20px;">
        ${narrative.highlights.map((h) => `<li style="margin:3px 0;">${escapeHtml(h)}</li>`).join("")}
      </ul>
      <p style="color:#a49a8e; font-size:12px; margin-top:10px;">${t.aiDisclaimer}</p>`
    : "";

  return `
  <div style="font-family: Arial, Helvetica, sans-serif; color:#2b241d; line-height:1.5; max-width:560px;">
    <h2 style="color:#3D5A3E; margin:0 0 4px;">Café Sensible</h2>
    <p style="color:#7a7168; margin:0 0 16px;">${escapeHtml(EMAIL_TEXT[locale].subject(inputs.period))}</p>
    <table style="border-collapse:collapse; width:100%;">
      ${kpiRow(t.kpis.evaluations, String(inputs.evaluations.current), deltaBadge(inputs.evaluations.current, inputs.evaluations.previous))}
      ${kpiRow(t.kpis.sessions, String(inputs.sessions.current), deltaBadge(inputs.sessions.current, inputs.sessions.previous))}
      ${kpiRow(t.kpis.newCoffees, String(inputs.newCoffees.current), deltaBadge(inputs.newCoffees.current, inputs.newCoffees.previous))}
      ${kpiRow(t.kpis.avgScore, avgCurrent, avgDelta)}
    </table>
    ${narrativeBlock}
    <p style="margin:20px 0 0;">
      <a href="${digestInsightsUrl(siteUrl, locale)}" style="color:#3D5A3E; font-weight:bold;">${t.openInsights} →</a>
    </p>
  </div>`;
}

/**
 * Compute and send the digest for the previous calendar month. Idempotent per
 * period via DigestRun. Never throws for per-recipient failures.
 */
export async function sendInsightsDigest(now = new Date()): Promise<DigestSummary> {
  const period = previousPeriod(periodOf(now));

  // No super-admin configured (local dev; production requires the variable):
  // there is nobody to send to, so claim nothing and spend no AI call.
  if (!getSuperAdminEmail()) {
    logWarn({ where: "insightsDigest", message: "ANALYTICS_SUPER_ADMIN_EMAIL is not set; digest skipped" });
    return { ok: false, error: "no_super_admin", period, recipients: 0, sent: 0, failed: 0, aiSkipped: false };
  }

  // 1. Claim the period. The unique `period` makes this atomic: of two
  //    simultaneous invocations exactly one create succeeds.
  let previous: DigestResults = {};
  let claimId: string;
  try {
    const claim = await prisma.digestRun.create({
      data: { period, recipients: 0, sent: 0, status: "running" },
      select: { id: true },
    });
    claimId = claim.id;
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== "P2002") throw err;
    const existing = await prisma.digestRun.findUnique({ where: { period } });
    if (!existing) {
      // Released between our create and our read: let the next tick retry.
      return { ok: true, period, alreadyRan: true, inProgress: true, recipients: 0, sent: 0, failed: 0, aiSkipped: false };
    }
    const state = classifyExistingRun(existing, now);
    if (state !== "stale") {
      return {
        ok: true,
        period,
        alreadyRan: true,
        inProgress: state === "running",
        recipients: existing.recipients,
        sent: existing.sent,
        failed: 0,
        aiSkipped: existing.aiSkipped,
      };
    }
    // Stale takeover: only one invocation wins this conditional update.
    const takeover = await prisma.digestRun.updateMany({
      where: { id: existing.id, status: "running", createdAt: existing.createdAt },
      data: { createdAt: now },
    });
    if (takeover.count === 0) {
      return { ok: true, period, alreadyRan: true, inProgress: true, recipients: existing.recipients, sent: existing.sent, failed: 0, aiSkipped: existing.aiSkipped };
    }
    claimId = existing.id;
    previous = parseResults(existing.results);
  }

  // A throw here leaves the claim `running`: the cron reports 500, and the
  // stale-takeover window (30 min) lets the next invocation retry the month
  // without risking a double send from a delete-and-resend race.
  return runClaimedDigest({ period, claimId, previous });
}

async function runClaimedDigest(args: {
  period: string;
  claimId: string;
  previous: DigestResults;
}): Promise<DigestSummary> {
  const { period, claimId, previous } = args;
  const inputs = await buildDigestInputs(period);

  // One cached standard-tier narrative per locale; digest still sends without AI.
  const narratives: Record<Locale, NarrativeContent | null> = { es: null, en: null };
  let aiSkipped = false;
  for (const locale of ["es", "en"] as const) {
    const result = await cachedGenerate<NarrativeContent>(
      "digest",
      inputs,
      locale,
      buildDigestRequest(inputs, locale),
    );
    if (result.ok) narratives[locale] = result.content;
    else if (result.skipped) aiSkipped = true;
  }

  // Recipient: the super-admin, locale-aware.
  let superAdminId: string | null = null;
  const authUsers = await listAllAuthUsers();
  for (const u of authUsers) {
    if (u.email && isSuperAdminEmail(u.email)) superAdminId = u.id;
  }

  // S8-08 F-insights-1: the digest carries PLATFORM-wide KPIs, so it goes to
  // the super-admin only. Flagged analytics users used to receive it too;
  // they now get nothing rather than another user's numbers.
  // TODO(owner): per-recipient user-scoped digests, if Ricardo wants them.
  const targets = new Map<string, Locale>();
  const superEmail = getSuperAdminEmail();
  if (superEmail && !targets.has(superEmail)) {
    let superLocale: Locale = "es";
    if (superAdminId) {
      const profile = await prisma.profile.findUnique({
        where: { id: superAdminId },
        select: { preferredLang: true },
      });
      if (profile?.preferredLang === "en") superLocale = "en";
    }
    targets.set(superEmail, superLocale);
  }

  const siteUrl = siteOrigin();
  const toSend = recipientsStillToSend([...targets.keys()], previous);
  // Send one at a time and persist each outcome right away: if the function
  // dies mid-loop, a stale takeover reads these results and skips recipients
  // that already got the email instead of sending it twice.
  let merged = previous;
  for (const email of toSend) {
    const locale = targets.get(email) ?? "es";
    let ok = false;
    try {
      const r = await sendEmail({
        to: email,
        subject: EMAIL_TEXT[locale].subject(period),
        html: digestHtml(locale, inputs, narratives[locale], siteUrl),
      });
      ok = r.ok;
    } catch {
      ok = false;
    }
    merged = mergeResults(merged, [{ email, ok }]);
    await prisma.digestRun.update({
      where: { id: claimId },
      data: { results: merged },
    });
  }
  const sent = countSent(merged);
  const failed = targets.size - sent;

  // Nothing went out (e.g. RESEND_API_KEY unset, provider down): release the
  // month instead of recording a run that never happened.
  if (shouldReleasePeriod(merged)) {
    await prisma.digestRun.deleteMany({ where: { id: claimId, status: "running" } });
    return { ok: true, period, recipients: targets.size, sent: 0, failed, aiSkipped };
  }

  await prisma.digestRun.update({
    where: { id: claimId },
    data: { status: "done", recipients: targets.size, sent, aiSkipped, results: merged },
  });

  return { ok: true, period, recipients: targets.size, sent, failed, aiSkipped };
}

/** Last recorded digest run, for the Acceso page. Read-only. */
export async function getLastDigestRun() {
  return prisma.digestRun.findFirst({
    orderBy: { createdAt: "desc" },
    select: { period: true, status: true, recipients: true, sent: true, aiSkipped: true, createdAt: true },
  });
}
