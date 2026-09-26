import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList,
  CheckCircle2,
  Users,
  Star,
  Pencil,
  Coffee as CoffeeIcon,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { usableCoffeeWhere, type CoffeeVisibility } from "@/lib/coffeeAccess";
import { computeCoffeeAggregate } from "@/lib/coffeeAggregate";
import { formatCoffeeCode } from "@/lib/coffeeCode";
import { FLAVOR_DESC_KEYS } from "@/lib/descriptors";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { StatCard } from "@/components/dashboard/StatCard";
import { FlavorCloud } from "@/components/results/FlavorCloud";
import { PublishResultsToggle } from "@/components/coffees/PublishResultsToggle";
import { CoffeeVisibilityToggle } from "@/components/coffees/CoffeeVisibilityToggle";
import { CoffeeShareManager } from "@/components/coffees/CoffeeShareManager";
import { VisibilityBadge } from "@/components/coffees/CoffeesTable";
import {
  DeleteCoffeeButton,
  type DeleteCoffeeTranslations,
} from "@/components/coffees/DeleteCoffeeButton";
import { Badge, ButtonLink, ScorePill } from "@/components/ui";
import { DuplicateButton } from "@/components/DuplicateButton";

// Auth'd page with a dynamic [id] segment: must render per-request. With
// generateStaticParams present, prod attempts on-demand static generation and
// the cookies() call inside createClient() 500s (dev always renders dynamic,
// so the crash only appears in production). Same pattern as join/[token].
export const dynamic = "force-dynamic";

// Layout mirrors app/[locale]/app/profile/page.tsx on purpose (banner →
// overlapping identity card + stats → sensory profile + activity → details →
// owner settings) so a coffee "profile" reads like a user profile.
const GRID_2COL = "grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]";
const CARD = "rounded-card border border-outline-variant bg-surface-container-lowest p-6 shadow-card";
const SUB_H3 = "text-xs font-semibold uppercase tracking-wide text-on-surface-variant";
const LIST_ROW =
  "flex items-center justify-between gap-3 rounded-card border border-outline-variant bg-surface px-4 py-2.5";
