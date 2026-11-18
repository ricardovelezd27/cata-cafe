import { notFound } from "next/navigation";
import { profileDisplayName } from "@/lib/accountDeletion/deletedProfile";
import { requireAppUser } from "@/lib/auth";
import Link from "next/link";
import {
  Star,
  Pencil,
  FileDown,
  Coffee as CoffeeIcon,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import { usableCoffeeWhere, type CoffeeVisibility } from "@/lib/coffeeAccess";
import { computeCoffeeAggregate } from "@/lib/coffeeAggregate";
import { loadCoffeeAggregateSamples } from "@/lib/coffees/aggregateSamples";
import { computeCoffeeLifetimeScore } from "@/lib/coffeeLifetimeScore";
import { buildLifetimeLines, type LifetimeLabels } from "@/lib/coffeeLifetimeLines";
import { CoffeeScoreBlock } from "@/components/coffees/CoffeeScoreBlock";
import { EmptyState } from "@/components/ui/EmptyState";
import { QUALITY_SCALE, scalePct } from "@/lib/resultsScales";
import { historyCommunityScoreShown } from "@/lib/coffeePageDisplay";
import { formatCoffeeCode } from "@/lib/coffeeCode";
import { FLAVOR_DESC_KEYS } from "@/lib/descriptors";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { StatCard } from "@/components/dashboard/StatCard";
import { FlavorCloud } from "@/components/coffees/FlavorCloud";
import { PublishResultsToggle } from "@/components/coffees/PublishResultsToggle";
import { CoffeeVisibilityToggle } from "@/components/coffees/CoffeeVisibilityToggle";
import { CoffeeShareManager } from "@/components/coffees/CoffeeShareManager";
import { VisibilityBadge } from "@/components/coffees/CoffeesTable";
import {
  DeleteCoffeeButton,
  type DeleteCoffeeTranslations,
} from "@/components/coffees/DeleteCoffeeButton";
import { Badge, ButtonLink, ScorePill, TextActionLink } from "@/components/ui";
import { ReportLink } from "@/components/ui/ReportLink";
import { coffeeSessionOriginEditedAt } from "@/lib/originEdit";
import { historyCupsPerSample, isQuickImpression } from "@/lib/historyRules";
import { DuplicateButton } from "@/components/DuplicateButton";
import { Card } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageBackLink } from "@/components/ui/PageHeader";

// Auth'd page with a dynamic [id] segment: must render per-request. With
// generateStaticParams present, prod attempts on-demand static generation and
// the cookies() call inside createClient() 500s (dev always renders dynamic,
// so the crash only appears in production). Same pattern as join/[token].
export const dynamic = "force-dynamic";

// Layout mirrors app/[locale]/app/profile/page.tsx on purpose (banner →
// overlapping identity card + stats → sensory profile + activity → details →
// owner settings) so a coffee "profile" reads like a user profile.
const GRID_2COL = "grid gap-6 lg:grid-cols-[minmax(320px,380px)_1fr]";
// Uppercase label headings (DESIGN.md "Uppercase label": UI font, 600, on-surface-variant).
const SUB_H3 = "label-caps font-sans";
// P2c (D-07): rows of a list inside a card, separated by hairlines (cards do not nest).
const LIST_ROW = "flex items-center justify-between gap-3 py-[10px]";
const FIELD_LABEL = "label-caps mb-0.5";

