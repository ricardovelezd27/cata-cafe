import { GuestGateLink } from "@/components/guest/GuestGateLink";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClipboardList, Coffee, Star, ChevronRight, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { sessionHref } from "@/lib/sessionRouting";
import { finishedSessionWhere } from "@/lib/sessionState";
import { coffeeDisplayName } from "@/lib/coffeeAnonymize";
import { StatCard } from "@/components/dashboard/StatCard";
import { FormatBadge } from "@/components/dashboard/FormatBadge";
import { DashboardIntro } from "@/components/dashboard/DashboardIntro";
import { WarmupFigure } from "@/components/warmup/figures";
import { Badge, ScorePill, StatusPill } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";

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
  const tc = await getTranslations("common");
  const tw = await getTranslations("warmup");

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

    // "Sesiones realizadas": only sessions that are over, never an open one (A-09).
    prisma.cuppingSession.count({
      where: {
        AND: [
          {
            OR: [
              { createdBy: user.id },
              { participants: { some: { userId: user.id } } },
            ],
          },
          finishedSessionWhere(),
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
        isAsync: true,
        startedAt: true,
        closesAt: true,
        _count: { select: { samples: true } },
      },
      // Order by session DATE (not createdAt) so a session you joined shows up
      // by when it happened — same default ordering as the sessions table.
      orderBy: { date: "desc" },
      take: 5,
    }),

    prisma.userCoffeeHistory.groupBy({
      by: ["coffeeId"],
      // coffeeId NOT NULL: label-only rows (S8-16) are not a coffee.
      where: { userId: user.id, coffeeId: { not: null }, individualScore: { not: null } },
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
            coffee: { select: { name: true, deletedAt: true } },
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
  const topCoffeeIds = topCoffeeGroups
    .map((g) => g.coffeeId)
    .filter((c): c is string => c !== null);
  const topCoffeeDetails =
    topCoffeeIds.length > 0
      ? await prisma.coffee.findMany({
          where: { id: { in: topCoffeeIds } },
          select: { id: true, name: true, country: true, deletedAt: true },
        })
      : [];
  const coffeeMap = new Map(topCoffeeDetails.map((c) => [c.id, c]));

  const hasData = recentSessions.length > 0;
  const statusLabels = {
    draft: tc("statusDraft"),
    active: tc("statusActive"),
    closed: tc("statusClosed"),
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="page-title leading-tight">
            {t("welcome", { name: profile?.displayName ?? "" })}
          </h1>
          <p className="text-caption text-on-surface-variant mt-1 max-w-[68ch]">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <GuestGateLink
            href={`/${locale}/app/sessions/express`}
            className="inline-flex min-h-[44px] items-center justify-center px-4 py-2 rounded-pill bg-primary-container text-white text-caption font-bold hover:bg-primary transition-colors text-center"
          >
            {t("expressCta")}
          </GuestGateLink>
          <GuestGateLink
            href={`/${locale}/app/sessions/new`}
            className="inline-flex min-h-[44px] items-center justify-center px-4 py-2 rounded-pill border border-primary-container text-primary-container text-caption font-semibold hover:bg-primary-fixed transition-colors text-center"
          >
            {t("fullWizardCta")}
          </GuestGateLink>
        </div>
      </header>

      {/* How it works + scoring methodology: collapsed for a returning user (S6, F-15) */}
      <DashboardIntro
        sessionCount={recentSessions.length}
        t={{
          eyebrow: t("intro.eyebrow"),
          title: t("intro.title"),
          whyLabel: t("intro.whyLabel"),
          why: t("intro.why"),
          whatLabel: t("intro.whatLabel"),
          what: t("intro.what"),
          howLabel: t("intro.howLabel"),
          how: t("intro.how"),
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

      {/* Their own sessions first (S6, F-15): a returning user's first fold shows them; a newcomer sees the empty state */}
      {!hasData ? (
        <EmptyState icon={<Coffee size={20} />} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        /* Middle row */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent sessions */}
          <section>
            <PaperSectionHeading title={t("recent")} />
            <ul className="space-y-2">
              {/* P2b (D-07): each session is a Card that is a link, padded as a row of a list. */}
              {recentSessions.map((s) => (
                <Card
                  as="li"
                  key={s.id}
                  href={sessionHref(s, { locale, isOwner: s.createdBy === user.id })}
                  padding="row"
                  className="group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface text-caption truncate">
                          {s.name}
                        </span>
                        <FormatBadge format={s.format} />
                        {s.createdBy !== user.id && (
                          <Badge tone="outline">{tSession("table.participantBadge")}</Badge>
                        )}
                        <StatusPill status={s.status} labels={statusLabels} />
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-caption text-on-surface-variant">
                        <span>
                          {new Date(s.date).toLocaleDateString(locale)}
                        </span>
                        <span>·</span>
                        <span>
                          {t("samplesCount", { count: s._count.samples })}
                        </span>
                      </div>
                    </div>
                    <ChevronRight
                      size={16}
                      className="text-on-surface-variant group-hover:text-primary-container shrink-0 transition-colors"
                    />
                  </div>
                </Card>
              ))}
            </ul>
          </section>

          {/* Top coffees */}
          <section>
            <PaperSectionHeading title={t("bestCoffees")} />
            {topCoffeeGroups.length === 0 ? (
              <p className="text-caption text-on-surface-variant">{t("noBestCoffees")}</p>
            ) : (
              <ul className="space-y-2">
                {topCoffeeGroups.map((g, i) => {
                  const coffee = g.coffeeId ? coffeeMap.get(g.coffeeId) : undefined;
                  const avg = g._avg.individualScore ?? 0;
                  return (
                    <Card as="li" key={g.coffeeId} padding="row" className="flex items-center gap-3">
                      <span className="font-display text-section text-primary-muted w-6 text-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-on-surface text-caption truncate">
                          {coffee ? coffeeDisplayName(coffee, tc("coffeeDeleted")) : "—"}
                        </p>
                        {coffee?.country && (
                          <p className="text-caption text-on-surface-variant">{coffee.country}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <ScorePill score={avg} />
                        <span className="text-caption text-on-surface-variant">
                          {t("cuppingsCount", { count: g._count.coffeeId })}
                        </span>
                      </div>
                    </Card>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

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

      {/* Movimiento Sensorial — pre-cupping warm-ups (guest-reachable, plain Link) */}
      {/* P2b (D-07): a Card that is a link (quiet tone). */}
      <Card href={`/${locale}/app/warmup`} tone="quiet" className="group">
        <span className="flex items-center gap-4 md:gap-6">
        <span className="hidden h-16 w-16 shrink-0 overflow-hidden rounded-card sm:block" aria-hidden>
          <WarmupFigure
            kind="arm-raise"
            eyes="open"
            pose={{ a: 0.75 }}
            path={{ from: { a: 0 }, to: { a: 1 }, progress: 0.75 }}
            frame="tile"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="label-caps block">
            {tw("dashboard.eyebrow")}
          </span>
          <span className="mt-0.5 block font-display text-card text-primary-container">
            {tw("dashboard.title")}
          </span>
          <span className="mt-1 block max-w-[68ch] text-body leading-relaxed text-on-surface-variant">
            {tw("dashboard.body")}
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 text-caption font-semibold text-primary-container sm:inline-flex">
          {tw("dashboard.cta")}
          <ChevronRight size={16} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
        <ChevronRight size={16} className="shrink-0 text-on-surface-variant sm:hidden" aria-hidden />
        </span>
      </Card>

      {/* Activity feed */}
      {hasData && (
        <section>
          <PaperSectionHeading title={t("activityFeed")} />
          {recentActivity.length === 0 ? (
            <p className="text-caption text-on-surface-variant">{t("noActivity")}</p>
          ) : (
            <ul className="space-y-1">
              {recentActivity.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 py-2 border-b border-outline-variant/50 last:border-0"
                >
                  <span className="text-primary-muted shrink-0">
                    <Clock size={14} />
                  </span>
                  <span className="text-caption text-on-surface flex-1">
                    {item.sessionSample.revealed && item.sessionSample.coffee
                      ? t("activityEval", {
                          coffee: coffeeDisplayName(
                            item.sessionSample.coffee,
                            tc("coffeeDeleted"),
                          ),
                        })
                      : t("activityEvalSample", {
                          sample: item.sessionSample.label,
                          session: item.sessionSample.session.name,
                        })}
                  </span>
                  <span className="text-caption text-on-surface-variant shrink-0">
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