const FIELD_LABEL = "text-xs text-on-surface-variant font-semibold uppercase tracking-wide mb-0.5";

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
  const tc = await getTranslations("common");
  const tProfile = await getTranslations("profile");

  const isAdmin = isSuperAdminEmail(user.email);

  // Record-level access gate: public coffees, ones the viewer owns, ones
  // shared with the viewer via invite link, or — super-admin god mode — any
  // coffee at all (read-only testing access). An anonymized coffee
  // (deletedAt) has no profile for anyone, admin included.
  const coffee = await prisma.coffee.findFirst({
    where: isAdmin ? { id, deletedAt: null } : { id, AND: [usableCoffeeWhere(user.id)] },
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
        // sessionId/session can be null — a deleted session detaches the row
        // instead of cascading it away, leaving `snapshot` as the fallback.
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
  const hasResults = samples.length > 0;

  // The viewer's own average across their history rows — the one number that
  // is meaningful even when the owner keeps community results private.
  const ownScores = history
    .map((h) => h.individualScore)
    .filter((s): s is number => typeof s === "number");
  const yourAvg =
    ownScores.length > 0
      ? Math.round((ownScores.reduce((a, b) => a + b, 0) / ownScores.length) * 100) / 100
      : null;

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

  const formatDate = (d: Date) =>
    d.toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const origin = [coffee.country, coffee.region].filter(Boolean).join(", ");
  const metaLine = [coffee.variety, origin, coffee.processType].filter(Boolean).join(" · ");

  const visibilityLabels = {
    public: t("listPublic"),
    shared: t("listShared"),
    private: t("listPrivate"),
  };

  const deleteTranslations: DeleteCoffeeTranslations = {
    title: t("deleteCoffee.title"),
    titleMany: t.raw("deleteCoffee.titleMany"),
    body: t("deleteCoffee.body"),
    confirm: t("deleteCoffee.confirm"),
    confirmMany: t.raw("deleteCoffee.confirmMany"),
    cancel: t("deleteCoffee.cancel"),
    error: t("deleteCoffee.error"),
    loadingImpact: t("deleteCoffee.loadingImpact"),
    impact: t.raw("deleteCoffee.impact"),
    moreNames: t.raw("deleteCoffee.moreNames"),
    success: t("deleteCoffee.success"),
    successMany: t.raw("deleteCoffee.successMany"),
    partial: t.raw("deleteCoffee.partial"),
  };

  const detailFields: Array<{ label: string; value: string | null }> = [
    { label: t("country"), value: coffee.country },
    { label: t("region"), value: coffee.region },
    { label: t("farm"), value: coffee.farm },
    { label: t("producer"), value: coffee.producer },
    { label: t("species"), value: coffee.species },
    { label: t("variety"), value: coffee.variety },
    { label: t("harvest"), value: coffee.harvestYear },
    { label: t("process"), value: coffee.processType },
    { label: t("altitude"), value: coffee.altitude },
    { label: t("roastLevel"), value: coffee.roastLevel },
  ];
  const filledFields = detailFields.filter((f) => !!f.value);

  const privateNotice = (
    <p className="text-sm text-on-surface-variant">{t("resultsPrivate")}</p>
  );

  return (
    <div>
      {/* Banner — same brand-toned strip as the user profile */}
      <div className="h-32 rounded-card bg-gradient-to-r from-primary via-primary-container to-primary shadow-card sm:h-40" />

      <div className="relative -mt-10 space-y-6 px-2 sm:px-4">
        {/* Row 1 — identity card + stats */}
        <div className={GRID_2COL}>
          <div className={CARD}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="-mt-14 shrink-0 rounded-full ring-4 ring-surface-container-lowest">
                <div
                  className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-primary-container text-on-primary"
                  aria-hidden
                >
                  <CoffeeIcon size={40} />
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {isOwner && (
                  <ButtonLink
                    href={`/${locale}/app/coffees/${coffee.id}/edit`}
                    variant="secondary"
                    size="sm"
                    icon={<Pencil size={15} aria-hidden />}
                  >
                    {tc("edit")}
                  </ButtonLink>
                )}
                {/* Anyone who can use the coffee can copy it as a template */}
                <DuplicateButton
                  kind="coffee"
                  id={coffee.id}
                  locale={locale}
                  label={tc("duplicate")}
                  errorText={tc("duplicateError")}
                />
                {isOwner && (
                  <DeleteCoffeeButton
                    variant="pill"
                    coffeeIds={[coffee.id]}
                    coffeeNames={[coffee.name]}
                    label={tc("delete")}
                    redirectTo={`/${locale}/app/coffees`}
                    translations={deleteTranslations}
                  />
                )}
              </div>
            </div>

            <div className="mt-3">
              <h1 className="font-display text-2xl text-on-surface">{coffee.name}</h1>
              {coffee.code && (
                <span className="mt-1 inline-block rounded-pill border border-outline-variant bg-surface-container px-2.5 py-0.5 font-mono text-xs text-on-surface-variant">
                  {formatCoffeeCode(coffee.code)}
                </span>
              )}
              {metaLine && (
                <div className="mt-1 text-xs font-medium text-on-surface-variant">{metaLine}</div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {(isOwner || isAdmin) && (
                  <VisibilityBadge visibility={coffee.visibility} labels={visibilityLabels} />
                )}
                {isOwner && (
                  <Badge tone={coffee.resultsPublished ? "success" : "neutral"}>
                    {coffee.resultsPublished ? t("published") : t("unpublished")}
                  </Badge>
                )}
                {!isOwner && coffee.visibility === "shared" && (
                  <Badge tone="accent">{t("share.sharedWithYou")}</Badge>
                )}
                {isAdmin && !isOwner && <Badge tone="accent">{t("adminBadge")}</Badge>}
              </div>
            </div>

            {coffee.notes && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-on-surface">
                {coffee.notes}
              </p>
            )}
          </div>

          <div className="grid content-start grid-cols-2 gap-3 xl:grid-cols-4">
            {showResults ? (
              <>
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
              </>
            ) : (
              <div className="col-span-2 flex items-center rounded-card border border-outline-variant bg-surface-container-lowest p-5 shadow-card xl:col-span-3">
                {privateNotice}
              </div>
            )}
            <Link href="#historial" className="block">
              <StatCard
                label={t("statYourAvg")}
                value={yourAvg != null ? yourAvg.toFixed(2) : "—"}
                subtext={tProfile("viewHistory")}
                icon={<Star size={18} />}
              />
            </Link>
          </div>
        </div>

        {/* Row 2 — sensory profile + activity */}
        <div className={GRID_2COL}>
          <div className="flex flex-col gap-4 rounded-card border border-outline-variant bg-surface-container-lowest p-5">
            <h2 className={SUB_H3}>{t("sensoryTitle")}</h2>
            {!showResults ? (
              privateNotice
            ) : !hasResults ? (
              <p className="text-sm text-on-surface-variant">{t("noResults")}</p>
            ) : (
              <>
                {Object.keys(aggregate.attrAverages).length > 0 && (
                  <div>
                    <h3 className="mb-3 font-display text-lg text-primary-container">
                      {t("attrAveragesTitle")}
                    </h3>
                    <div className="flex flex-col gap-3">
                      {AFFECTIVE_ATTRIBUTES.filter(
                        (attr) => aggregate.attrAverages[attr.label] != null,
                      ).map((attr) => {
                        const value = aggregate.attrAverages[attr.label];
                        return (
                          <div key={attr.id} className="flex items-center gap-3">
                            <span className="w-28 shrink-0 text-xs text-on-surface-variant">
                              {tattr(attr.id)}
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container">
                              <div
                                className="h-full rounded-full bg-primary-container"
                                style={{ width: `${Math.min(100, (value / 9) * 100)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-xs font-semibold text-on-surface">
                              {value.toFixed(1)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {aggregate.allDescriptive.length > 0 && (
                  <div className="border-t border-outline-variant/50 pt-4">
                    <h3 className="mb-2 font-display text-lg text-primary-container">
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
              </>
            )}
          </div>

          <div className={`space-y-6 ${CARD}`}>
            <h2 className="font-display text-xl text-primary-container">{t("activityTitle")}</h2>

            {showResults && (
              <section>
                <h3 className={`mb-2 ${SUB_H3}`}>{t("sessionsListTitle")}</h3>
                {aggregate.sessionRows.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">{t("noResults")}</p>
                ) : (
                  <div className="space-y-2">
                    {aggregate.sessionRows.map((row, i) => {
                      const inner = (
                        <>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-on-surface">
                              {row.sessionName}
                            </div>
                            <div className="mt-0.5 text-xs text-on-surface-variant">
                              {formatDate(row.sessionDate)}
                            </div>
                          </div>
                          <ScorePill score={row.communityScore} />
                        </>
                      );
                      // Session results are the owner's to open; others only
                      // see the appearance + community score.
                      return isOwner ? (
                        <Link
                          key={`${row.sessionId}-${i}`}
                          href={`/${locale}/app/sessions/${row.sessionId}/results`}
                          className={`${LIST_ROW} transition-colors hover:bg-surface-container-low`}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div key={`${row.sessionId}-${i}`} className={LIST_ROW}>
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {showResults && (
              <section>
                <h3 className={`mb-2 ${SUB_H3}`}>{t("recentTastingsTitle")}</h3>
                {/* Anonymous — never shows cupper identity */}
                {aggregate.recentEvaluations.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">{t("recentTastingsEmpty")}</p>
                ) : (
                  <ul className="divide-y divide-outline-variant/50">
                    {aggregate.recentEvaluations.map((ev, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0"
                      >
                        <span className="truncate text-on-surface">{ev.sessionName}</span>
                        <span className="flex shrink-0 items-baseline gap-3">
                          <ScorePill score={ev.individualScore} />
                          <span className="whitespace-nowrap text-xs text-on-surface-variant">
                            {formatDate(ev.submittedAt)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <section id="historial">
              <div className="mb-2 flex items-center justify-between">
                <h3 className={SUB_H3}>{t("tastingHistory")}</h3>
                <Link
                  href={`/${locale}/app/profile/history`}
                  className="text-xs font-semibold text-primary-container hover:underline"
                >
                  {tProfile("viewHistory")}
                </Link>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-on-surface-variant">{th("empty")}</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => {
                    const snapshot = h.snapshot as { sessionName?: string } | null;
                    const sessionName = h.session?.name ?? snapshot?.sessionName ?? "—";
                    return (
                      <div key={h.id} className={LIST_ROW}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold text-on-surface">
                              {sessionName}
                            </span>
                            {!h.session && (
                              <Badge tone="outline" size="xs">
                                {th("sessionDeleted")}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-on-surface-variant">
                            {formatDate(h.tastedAt)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-3">
                          <span className="flex flex-col items-end gap-0.5">
                            <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                              {th("yourScore")}
                            </span>
                            <ScorePill score={h.individualScore} />
                          </span>
                          <span className="flex flex-col items-end gap-0.5">
                            <span className="text-[10px] uppercase tracking-wide text-on-surface-variant">
                              {th("communityScore")}
                            </span>
                            <ScorePill score={h.communityScore} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Ficha técnica */}
        <section>
          <h2 className="mb-3 font-display text-xl text-primary-container">{t("detailsTitle")}</h2>
          <div className="grid grid-cols-2 gap-4 rounded-card border border-outline-variant bg-surface-container-lowest p-5 sm:grid-cols-3 lg:grid-cols-4">
            {filledFields.map((f) => (
              <div key={f.label}>
                <p className={FIELD_LABEL}>{f.label}</p>
                <p className="text-sm text-on-surface">{f.value}</p>
              </div>
            ))}
            {coffee.certifications.length > 0 && (
              <div className="col-span-full">
                <p className={`${FIELD_LABEL} mb-1`}>{t("certifications")}</p>
                <div className="flex flex-wrap gap-2">
                  {coffee.certifications.map((c) => (
                    <span
                      key={c}
                      className="rounded-pill border border-secondary/40 bg-secondary/20 px-2 py-0.5 text-xs text-on-surface"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {filledFields.length === 0 && coffee.certifications.length === 0 && (
              <p className="col-span-full text-sm text-on-surface-variant">—</p>
            )}
          </div>
        </section>

        {/* Visibility & sharing (owner only) — the "Cuenta" slot of the user profile */}
        {isOwner && (
          <section>
            <h2 className="mb-3 font-display text-xl text-primary-container">
              {t("visibilityTitle")}
            </h2>
            <div className="space-y-4 rounded-card border border-outline-variant bg-surface-container-lowest p-5">
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
                <p className="text-xs font-medium text-secondary">{t("resultsButPrivateHint")}</p>
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
          </section>
        )}
      </div>
    </div>
  );
}
