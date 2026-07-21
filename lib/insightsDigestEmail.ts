// Server-only. Builds and sends the monthly insights digest email to every
// analytics user (analyticsAccess=true plus the super-admin). Called by the
// cron route app/api/cron/insights-digest/route.ts.
//
// Idempotent: one DigestRun row per period; a second run for the same period
// is a no-op. Per-recipient failures are isolated with Promise.allSettled
// (pattern cloned from lib/closeEmail.ts). NEVER import from a client
// component — uses the service-role admin client and server-only AI modules.

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getSuperAdminEmail, isSuperAdminEmail } from "@/lib/analytics/access";
import { runInsightQuery } from "@/lib/analytics/queries";
import { cachedGenerate } from "@/lib/ai/cache";
import {
  buildDigestRequest,
  type DigestInputs,
  type NarrativeContent,
} from "@/lib/ai/narratives";

type Locale = "es" | "en";

export type DigestSummary = {
  ok: boolean;
  period: string;
  alreadyRan?: boolean;
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
    subject: (period) => `Cata Café — Resumen de insights ${period}`,
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
    subject: (period) => `Cata Café — Insights digest ${period}`,
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
    <h2 style="color:#3D5A3E; margin:0 0 4px;">Cata Café</h2>
    <p style="color:#7a7168; margin:0 0 16px;">${escapeHtml(EMAIL_TEXT[locale].subject(inputs.period))}</p>
    <table style="border-collapse:collapse; width:100%;">
      ${kpiRow(t.kpis.evaluations, String(inputs.evaluations.current), deltaBadge(inputs.evaluations.current, inputs.evaluations.previous))}
      ${kpiRow(t.kpis.sessions, String(inputs.sessions.current), deltaBadge(inputs.sessions.current, inputs.sessions.previous))}
      ${kpiRow(t.kpis.newCoffees, String(inputs.newCoffees.current), deltaBadge(inputs.newCoffees.current, inputs.newCoffees.previous))}
      ${kpiRow(t.kpis.avgScore, avgCurrent, avgDelta)}
    </table>
    ${narrativeBlock}
    <p style="margin:20px 0 0;">
      <a href="${siteUrl}/es/app/insights" style="color:#3D5A3E; font-weight:bold;">${t.openInsights} →</a>
    </p>
  </div>`;
}

/**
 * Compute and send the digest for the previous calendar month. Idempotent per
 * period via DigestRun. Never throws for per-recipient failures.
 */
export async function sendInsightsDigest(now = new Date()): Promise<DigestSummary> {
  const period = previousPeriod(periodOf(now));

  const existing = await prisma.digestRun.findUnique({ where: { period } });
  if (existing) {
    return {
      ok: true,
      period,
      alreadyRan: true,
      recipients: existing.recipients,
      sent: existing.sent,
      failed: 0,
      aiSkipped: existing.aiSkipped,
    };
  }

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

  // Recipients: analyticsAccess profiles + the super-admin, locale-aware.
  const profiles = await prisma.profile.findMany({
    where: { analyticsAccess: true },
    select: { id: true, preferredLang: true },
  });
  const emailById = new Map<string, string>();
  let superAdminId: string | null = null;
  try {
    const admin = createAdminClient();
    let page = 1;
    const perPage = 1000;
    for (;;) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) break;
      for (const u of data.users) {
        if (u.email) {
          emailById.set(u.id, u.email);
          if (isSuperAdminEmail(u.email)) superAdminId = u.id;
        }
      }
      if (data.users.length < perPage) break;
      page += 1;
    }
  } catch {
    // Recipient resolution degraded; only profiles already mapped get email.
  }

  const targets = new Map<string, Locale>();
  for (const p of profiles) {
    const email = emailById.get(p.id);
    if (email) targets.set(email, p.preferredLang === "en" ? "en" : "es");
  }
  const superEmail = getSuperAdminEmail();
  if (!targets.has(superEmail)) {
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const results = await Promise.allSettled(
    [...targets.entries()].map(([email, locale]) =>
      sendEmail({
        to: email,
        subject: EMAIL_TEXT[locale].subject(period),
        html: digestHtml(locale, inputs, narratives[locale], siteUrl),
      }),
    ),
  );
  const sent = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;
  const failed = results.length - sent;

  await prisma.digestRun.create({
    data: { period, recipients: targets.size, sent, aiSkipped },
  });

  return { ok: true, period, recipients: targets.size, sent, failed, aiSkipped };
}
