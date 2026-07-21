import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClipboardList, Users, CheckCircle2, Coffee } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "./ProfileForm";
import Link from "next/link";
import { signOut, switchAccount } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { StatCard } from "@/components/dashboard/StatCard";
import { LevelBadge } from "@/components/profile/LevelBadge";
import { calcActivityPoints, computeLevel, LEVELS } from "@/lib/gamification";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

function StatusBadge({
  status,
  labels,
}: {
  status: string;
  labels: { draft: string; active: string; closed: string };
}) {
  const cfg = {
    draft: { bg: "#F0EBE0", color: "#8B7355", label: labels.draft },
    active: { bg: "#E8F0E8", color: "#3D5A3E", label: labels.active },
    closed: { bg: "#EBE0E0", color: "#A83232", label: labels.closed },
  }[status] ?? { bg: "#F0EBE0", color: "#8B7355", label: status };

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
        background: cfg.bg,
        color: cfg.color,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      }}
    >
      {cfg.label}
    </span>
  );
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
    ownedSessions,
    participantRows,
    sessionsHosted,
    sessionsJoined,
    evaluationsSubmitted,
    distinctCoffees,
    percentileRows,
  ] = await Promise.all([
    prisma.profile.findUnique({ where: { id: user.id } }),
    prisma.cuppingSession.findMany({
      where: { createdBy: user.id },
      orderBy: { date: "desc" },
      take: 10,
      select: { id: true, name: true, date: true, status: true, format: true, isGroup: true },
    }),
    prisma.sessionParticipant.findMany({
      where: { userId: user.id, status: "joined" },
      include: {
        session: {
          select: { id: true, name: true, date: true, status: true, format: true },
        },
      },
      orderBy: { joinedAt: "desc" },
      take: 10,
    }),
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
  ]);

  const t = await getTranslations("profile");

  const statusLabels = {
    draft: t("statusDraft"),
    active: t("statusActive"),
    closed: t("statusClosed"),
  };

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

  return (
    <div className="max-w-xl space-y-8">
      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        <Avatar name={profile?.displayName || user.email || "?"} size={64} />
        <div>
          <div className="font-serif text-xl text-green-dark font-bold">
            {profile?.displayName || "—"}
          </div>
          <div className="text-sm text-brown-mid">{user.email}</div>
        </div>
      </div>

      {/* Level + activity stats (Phase 2) */}
      <div>
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

        <h2 className="font-serif text-xl text-green-dark mt-6 mb-3">{t("statsTitle")}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

      {/* Editable profile fields */}
      <div>
        <h2 className="font-serif text-2xl text-green-dark mb-4">{t("title")}</h2>
        <ProfileForm
          initial={{
            displayName: profile?.displayName ?? "",
            preferredLang: (profile?.preferredLang as "es" | "en") ?? "es",
            bio: profile?.bio ?? "",
          }}
          t={{
            displayName: t("displayName"),
            preferredLang: t("preferredLang"),
            bio: t("bio"),
            save: t("save"),
          }}
        />
      </div>

      {/* Owned sessions */}
      <div>
        <h2 className="font-serif text-xl text-green-dark mb-3">{t("ownedSessions")}</h2>
        {ownedSessions.length === 0 ? (
          <p className="text-sm text-brown-mid">{t("noOwnedSessions")}</p>
        ) : (
          <div className="space-y-2">
            {ownedSessions.map((s) => (
              <Link
                key={s.id}
                href={`/${locale}/app/sessions/${s.id}/results`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#FDFBF7",
                  border: "1px solid #E8E0D0",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#3D5A3E" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B7355", marginTop: 2 }}>
                    {formatDate(s.date)} · {s.format}
                    {s.isGroup && " · Grupal"}
                  </div>
                </div>
                <StatusBadge status={s.status} labels={statusLabels} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Participated sessions */}
      <div>
        <h2 className="font-serif text-xl text-green-dark mb-3">{t("participatedSessions")}</h2>
        {participantRows.length === 0 ? (
          <p className="text-sm text-brown-mid">{t("noParticipatedSessions")}</p>
        ) : (
          <div className="space-y-2">
            {participantRows.map((row) => (
              <Link
                key={row.sessionId}
                href={`/${locale}/app/sessions/${row.sessionId}/results`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#FDFBF7",
                  border: "1px solid #E8E0D0",
                  borderRadius: 10,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#3D5A3E" }}>
                    {row.session.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B7355", marginTop: 2 }}>
                    {formatDate(row.session.date)} · {row.session.format}
                  </div>
                </div>
                <StatusBadge status={row.session.status} labels={statusLabels} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Account actions — reachable on mobile via the "Perfil" tab */}
      <div>
        <h2 className="font-serif text-xl text-green-dark mb-3">{t("account")}</h2>
        <div
          style={{
            padding: "14px",
            background: "#FDFBF7",
            border: "1px solid #E8E0D0",
            borderRadius: 10,
          }}
        >
          <div className="text-sm text-brown-mid mb-3">{user.email}</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <form action={switchAccount.bind(null, locale)}>
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[#D4C5A9] text-sm font-semibold text-brown-dark hover:bg-[#EDE8DB] transition-colors"
              >
                {t("switchAccount")}
              </button>
            </form>
            <form action={signOut}>
              <button
                type="submit"
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[#D4C5A9] text-sm font-semibold text-red-defect hover:bg-[#EBE0E0] transition-colors"
              >
                {t("logout")}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