export default async function CoffeeProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireAppUser(locale, `/${locale}/app/coffees/${id}`);

  const t = await getTranslations("coffee");
  const th = await getTranslations("history");
  const tattr = await getTranslations("attributes");
  const tc = await getTranslations("common");
  const ta = await getTranslations("actions");
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
        session: { select: { id: true, name: true, cupsPerSample: true } },
      },
    }),
    loadCoffeeAggregateSamples(id, { userId: user.id, isAdmin }),
  ]);

  // Visibility rule: results (counts, scores, attr averages, flavor cloud) are
  // visible to the owner always, to anyone once the owner has published them,
  // or to the super admin. Details grid and own history are unaffected.
  const showResults = isOwner || coffee.resultsPublished || isAdmin;
  const aggregate = computeCoffeeAggregate(samples);
  // S10 WP1c: the coffee's headline score is its own lifetime computation (every
  // cup ever cupped, current rule), not an average of stored session scores.
  // Numbers only; same gate as the rest of the community block (showResults).
  const lifetime = computeCoffeeLifetimeScore(samples.map((s) => s.lifetime));
  const lifetimeLines = buildLifetimeLines(lifetime, t.raw("lifetime") as LifetimeLabels);
  const hasResults = samples.length > 0;
  // Sessions whose community score the "Apariciones en sesiones" list already shows.
  const sessionRowIds = new Set(showResults ? aggregate.sessionRows.map((r) => r.sessionId) : []);

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
    <p className="text-caption text-on-surface-variant">{t("resultsPrivate")}</p>
  );

  return (
    <PageContainer>
    {/* D-06 (P1c): the back link every detail page opens with. The banner layout stays,
        as on the profile: the identity card holds the page's one h1. */}
    <PageBackLink href={`/${locale}/app/coffees`} label={ta("back")} />
    <div>
      {/* Banner — same brand-toned strip as the user profile */}
      <div className="h-32 rounded-card bg-gradient-to-r from-primary via-primary-container to-primary shadow-card sm:h-40" />

      <div className="relative -mt-10 space-y-6 px-2 sm:px-4">
        {/* Row 1 — identity card + stats */}
        <div className={GRID_2COL}>
          {/* P2c (D-07): the identity block is a Card (one border, no shadow). */}
          <Card>
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
                {/* Opens the session wizard with this coffee already linked
                    (validated server-side with usableCoffeeWhere). */}
                <ButtonLink
                  href={`/${locale}/app/sessions/new?coffeeId=${coffee.id}`}
                  variant="primary"
                  size="sm"
                >
                  {t("tasteThis")}
                </ButtonLink>
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
              <h1 className="page-title">{coffee.name}</h1>
              {coffee.code && (
                <span className="mt-1 inline-block">
                  <Badge tone="outline">{formatCoffeeCode(coffee.code)}</Badge>
                </span>
              )}
              {metaLine && (
                <div className="mt-1 text-caption font-medium text-on-surface-variant">{metaLine}</div>
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

            {coffee.notes && (isOwner || isAdmin) && (
              <p className="mt-4 whitespace-pre-wrap text-body leading-relaxed text-on-surface">
                {coffee.notes}
              </p>
            )}
          </Card>

          <div className="grid content-start grid-cols-2 gap-3 xl:grid-cols-4">
            {showResults ? (
              // I-07: one score block. The number, what it rests on, and the
              // arithmetic, the defect tally, the counts and the latest
              // evaluations on demand. Same lines, same gate as before.
              <CoffeeScoreBlock
                title={t("lifetime.title")}
                lines={lifetimeLines}
                showLines={hasResults}
                counts={{
                  sessionsLabel: t("statSessions"),
                  sessions: aggregate.sessionsCount,
                  evaluationsLabel: t("statEvals"),
                  evaluations: aggregate.evaluationsCount,
                }}
                detailsLabel={t("scoreDetails")}
              >
              <section className="mt-2 border-t border-outline-variant/50 pt-3">
                <h3 className={`mb-2 ${SUB_H3}`}>{t("recentTastingsTitle")}</h3>
                {/* Anonymous — never shows cupper identity */}
                {aggregate.recentEvaluations.length === 0 ? (
                  <EmptyState title={t("recentTastingsEmpty")} />
                ) : (
                  <ul className="divide-y divide-outline-variant/50">
                    {aggregate.recentEvaluations.map((ev, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between gap-3 py-2 text-caption first:pt-0 last:pb-0"
                      >
                        <span className="truncate text-on-surface">{ev.sessionName}</span>
                        <span className="flex shrink-0 items-baseline gap-3">
                          <ScorePill score={ev.individualScore} />
                          <span className="whitespace-nowrap text-caption text-on-surface-variant">
                            {formatDate(ev.submittedAt)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              </CoffeeScoreBlock>
            ) : (
              // P2c (E-05): a notice, not a card. Part of the page, so not announced.
              <Notice tone="info" live={false} className="col-span-2 xl:col-span-3">
                {t("resultsPrivate")}
              </Notice>
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
          {/* P2c (B-04, D-07): the section heading above its card; the card's own titles are
              level 3. The h2 was an 11 px label over 17.5 px h3s. */}
          <section>
          <PaperSectionHeading title={t("sensoryTitle")} />
          <Card className="flex flex-col gap-4">
            {!showResults ? (
              privateNotice
            ) : !hasResults ? (
              <EmptyState title={t("noResults")} />
            ) : (
              <>
                {Object.keys(aggregate.attrAverages).length > 0 && (
                  <div>
                    <PaperSectionHeading level={3} title={t("attrAveragesTitle")} />
                    <div className="flex flex-col gap-3">
                      {AFFECTIVE_ATTRIBUTES.filter(
                        (attr) => aggregate.attrAverages[attr.label] != null,
                      ).map((attr) => {
                        const value = aggregate.attrAverages[attr.label];
                        return (
                          <div key={attr.id} className="flex items-center gap-3">
                            <span className="w-28 shrink-0 text-caption text-on-surface-variant">
                              {tattr(attr.id)}
                            </span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-container">
                              <div
                                className="h-full rounded-full bg-primary-container"
                                style={{ width: `${scalePct(value, QUALITY_SCALE.min, QUALITY_SCALE.max)}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-caption font-semibold text-on-surface">
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
                    <PaperSectionHeading level={3} title={t("flavorsTitle")} />
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
          </Card>
          </section>

          {/* P2c: the same anatomy for the activity: heading, then its card. */}
          <section>
          <PaperSectionHeading title={t("activityTitle")} />
          <Card className="space-y-6">

            {showResults && (
              <section>
                <PaperSectionHeading level={3} title={t("sessionsListTitle")} />
                <p className="mb-2 font-sans text-caption text-on-surface-variant">{tc("scoreLegend")}</p>
                {aggregate.sessionRows.length === 0 ? (
                  <EmptyState
                    title={aggregate.sessionsCount > 0 ? t("sessionsOthersNote") : t("noResults")}
                  />
                ) : (
                  <div className="divide-y divide-outline-variant">
                    {aggregate.sessionRows.map((row, i) => (
                      // Only sessions the viewer owns or joined reach this list
                      // (filterCoffeeSamples), so every row can open its results.
                      <Link
                        key={`${row.sessionId}-${i}`}
                        href={`/${locale}/app/sessions/${row.sessionId}/results`}
                        className={`${LIST_ROW} -mx-[8px] min-h-[44px] rounded-sm px-[8px] transition-colors hover:bg-surface-container-low`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-caption font-semibold text-on-surface">
                            {row.sessionName}
                          </div>
                          <div className="mt-0.5 text-caption text-on-surface-variant">
                            {formatDate(row.sessionDate)}
                          </div>
                          {(() => {
                            // F-cafes-9: this coffee's origin data is live; say so when it changed after that session closed.
                            const edited = coffeeSessionOriginEditedAt({
                              sessionClosedAt: row.sessionClosedAt,
                              sessionClosesAt: row.sessionClosesAt,
                              coffeeOriginEditedAt: coffee.originEditedAt,
                            });
                            return edited ? (
                              <div className="mt-0.5 text-caption text-secondary">
                                {t("originEditedNote", { date: formatDate(edited) })}
                              </div>
                            ) : null;
                          })()}
                        </div>
                        <ScorePill score={row.communityScore} />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section id="historial">
              <PaperSectionHeading
                level={3}
                title={t("tastingHistory")}
                action={
                  <TextActionLink href={`/${locale}/app/profile/history`} className="-my-[15px]">
                    {tProfile("viewHistory")}
                  </TextActionLink>
                }
              />
              {history.length === 0 ? (
                // The page's header already offers "Catar este café": point to it in words.
                <EmptyState title={th("empty")} body={t("historyEmptyBody")} />
              ) : (
                <div className="divide-y divide-outline-variant">
                  {history.map((h) => {
                    const snapshot = h.snapshot as { sessionName?: string; cupsPerSample?: number } | null;
                    const quick = isQuickImpression(historyCupsPerSample(h.session, snapshot));
                    const sessionName = h.session?.name ?? snapshot?.sessionName ?? "—";
                    return (
                      <div key={h.id} className={LIST_ROW}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-caption font-semibold text-on-surface">
                              {sessionName}
                            </span>
                            {!h.session && (
                              <Badge tone="outline" size="xs">
                                {th("sessionDeleted")}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 text-caption text-on-surface-variant">
                            {formatDate(h.tastedAt)}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-start gap-3">
                          <span className="flex flex-col items-end gap-0.5">
                            <span className="label-caps">
                              {th("yourScore")}
                            </span>
                            <ScorePill score={h.individualScore} />
                            {quick && (
                              <Badge tone="outline" size="xs">
                                {th("quickImpression")}
                              </Badge>
                            )}
                          </span>
                          {/* Said once: shown here only for a session the list above does not show. */}
                          {historyCommunityScoreShown(h.sessionId, sessionRowIds) && (
                            <span className="flex flex-col items-end gap-0.5">
                              <span className="label-caps">
                                {th("communityScore")}
                              </span>
                              <ScorePill score={h.communityScore} />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </Card>
          </section>
        </div>

        {/* Ficha técnica */}
        <section>
          <PaperSectionHeading
            title={t("detailsTitle")}
            action={
            <ReportLink
              href={`/api/coffees/${coffee.id}/ficha?locale=${locale}&inline=1`}
              filename={`ficha-${coffee.id}.pdf`}
              offlineLabel={t("needsConnection")}
              newTab
              variant="secondary"
              size="sm"
              icon={<FileDown size={15} aria-hidden />}
            >
              {t("downloadFicha")}
            </ReportLink>
            }
          />
          <Card className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filledFields.map((f) => (
              <div key={f.label}>
                <p className={FIELD_LABEL}>{f.label}</p>
                <p className="text-caption text-on-surface">{f.value}</p>
              </div>
            ))}
            {coffee.certifications.length > 0 && (
              <div className="col-span-full">
                <p className={`${FIELD_LABEL} mb-1`}>{t("certifications")}</p>
                <div className="flex flex-wrap gap-2">
                  {coffee.certifications.map((c) => (
                    <Badge key={c} tone="accent">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {filledFields.length === 0 && coffee.certifications.length === 0 && (
              <p className="col-span-full text-caption text-on-surface-variant">—</p>
            )}
          </Card>
        </section>

        {/* Visibility & sharing (owner only) — the "Cuenta" slot of the user profile */}
        {isOwner && (
          <section>
            <PaperSectionHeading title={t("visibilityTitle")} />
            <Card className="space-y-4">
              <div className="space-y-1.5">
                <CoffeeVisibilityToggle
                  coffeeId={coffee.id}
                  visibility={coffee.visibility as CoffeeVisibility}
                  previousShares={shares.map((s) => ({
                    userId: s.userId,
                    displayName: profileDisplayName({ id: s.userId, displayName: s.user.displayName }, locale),
                  }))}
                  translations={{
                    recordPublic: t("recordPublic"),
                    recordPrivate: t("recordPrivate"),
                    recordShared: t("recordShared"),
                    confirmMakePublic: t("confirmMakePublic"),
                    makePublic: t("makePublic"),
                    returnTitle: t("share.returnTitle"),
                    returnBody: t("share.returnBody"),
                    returnKeep: t("share.returnKeep"),
                    returnClear: t("share.returnClear"),
                    returnConfirm: t("share.returnConfirm"),
                    returnLinksNote: t("share.returnLinksNote"),
                    dialogCancel: t("share.dialogCancel"),
                    dialogClose: t("share.dialogClose"),
                  }}
                />
                <p className="text-caption text-on-surface-variant">{t("recordHint")}</p>
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
                    dialogCancel: t("share.dialogCancel"),
                    dialogClose: t("share.dialogClose"),
                  }}
                />
                <p className="text-caption text-on-surface-variant">{t("resultsHint")}</p>
              </div>
              {coffee.resultsPublished && coffee.visibility !== "public" && (
                <p className="text-caption font-medium text-secondary">{t("resultsButPrivateHint")}</p>
              )}

              <div className="border-t border-outline-variant/50 pt-4">
                <CoffeeShareManager
                  coffeeId={coffee.id}
                  locale={locale}
                  initialToken={shareInitialToken}
                  initialExpiresAt={shareInitialToken ? (invite?.expiresAt?.toISOString() ?? null) : null}
                  shares={shares.map((s) => ({
                    userId: s.userId,
                    displayName: profileDisplayName({ id: s.userId, displayName: s.user.displayName }, locale),
                  }))}
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
                    // Templates: filled client-side.
                    expiresOn: t.raw("share.expiresOn") as string,
                    noExpiry: t("share.noExpiry"),
                    rotate: t("share.rotate"),
                    rotateTitle: t("share.rotateTitle"),
                    rotateBody: t("share.rotateBody"),
                    rotateConfirm: t("share.rotateConfirm"),
                    revokeTitle: t("share.revokeTitle"),
                    revokeBody: t.raw("share.revokeBody") as string,
                    revokeAlsoRotate: t("share.revokeAlsoRotate"),
                    revokeConfirm: t("share.revokeConfirm"),
                    dialogCancel: t("share.dialogCancel"),
                    dialogClose: t("share.dialogClose"),
                  }}
                />
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
    </PageContainer>
  );
}
