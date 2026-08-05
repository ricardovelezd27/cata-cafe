import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardList, CheckCircle2, Users, Star, Pencil } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { usableCoffeeWhere, type CoffeeVisibility } from "@/lib/coffeeAccess";
import { computeCoffeeAggregate } from "@/lib/coffeeAggregate";
import { FLAVOR_DESC_KEYS } from "@/lib/descriptors";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { StatCard } from "@/components/dashboard/StatCard";
import { FlavorCloud } from "@/components/results/FlavorCloud";
import { PublishResultsToggle } from "@/components/coffees/PublishResultsToggle";
import { CoffeeVisibilityToggle } from "@/components/coffees/CoffeeVisibilityToggle";
import { CoffeeShareManager } from "@/components/coffees/CoffeeShareManager";
import { Badge, ScorePill } from "@/components/ui";
import { DuplicateButton } from "@/components/DuplicateButton";
import { DeleteCoffeeButton } from "./DeleteCoffeeButton";

// Auth'd page with a dynamic [id] segment: must render per-request. With
// generateStaticParams present, prod attempts on-demand static generation and
// the cookies() call inside createClient() 500s (dev always renders dynamic,
// so the crash only appears in production). Same pattern as join/[token].
export const dynamic = "force-dynamic";

export default async function CoffeeProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("coffee");
  const th = await getTranslations("history");
  const tattr = await getTranslations("attributes");
  const ta = await getTranslations("actions");
  const tc = await getTranslations("common");
  const tsess = await getTranslations("session");

  const isAdmin = isSuperAdminEmail(user.email);

  // Record-level access gate: public coffees, ones the viewer owns, ones
  // shared with the viewer via invite link, or — super-admin god mode — any
  // coffee at all (read-only testing access).
  const coffee = await prisma.coffee.findFirst({
    where: isAdmin ? { id } : { id, AND: [usableCoffeeWhere(user.id)] },
  });

  if (!coffee) notFound();

  const isOwner = coffee.createdBy === user.id;

  const [shares, invite] = isOwner
    ? await Promise.all([
        prisma.coffeeShare.findMany({
          where: { coffeeId: id },
          include: { user: { select: { displayName: true } } },
          orderBy: { createdAt: "asc" },
        }),
        prisma.coffeeInvite.findFirst({
          where: {
            coffeeId: id,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: "desc" },
        }),
      ])
    : [[], null];

  const shareInitialToken =
    invite && (invite.maxUses === null || invite.useCount < invite.maxUses)
      ? invite.token
      : null;

  const [history, samples] = await Promise.all([
    prisma.userCoffeeHistory.findMany({
      where: { userId: user.id, coffeeId: id },
      orderBy: { tastedAt: "desc" },
      include: {
        session: { select: { id: true, name: true } },
      },
    }),
    prisma.sessionSample.findMany({
      where: { coffeeId: id },
      select: {
        id: true,
        sessionId: true,
        session: { select: { id: true, name: true, date: true } },
        aggregateScore: {
          select: { communityScore: true, participantCount: true, attrAverages: true },
        },
        evaluations: {
          where: { isDraft: false },
          select: {
            descriptiveData: true,
            combinedData: true,
            individualScore: true,
            submittedAt: true,
          },
        },
      },
    }),
  ]);

  // Visibility rule: results (counts, scores, attr averages, flavor cloud) are
  // visible to the owner always, to anyone once the owner has published them,
  // or to the super admin. Details grid and own history are unaffected.
  const showResults = isOwner || coffee.resultsPublished || isAdmin;
  const aggregate = computeCoffeeAggregate(samples);

  // A single representative descriptor blob (union of every evaluation's
  // flavor/aroma ids) seeds which pills FlavorCloud renders; `allDescriptive`
  // + `isGroup` then layer on per-descriptor frequency counts.
  const unionDescriptive: Record<string, unknown> = {};
  for (const key of FLAVOR_DESC_KEYS) {
    unionDescriptive[key] = aggregate.allDescriptive.flatMap((blob) => {
      const arr = blob[key];
      return Array.isArray(arr) ? arr : [];
    });
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-primary-container font-semibold">{coffee.name}</h1>
          {coffee.variety && (
            <p className="text-sm text-on-surface-variant mt-1">{coffee.variety}</p>
          )}
          {isAdmin && !isOwner && (
            <div className="mt-2">
              <Badge tone="accent">{t("adminBadge")}</Badge>
            </div>
          )}
          {!isOwner && coffee.visibility === "shared" && (
            <div className="mt-2">
              <Badge tone="accent">{t("share.sharedWithYou")}</Badge>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {coffee.createdBy === user.id && (
            <Link
              href={`/${locale}/app/coffees/${coffee.id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-pill border border-primary-container px-4 py-2 text-sm font-medium text-primary-container transition-colors hover:bg-primary-fixed"
            >
              <Pencil size={16} aria-hidden />
              {tc("edit")}
            </Link>
          )}
          {/* Anyone who can use the coffee can copy it as a template */}
          <DuplicateButton
            kind="coffee"
            id={coffee.id}
            locale={locale}
            label={tc("duplicate")}
            errorText={tc("duplicateError")}
          />
          {coffee.createdBy === user.id && (
            <DeleteCoffeeButton
              coffeeId={coffee.id}
              locale={locale}
              label={ta("delete")}
              translations={{
                title: t("deleteCoffee.title"),
                body: t("deleteCoffee.body"),
                confirm: t("deleteCoffee.confirm"),
                cancel: t("deleteCoffee.cancel"),
                error: t("deleteCoffee.error"),
              }}
            />
          )}
        </div>
      </div>

      {/* Visibility controls (owner only) */}
      {isOwner && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5 space-y-4">
          <h2 className="font-display text-lg text-primary-container font-semibold">
            {t("visibilityTitle")}
          </h2>
          <div className="space-y-1.5">
            <CoffeeVisibilityToggle
              coffeeId={coffee.id}
              visibility={coffee.visibility as CoffeeVisibility}
              translations={{
                recordPublic: t("recordPublic"),
                recordPrivate: t("recordPrivate"),
                recordShared: t("recordShared"),
                confirmMakePublic: t("confirmMakePublic"),
              }}
            />
            <p className="text-xs text-on-surface-variant">{t("recordHint")}</p>
          </div>
          <div className="space-y-1.5">
            <PublishResultsToggle
              coffeeId={coffee.id}
              resultsPublished={coffee.resultsPublished}
              translations={{
                published: t("published"),
                unpublished: t("unpublished"),
                publish: t("publish"),
                unpublish: t("unpublish"),
                confirmPublish: t("confirmPublish"),
              }}
            />
            <p className="text-xs text-on-surface-variant">{t("resultsHint")}</p>
          </div>
          {coffee.resultsPublished && coffee.visibility !== "public" && (
            <p className="text-xs text-secondary font-medium">
              {t("resultsButPrivateHint")}
            </p>
          )}

          <div className="border-t border-outline-variant/50 pt-4">
            <CoffeeShareManager
              coffeeId={coffee.id}
              locale={locale}
              initialToken={shareInitialToken}
              shares={shares.map((s) => ({ userId: s.userId, displayName: s.user.displayName }))}
              translations={{
                title: t("share.title"),
                generateLink: t("share.generateLink"),
                generating: t("share.generating"),
                copyLink: t("share.copyLink"),
                copied: t("share.copied"),
                peopleWithAccess: t("share.peopleWithAccess"),
                noShares: t("share.noShares"),
                revoke: t("share.revoke"),
                linkHint: t("share.linkHint"),
              }}
            />
          </div>
        </div>
      )}

      {/* Community results */}
      <div>
        <h2 className="font-display text-xl text-primary-container font-semibold mb-4">
          {t("resultsTitle")}
        </h2>

        {!showResults ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5">
            <p className="text-sm text-on-surface-variant">{t("resultsPrivate")}</p>
          </div>
        ) : samples.length === 0 ? (
          <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5">
            <p className="text-sm text-on-surface-variant">{t("noResults")}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stat tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label={t("statSessions")}
                value={String(aggregate.sessionsCount)}
                subtext=""
                icon={<ClipboardList size={18} />}
              />
              <StatCard
                label={t("statEvals")}
                value={String(aggregate.evaluationsCount)}
                subtext=""
                icon={<CheckCircle2 size={18} />}
              />
              <StatCard
                label={t("statCommunityAvg")}
                value={aggregate.communityAvg != null ? aggregate.communityAvg.toFixed(2) : "—"}
                subtext=""
                accent
                icon={<Users size={18} />}
              />
              <StatCard
                label={t("statIndividualAvg")}
                value={aggregate.individualAvg != null ? aggregate.individualAvg.toFixed(2) : "—"}
                subtext=""
                icon={<Star size={18} />}
              />
            </div>

            {/* Attribute averages */}
            {Object.keys(aggregate.attrAverages).length > 0 && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5">
                <h3 className="font-display text-lg text-primary-container font-semibold mb-4">
                  {t("attrAveragesTitle")}
                </h3>
                <div className="flex flex-col gap-3">
                  {AFFECTIVE_ATTRIBUTES.filter(
                    (attr) => aggregate.attrAverages[attr.label] != null,
                  ).map((attr) => {
                    const value = aggregate.attrAverages[attr.label];
                    return (
                      <div key={attr.id} className="flex items-center gap-3">
                        <span className="text-xs text-on-surface-variant w-36 shrink-0">
                          {tattr(attr.id)}
                        </span>
                        <div className="flex-1 h-2 rounded-full bg-surface-container overflow-hidden">
                          <div
                            className="h-full bg-primary-container rounded-full"
                            style={{ width: `${Math.min(100, (value / 9) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-on-surface w-8 text-right">
                          {value.toFixed(1)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Flavor cloud */}
            {aggregate.allDescriptive.length > 0 && (
              <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5">
                <h3 className="font-display text-lg text-primary-container font-semibold mb-2">
                  {t("flavorsTitle")}
                </h3>
                <FlavorCloud
                  descriptive={unionDescriptive}
                  allDescriptive={aggregate.allDescriptive}
                  isGroup
                  locale={locale === "en" ? "en" : "es"}
                />
              </div>
            )}

            {/* Per-session appearances */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-card overflow-hidden">
              <h3 className="font-display text-lg text-primary-container font-semibold p-5 pb-3">
                {t("sessionsListTitle")}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {aggregate.sessionRows.map((row, i) => (
                    <tr key={`${row.sessionId}-${i}`} className="border-t border-outline-variant/50">
                      <td className="px-5 py-2 text-on-surface">
                        {isOwner ? (
                          <Link
                            href={`/${locale}/app/sessions/${row.sessionId}/results`}
                            className="text-primary-container hover:underline"
                          >
                            {row.sessionName}
                          </Link>
                        ) : (
                          row.sessionName
                        )}
                      </td>
                      <td className="px-5 py-2 text-right text-on-surface-variant text-xs">
                        {row.sessionDate.toLocaleDateString(
                          locale === "es" ? "es-CO" : "en-US",
                          { year: "numeric", month: "short", day: "numeric" },
                        )}
                      </td>
                      <td className="px-5 py-2 text-right">
                        <ScorePill score={row.communityScore} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Recent tastings (anonymous — never shows cupper identity) */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5">
              <h3 className="font-display text-lg text-primary-container font-semibold mb-3">
                {t("recentTastingsTitle")}
              </h3>
              {aggregate.recentEvaluations.length === 0 ? (
                <p className="text-sm text-on-surface-variant">{t("recentTastingsEmpty")}</p>
              ) : (
                <ul className="divide-y divide-outline-variant">
                  {aggregate.recentEvaluations.map((ev, i) => (
                    <li
                      key={i}
                      className="py-2 first:pt-0 last:pb-0 flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-on-surface">{ev.sessionName}</span>
                      <span className="flex items-baseline gap-3">
                        <ScorePill score={ev.individualScore} />
                        <span className="text-xs text-on-surface-variant whitespace-nowrap">
                          {ev.submittedAt.toLocaleDateString(
                            locale === "es" ? "es-CO" : "en-US",
                            { year: "numeric", month: "short", day: "numeric" },
                          )}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="bg-surface border border-outline-variant rounded-card p-5 grid grid-cols-2 gap-4">
        {coffee.country && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("country")}
            </p>
            <p className="text-sm text-on-surface">{coffee.country}</p>
          </div>
        )}
        {coffee.region && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("region")}
            </p>
            <p className="text-sm text-on-surface">{coffee.region}</p>
          </div>
        )}
        {coffee.farm && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("farm")}
            </p>
            <p className="text-sm text-on-surface">{coffee.farm}</p>
          </div>
        )}
        {coffee.producer && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("producer")}
            </p>
            <p className="text-sm text-on-surface">{coffee.producer}</p>
          </div>
        )}
        {coffee.species && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("species")}
            </p>
            <p className="text-sm text-on-surface">{coffee.species}</p>
          </div>
        )}
        {coffee.variety && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("variety")}
            </p>
            <p className="text-sm text-on-surface">{coffee.variety}</p>
          </div>
        )}
        {coffee.harvestYear && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("harvest")}
            </p>
            <p className="text-sm text-on-surface">{coffee.harvestYear}</p>
          </div>
        )}
        {coffee.processType && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("process")}
            </p>
            <p className="text-sm text-on-surface">{coffee.processType}</p>
          </div>
        )}
        {coffee.altitude && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("altitude")}
            </p>
            <p className="text-sm text-on-surface">{coffee.altitude}</p>
          </div>
        )}
        {coffee.roastLevel && (
          <div>
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("roastLevel")}
            </p>
            <p className="text-sm text-on-surface">{coffee.roastLevel}</p>
          </div>
        )}
        {coffee.certifications.length > 0 && (
          <div className="col-span-2">
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-1">
              {t("certifications")}
            </p>
            <div className="flex flex-wrap gap-2">
              {coffee.certifications.map((c) => (
                <span
                  key={c}
                  className="text-xs px-2 py-0.5 rounded-pill bg-secondary/20 text-on-surface border border-secondary/40"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
        {coffee.notes && (
          <div className="col-span-2">
            <p className="text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5">
              {t("newPage.notes")}
            </p>
            <p className="text-sm text-on-surface whitespace-pre-wrap">{coffee.notes}</p>
          </div>
        )}
      </div>

      {/* Tasting history */}
      <div>
        <h2 className="font-display text-xl text-primary-container font-semibold mb-4">
          {t("tastingHistory")}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-on-surface-variant">{th("empty")}</p>
        ) : (
          <div className="bg-surface border border-outline-variant rounded-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container/50">
                  <th className="text-left px-4 py-2 text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
                    {tsess("table.colName")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
                    {th("yourScore")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
                    {th("communityScore")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-on-surface-variant font-semibold uppercase tracking-wide">
                    {th("tasted")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr
                    key={h.id}
                    className={i < history.length - 1 ? "border-b border-outline-variant/50" : ""}
                  >
                    <td className="px-4 py-2 text-on-surface">{h.session.name}</td>
                    <td className="px-4 py-2 text-right">
                      <ScorePill score={h.individualScore} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <ScorePill score={h.communityScore} />
                    </td>
                    <td className="px-4 py-2 text-right text-on-surface-variant text-xs">
                      {h.tastedAt.toLocaleDateString(
                        locale === "es" ? "es-CO" : "en-US",
                        { year: "numeric", month: "short", day: "numeric" },
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
