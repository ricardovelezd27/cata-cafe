import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClipboardList, Users, CheckCircle2, Coffee } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { signOut, switchAccount } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { StatCard } from "@/components/dashboard/StatCard";
import { LevelBadge } from "@/components/profile/LevelBadge";
import { Badge, StatusPill } from "@/components/ui/Badge";
import { calcActivityPoints, computeLevel, LEVELS } from "@/lib/gamification";
import { ROLE_LABELS, COUNTRIES } from "@/lib/constants";
import { sessionHref } from "@/lib/sessionRouting";
import { EditProfileDialog } from "./EditProfileDialog";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const [
    profile,
    sessionsHosted,
    sessionsJoined,
    evaluationsSubmitted,
    distinctCoffees,
    percentileRows,
    recentSessions,
    recentCoffees,
  ] = await Promise.all([
    prisma.profile.findUnique({ where: { id: user.id } }),
    // Activity stats + level (Phase 2). Drafts aren't directed sessions, so
    // status != 'draft' is the "hosted" count — NB live data also contains a
    // legacy status "open", which status != 'draft' correctly still includes.
    prisma.cuppingSession.count({ where: { createdBy: user.id, status: { not: "draft" } } }),
    prisma.sessionParticipant.count({ where: { userId: user.id, status: "joined" } }),
    prisma.evaluation.count({ where: { cupperId: user.id, isDraft: false } }),
    prisma.userCoffeeHistory
      .findMany({ where: { userId: user.id }, select: { coffeeId: true }, distinct: ["coffeeId"] })
      .then((rows) => rows.length),
    // Percentile rank among ACTIVE cuppers, computed in one CTE-based query so we
    // don't have to pull every profile's counts into TS. The per-profile point
    // calculation here (COALESCE(...)*1 + ...*2 + ...*5) mirrors
    // calcActivityPoints()/POINT_WEIGHTS in lib/gamification.ts — keep both in
    // sync if the weights ever change.
    prisma.$queryRaw<Array<{ active_count: number | bigint; below_count: number | bigint }>>`
      WITH pts AS (
        SELECT p.id,
               COALESCE(e.cnt,0)*1 + COALESCE(j.cnt,0)*2 + COALESCE(m.cnt,0)*5 AS points
        FROM profiles p
        LEFT JOIN (SELECT "cupperId" AS id, count(*) AS cnt FROM evaluations WHERE "isDraft" = false GROUP BY 1) e ON e.id = p.id
        LEFT JOIN (SELECT "userId" AS id, count(*) AS cnt FROM session_participants WHERE status = 'joined' GROUP BY 1) j ON j.id = p.id
        LEFT JOIN (SELECT "createdBy" AS id, count(*) AS cnt FROM cupping_sessions WHERE status <> 'draft' GROUP BY 1) m ON m.id = p.id
      ), active AS (SELECT * FROM pts WHERE points > 0)
      SELECT
        (SELECT count(*) FROM active) AS active_count,
        (SELECT count(*) FROM active a WHERE a.points < (SELECT points FROM pts WHERE id = ${user.id})) AS below_count
    `,
    prisma.cuppingSession.findMany({
      // Own AND participated — participated sessions must stay visible by
      // default, labeled as such (they're part of your activity, not owned).
      where: {
        OR: [
          { createdBy: user.id },
          { participants: { some: { userId: user.id } } },
        ],
      },
      orderBy: { date: "desc" },
      take: 4,
      select: {
        id: true,
        name: true,
        date: true,
        status: true,
        isGroup: true,
        startedAt: true,
        createdBy: true,
      },
    }),
    prisma.coffee.findMany({
      where: { createdBy: user.id },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, name: true, visibility: true },
    }),
  ]);

  const t = await getTranslations("profile");
  const tc = await getTranslations("common");
  const tCoffee = await getTranslations("coffee");
  const tSession = await getTranslations("session");

  // Activity points + level (lib/gamification.ts is the single source of truth
  // for the weights/thresholds; this just feeds it the counts from above).
  const activityPoints = calcActivityPoints({
    evaluations: evaluationsSubmitted,
    sessionsJoined,
    sessionsHosted,
  });
  const levelInfo = computeLevel(activityPoints);
  const levelLabel = locale === "es" ? levelInfo.label.es : levelInfo.label.en;

  // below_count / active_count is the fraction of active cuppers STRICTLY
  // BELOW the current user, so (1 - fraction) is "top X%" — always positively
  // framed. Gated behind a minimum sample size and a minimum point floor so a
  // single early user (or someone with 1-2 points) doesn't see a hollow "Top 1%".
  const activeCount = Number(percentileRows[0]?.active_count ?? 0);
  const belowCount = Number(percentileRows[0]?.below_count ?? 0);
  const topPercent =
    activeCount >= 5 && activityPoints >= 10
      ? Math.max(1, Math.round((1 - belowCount / activeCount) * 100))
      : null;

  const nextLevelDef =
    levelInfo.nextThreshold != null
      ? LEVELS.find((d) => d.threshold === levelInfo.nextThreshold)
      : undefined;
  const progressText =
    levelInfo.nextThreshold == null
      ? t("maxLevel")
      : t("pointsToNext", {
          points: Math.max(0, levelInfo.nextThreshold - activityPoints),
          level: nextLevelDef ? (locale === "es" ? nextLevelDef.label.es : nextLevelDef.label.en) : "",
        });
  const topPercentText = topPercent != null ? t("topPercent", { percent: topPercent }) : null;

  const formatDate = (d: Date) =>
    d.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const statusLabels = {
    draft: tc("statusDraft"),
    active: tc("statusActive"),
    closed: tc("statusClosed"),
  };

  const visibilityLabels: Record<string, string> = {
    public: tCoffee("listPublic"),
    shared: tCoffee("listShared"),
    private: tCoffee("listPrivate"),
  };

  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({
    value,
    label: locale === "es" ? label.es : label.en,
  }));

  const roleLabelText = profile?.role
    ? (ROLE_LABELS[profile.role]?.[locale as "es" | "en"] ?? profile.role)
    : null;
  const metaLine = [roleLabelText, profile?.country].filter(Boolean).join(" · ");

  const editDialog = (
    <EditProfileDialog
      label={t("editProfile")}
      closeLabel={tc("close")}
      form={{
        initial: {
          displayName: profile?.displayName ?? "",
          preferredLang: (profile?.preferredLang as "es" | "en") ?? "es",
          bio: profile?.bio ?? "",
          role: profile?.role ?? "cupping_pro",
          country: profile?.country ?? "",
        },
        roleOptions,
        countryOptions: [...COUNTRIES],
        t: {
          displayName: t("displayName"),
          preferredLang: t("preferredLang"),
          bio: t("bio"),
          save: t("save"),
          roleLabel: t("roleLabel"),
          countryLabel: t("countryLabel"),
          saveSuccess: t("saveSuccess"),
          saveError: t("saveError"),
        },
      }}
    />
  );

  return (
    <div>
      {/* Banner — brand-toned, spans the full content width (LinkedIn-style) */}
      <div className="h-32 rounded-card bg-gradient-to-r from-primary via-primary-container to-primary shadow-card sm:h-40" />

      {/* Cards float over the banner's bottom edge */}
      <div className="relative -mt-10 space-y-6 px-2 sm:px-4">
        {/* Row 1 — profile block + stats */}
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
          <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div className="-mt-14 shrink-0 rounded-full ring-4 ring-surface-container-lowest">
                <Avatar name={profile?.displayName || user.email || "?"} size={88} />
              </div>
              {editDialog}
            </div>
            <div className="mt-3">
              <div className="font-display text-2xl text-on-surface">
                {profile?.displayName || "—"}
              </div>
              <div className="text-sm text-on-surface-variant">{user.email}</div>
              {metaLine && (
                <div className="mt-1 text-xs font-medium text-on-surface-variant">{metaLine}</div>
              )}
            </div>
            {profile?.bio && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
                {profile.bio}
              </p>
            )}
          </div>

          <div className="grid content-start grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label={t("statMaster")}
              value={String(sessionsHosted)}
              subtext=""
              icon={<ClipboardList size={18} />}
            />
            <StatCard
              label={t("statJoined")}
              value={String(sessionsJoined)}
              subtext=""
              icon={<Users size={18} />}
            />
            <StatCard
              label={t("statEvals")}
              value={String(evaluationsSubmitted)}
              subtext=""
              icon={<CheckCircle2 size={18} />}
            />
            <Link href={`/${locale}/app/profile/history`} className="block">
              <StatCard
                label={t("statCoffees")}
                value={String(distinctCoffees)}
                subtext={t("viewHistory")}
                accent
                icon={<Coffee size={18} />}
              />
            </Link>
          </div>
        </div>

        {/* Row 2 — level + recent activity */}
        <div className="grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]">
          <LevelBadge
            locale={locale as "es" | "en"}
            level={levelInfo.level}
            levelLabel={levelLabel}
            progress={levelInfo.progress}
            progressText={progressText}
            topPercentText={topPercentText}
            t={{
              levelTitle: t("levelTitle"),
              pointsLabel: t("pointsLabel", { points: activityPoints }),
              howPoints: t("howPoints"),
            }}
          />

          <div className="space-y-6 rounded-card border border-outline-variant bg-surface-container-lowest p-6 shadow-card">
            <h2 className="font-display text-xl text-primary-container">{t("recentActivity")}</h2>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {t("recentSessions")}
                </h3>
                <Link
                  href={`/${locale}/app/sessions`}
                  className="text-xs font-semibold text-primary-container hover:underline"
                >
                  {t("viewAllSessions")}
                </Link>
              </div>
              {recentSessions.length === 0 ? (
                <p className="text-sm text-on-surface-variant">{t("noOwnedSessions")}</p>
              ) : (
                <div className="space-y-2">
                  {recentSessions.map((s) => (
                    <Link
                      key={s.id}
                      href={sessionHref(s, { locale, isOwner: s.createdBy === user.id })}
                      className="flex items-center justify-between gap-3 rounded-card border border-outline-variant bg-surface px-4 py-2.5 transition-colors hover:bg-surface-container-low"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-on-surface">{s.name}</span>
                          {s.createdBy !== user.id && (
                            <Badge tone="outline" size="xs">
                              {tSession("table.participantBadge")}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-on-surface-variant">{formatDate(s.date)}</div>
                      </div>
                      <StatusPill status={s.status} labels={statusLabels} />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  {t("recentCoffees")}
                </h3>
                <Link
                  href={`/${locale}/app/coffees`}
                  className="text-xs font-semibold text-primary-container hover:underline"
                >
                  {t("viewAllCoffees")}
                </Link>
              </div>
              {recentCoffees.length === 0 ? (
                <p className="text-sm text-on-surface-variant">{t("myCoffeesEmpty")}</p>
              ) : (
                <div className="space-y-2">
                  {recentCoffees.map((c) => (
                    <Link
                      key={c.id}
                      href={`/${locale}/app/coffees/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-card border border-outline-variant bg-surface px-4 py-2.5 transition-colors hover:bg-surface-container-low"
                    >
                      <span className="truncate text-sm font-semibold text-on-surface">{c.name}</span>
                      <Badge
                        tone={
                          c.visibility === "public" ? "success" : c.visibility === "shared" ? "accent" : "neutral"
                        }
                      >
                        {visibilityLabels[c.visibility] ?? c.visibility}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Account actions — reachable on mobile via the "Perfil" tab */}
        <section>
          <h2 className="mb-3 font-display text-xl text-primary-container">{t("account")}</h2>
          <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-4">
            <div className="mb-3 text-sm text-on-surface-variant">{user.email}</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <form action={switchAccount.bind(null, locale)}>
                <button
                  type="submit"
                  className="w-full rounded-pill border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container sm:w-auto"
                >
                  {t("switchAccount")}
                </button>
              </form>
              <form action={signOut}>
                <button
                  type="submit"
                  className="w-full rounded-pill border border-outline-variant px-4 py-2 text-sm font-semibold text-error transition-colors hover:bg-error-container sm:w-auto"
                >
                  {t("logout")}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
