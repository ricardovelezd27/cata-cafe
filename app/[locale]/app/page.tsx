import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClipboardList, Coffee, Star, ChevronRight, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { sessionHref } from "@/lib/sessionRouting";
import { StatCard } from "@/components/dashboard/StatCard";
import { FormatBadge } from "@/components/dashboard/FormatBadge";
import { DashboardIntro } from "@/components/dashboard/DashboardIntro";

const STATUS_STYLES: Record<string, string> = {
  draft: "text-secondary border border-secondary/50",
  active: "text-primary-container border border-primary-container",
  closed: "bg-[#F0EDE6] text-on-surface-variant border border-outline-variant",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "BORRADOR",
  active: "ABIERTA",
  closed: "CERRADA",
};

function scorePillClass(score: number) {
  if (score >= 85) return "bg-primary-fixed text-primary-container";
  if (score >= 75) return "bg-[#FEF3E2] text-secondary";
  return "bg-error-container text-error";
}

function timeAgo(date: Date, locale: string): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return locale === "es" ? "hace un momento" : "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return locale === "es" ? `hace ${minutes} min` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return locale === "es" ? `hace ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return locale === "es" ? `hace ${days} día${days > 1 ? "s" : ""}` : `${days}d ago`;
}

export default async function Dashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");
  const tSession = await getTranslations("session");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [
    profile,
    sessionCount,
    submittedEvaluations,
    recentSessions,
    topCoffeeGroups,
    recentActivity,
  ] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: user.id },
      select: { displayName: true },
    }),

    prisma.cuppingSession.count({
      where: {
        OR: [
          { createdBy: user.id },
          { participants: { some: { userId: user.id } } },
        ],
      },
    }),

    prisma.evaluation.findMany({
      where: { cupperId: user.id, isDraft: false },
      select: { sessionSampleId: true, individualScore: true },
    }),

    prisma.cuppingSession.findMany({
      where: {
        OR: [
          { createdBy: user.id },
          { participants: { some: { userId: user.id } } },
        ],
      },
      select: {
        id: true,
        name: true,
        date: true,
        format: true,
        status: true,
        isGroup: true,
        createdBy: true,
        startedAt: true,
        _count: { select: { samples: true } },
      },
      // Order by session DATE (not createdAt) so a session you joined shows up
      // by when it happened — same default ordering as the sessions table.
      orderBy: { date: "desc" },
      take: 5,
    }),

    prisma.userCoffeeHistory.groupBy({
      by: ["coffeeId"],
      where: { userId: user.id, individualScore: { not: null } },
      _avg: { individualScore: true },
      _count: { coffeeId: true },
      orderBy: { _avg: { individualScore: "desc" } },
      take: 3,
    }),

    prisma.evaluation.findMany({
      where: { cupperId: user.id, isDraft: false, submittedAt: { not: null } },
      orderBy: { submittedAt: "desc" },
      take: 5,
      select: {
        submittedAt: true,
        sessionSample: {
          select: {
            label: true,
            revealed: true,
            coffee: { select: { name: true } },
            session: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  // Derived stats
  // Live stats: distinct evaluated samples + average score, sourced from
  // submitted evaluations (not UserCoffeeHistory, which stays empty until a
  // session is closed and its samples are revealed+linked to a Coffee).
  const evaluatedSampleCount = new Set(
    submittedEvaluations.map((e) => e.sessionSampleId),
  ).size;
  const submittedScores = submittedEvaluations
    .map((e) => e.individualScore)
    .filter((s): s is number => s !== null);
  const avgScore =
    submittedScores.length > 0
      ? (
          submittedScores.reduce((a, b) => a + b, 0) / submittedScores.length
        ).toFixed(2)
      : null;

  // Top coffee details
  const topCoffeeIds = topCoffeeGroups.map((g) => g.coffeeId);
  const topCoffeeDetails =
    topCoffeeIds.length > 0
      ? await prisma.coffee.findMany({
          where: { id: { in: topCoffeeIds } },
          select: { id: true, name: true, country: true },
        })
      : [];
  const coffeeMap = new Map(topCoffeeDetails.map((c) => [c.id, c]));

  const hasData = recentSessions.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-primary-container leading-tight">
            {t("welcome", { name: profile?.displayName ?? "" })}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">{t("subtitle")}</p>
        </div>
        <Link
          href={`/${locale}/app/sessions/new`}
          className="shrink-0 px-4 py-2 rounded-pill bg-primary-container text-white text-sm font-bold hover:bg-primary transition-colors"
        >
          {t("newSession")}
        </Link>
      </header>

      {/* Why / What / How intro + scoring methodology */}
      <DashboardIntro
        newSessionHref={`/${locale}/app/sessions/new`}
        t={{
          eyebrow: t("intro.eyebrow"),
          title: t("intro.title"),
          whyLabel: t("intro.whyLabel"),
          why: t("intro.why"),
          whatLabel: t("intro.whatLabel"),
          what: t("intro.what"),
          howLabel: t("intro.howLabel"),
          how: t("intro.how"),
          ctaPrimary: t("intro.ctaPrimary"),
          ctaCalc: t("intro.ctaCalc"),
          dismiss: t("intro.dismiss"),
          reopen: t("intro.reopen"),
          calcTitle: t("intro.calcTitle"),
          calcLead: t("intro.calcLead"),
          calcSigma: t("intro.calcSigma"),
          calcU: t("intro.calcU"),
          calcD: t("intro.calcD"),
          calcAnchors: t("intro.calcAnchors"),
          calcRounding: t("intro.calcRounding"),
          calcGroup: t("intro.calcGroup"),
          calcPerResult: t("intro.calcPerResult"),
        }}
      />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t("statSessions")}
          value={String(sessionCount)}
          subtext={t("statSessionsSub")}
          icon={<ClipboardList size={20} />}
        />
        <StatCard
          label={t("statSamples")}
          value={String(evaluatedSampleCount)}
          subtext={t("statSamplesSubEvals")}
          icon={<Coffee size={20} />}
        />
        <StatCard
          label={t("statAvg")}
          value={avgScore ?? t("noAvg")}
          subtext={t("statAvgSub")}
          accent
          icon={<Star size={20} />}
        />
      </div>

      {/* Empty state */}
      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <span className="text-6xl">☕</span>
          <p className="font-display text-2xl text-primary-container">{t("emptyTitle")}</p>
          <Link
            href={`/${locale}/app/sessions/new`}
            className="mt-2 px-6 py-3 rounded-pill bg-primary-container text-white font-semibold text-sm hover:bg-primary transition-colors"
          >
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        /* Middle row */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent sessions */}
          <section className="space-y-3">
            <h2 className="font-display text-xl text-primary-container">{t("recent")}</h2>
            <ul className="space-y-2">
              {recentSessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={sessionHref(s, { locale, isOwner: s.createdBy === user.id })}
                    className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant rounded-card px-4 py-3 hover:border-l-4 hover:border-l-primary-container hover:bg-primary transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface text-sm truncate">
                          {s.name}
                        </span>
                        <FormatBadge format={s.format} />
                        {s.createdBy !== user.id && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold border border-outline-variant text-on-surface-variant">
                            {tSession("table.participantBadge")}
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            STATUS_STYLES[s.status] ?? STATUS_STYLES.closed
                          }`}
                        >
                          {STATUS_LABELS[s.status] ?? s.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-on-surface-variant">
                        <span>
                          {new Date(s.date).toLocaleDateString(locale)}
                        </span>
                        <span>·</span>
                        <span>
                          {s._count.samples} {tSession("table.colSamples").toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-on-surface-variant group-hover:text-primary-container shrink-0 transition-colors"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* Top coffees */}
          <section className="space-y-3">
            <h2 className="font-display text-xl text-primary-container">{t("bestCoffees")}</h2>
            {topCoffeeGroups.length === 0 ? (
              <p className="text-sm text-on-surface-variant">{t("noBestCoffees")}</p>
            ) : (
              <ul className="space-y-2">
                {topCoffeeGroups.map((g, i) => {
                  const coffee = coffeeMap.get(g.coffeeId);
                  const avg = g._avg.individualScore ?? 0;
                  return (
                    <li
                      key={g.coffeeId}
                      className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant rounded-card px-4 py-3"
                    >
                      <span className="font-display text-2xl text-green-mid w-6 text-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-on-surface text-sm truncate">
                          {coffee?.name ?? "—"}
                        </p>
                        {coffee?.country && (
                          <p className="text-xs text-on-surface-variant">{coffee.country}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${scorePillClass(avg)}`}
                        >
                          {avg.toFixed(2)}
                        </span>
                        <span className="text-xs text-on-surface-variant">
                          {t("cuppingsCount", { count: g._count.coffeeId })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Activity feed */}
      {hasData && (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-primary-container">{t("activityFeed")}</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t("noActivity")}</p>
          ) : (
            <ul className="space-y-1">
              {recentActivity.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 py-2 border-b border-[#F0EDE6] last:border-0"
                >
                  <span className="text-green-mid shrink-0">
                    <Clock size={14} />
                  </span>
                  <span className="text-sm text-on-surface flex-1">
                    {item.sessionSample.revealed && item.sessionSample.coffee
                      ? t("activityEval", {
                          coffee: item.sessionSample.coffee.name,
                        })
                      : t("activityEvalSample", {
                          sample: item.sessionSample.label,
                          session: item.sessionSample.session.name,
                        })}
                  </span>
                  <span className="text-xs text-on-surface-variant shrink-0">
                    {item.submittedAt
                      ? timeAgo(new Date(item.submittedAt), locale)
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
