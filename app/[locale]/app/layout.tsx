import { setRequestLocale, getTranslations } from "next-intl/server";
import { requireAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail, isAiAdminEmail } from "@/lib/analytics/access";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import OnboardingWrapper from "@/components/onboarding/OnboardingWrapper";
import type { WelcomeModalTranslations } from "@/components/onboarding/WelcomeModal";
import { LegacyStorageCleanup } from "@/components/layout/LegacyStorageCleanup";
import { IdentityWatcher } from "@/components/layout/IdentityWatcher";
import { PendingDraftsBadge } from "@/components/offline/PendingDraftsBadge";
import { StaleBundleNotice } from "@/components/offline/StaleBundleNotice";
import type { UnsyncedNotesTranslations } from "@/components/offline/UnsyncedNotesPanel";
import {
  UnsyncedGuardProvider,
  type UnsyncedGuardTranslations,
} from "@/components/offline/UnsyncedGuardProvider";
import { GuestGateProvider, type GuestGateTranslations } from "@/components/guest/GuestGateProvider";
import type { NavTranslations } from "@/components/layout/navItems";
import type { ReactNode } from "react";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Backstop only: proxy.ts already redirected a signed-out request WITH its
  // `next`. A layout cannot see the path, so a miss here lands on /app after
  // login; the pages below carry their own exact `next`.
  const user = await requireAppUser(locale, `/${locale}/app`);

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { onboardingCompleted: true, displayName: true, analyticsAccess: true },
  });

  // Anonymous QR walk-up. The nav is identical for everyone; a guest tapping a
  // gated destination gets the "finish creating your account" modal instead
  // (GuestGateProvider / GuestGateLink), and proxy.ts stays the server gate.
  const isGuest = user.is_anonymous === true;
  // Guests never see the welcome dialog: they are mid-cupping, and the claim
  // flow carries their name over (F-guest-7).
  const showOnboarding = !isGuest && !profile?.onboardingCompleted;
  const showInsights =
    isSuperAdminEmail(user.email) || isAiAdminEmail(user.email) || !!profile?.analyticsAccess;
  const initialDisplayName =
    profile?.displayName ?? user.email?.split("@")[0] ?? "";

  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tBrand = await getTranslations({ locale, namespace: "brand" });
  const tOnb = await getTranslations({ locale, namespace: "onboarding" });
  const onboardingTranslations: WelcomeModalTranslations = {
    welcomeTitle: tOnb("welcomeTitle"),
    welcomeTagline: tOnb("welcomeTagline"),
    welcomeBody: tOnb("welcomeBody"),
    start: tOnb("start"),
    skip: tOnb("skip"),
    aboutYou: tOnb("aboutYou"),
    fullName: tOnb("fullName"),
    namePlaceholder: tOnb("namePlaceholder"),
    role: tOnb("role"),
    selectRole: tOnb("selectRole"),
    country: tOnb("country"),
    selectCountry: tOnb("selectCountry"),
    back: tOnb("back"),
    next: tOnb("next"),
    whereToStart: tOnb("whereToStart"),
    saving: tOnb("saving"),
    close: tOnb("close"),
    goTo: tOnb.raw("goTo"),
    roles: {
      q_grader: tOnb("roles.q_grader"),
      barista: tOnb("roles.barista"),
      roaster: tOnb("roles.roaster"),
      producer: tOnb("roles.producer"),
      trader: tOnb("roles.trader"),
      enthusiast: tOnb("roles.enthusiast"),
    },
    paths: {
      session: { label: tOnb("paths.session.label"), description: tOnb("paths.session.description") },
      coffee: { label: tOnb("paths.coffee.label"), description: tOnb("paths.coffee.description") },
      join: { label: tOnb("paths.join.label"), description: tOnb("paths.join.description") },
    },
  };
  const tOffline = await getTranslations({ locale, namespace: "offline" });
  const tErrors = await getTranslations({ locale, namespace: "errors" });
  const tGate = await getTranslations({ locale, namespace: "guestGate" });
  const guestGate: GuestGateTranslations = {
    title: tGate("title"),
    body: tGate("body"),
    cta: tGate("cta"),
    ctaLoading: tGate("ctaLoading"),
    dismiss: tGate("dismiss"),
    close: tGate("close"),
    offline: tGate("offline"),
    error: tGate("error"),
    leave: {
      close: tGate("close"),
      cancel: tGate("leaveCancel"),
      guestTitle: tGate("leaveGuestTitle"),
      guestBody: tGate("leaveGuestBody"),
      save: tGate("leaveSave"),
      saving: tGate("ctaLoading"),
      saveError: tGate("error"),
      offline: tGate("offline"),
      leaveAnyway: tGate("leaveAnyway"),
      everywhereTitle: tGate("leaveEverywhereTitle"),
      everywhereBody: tGate("leaveEverywhereBody"),
      everywhereConfirm: tGate("leaveEverywhereConfirm"),
    },
  };
  // Raw template ({count} is filled in client-side by PendingDraftsBadge) —
  // t() would error on the "missing" ICU arg, same pattern as offline.conflictBody.
  const pendingDraftsLabel = tOffline.raw("pendingDrafts") as string;
  const unsyncedNotesLabel = tOffline.raw("unsyncedNotes") as string;
  const conflictDraftsLabel = tOffline.raw("conflictDrafts") as string;
  const notesPanel = tOffline.raw("panel") as UnsyncedNotesTranslations;
  const guardCopy = tOffline.raw("guard") as UnsyncedGuardTranslations;
  const translations: NavTranslations = {
    nav: {
      home: tNav("home"),
      sessions: tNav("sessions"),
      coffees: tNav("coffees"),
      groups: tNav("groups"),
      profile: tNav("profile"),
      insights: tNav("insights"),
      warmup: tNav("warmup"),
      switchAccount: tNav("switchAccount"),
      logout: tNav("logout"),
    },
    brand: {
      name: tBrand("name"),
      tagline: tBrand("tagline"),
    },
  };

  return (
    <UnsyncedGuardProvider userId={user.id} isGuest={isGuest} translations={guardCopy}>
    <GuestGateProvider isGuest={isGuest} locale={locale} translations={guestGate}>
    <div className="flex h-screen overflow-hidden">
      <Sidebar locale={locale} showInsights={showInsights} translations={translations} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar locale={locale} translations={translations} />
        <LegacyStorageCleanup />
        <StaleBundleNotice
          message={tOffline("bannerNewVersion")}
          reloadLabel={tOffline("reloadNow")}
        />
        <PendingDraftsBadge
          userId={user.id}
          locale={locale}
          label={pendingDraftsLabel}
          notesLabel={unsyncedNotesLabel}
          conflictLabel={conflictDraftsLabel}
          panelTranslations={notesPanel}
          staleLabel={tOffline("staleDrafts")}
        />
        <IdentityWatcher
          userId={user.id}
          translations={{
            notice: tErrors("codes.identity_changed"),
            reload: tOffline("reloadNow"),
          }}
        />
        <main className="relative flex-1 overflow-y-auto bg-surface p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
        <BottomNav
          locale={locale}
          className="lg:hidden"
          showInsights={showInsights}
          translations={translations}
        />
      </div>
      <OnboardingWrapper
        showOnboarding={showOnboarding}
        locale={locale}
        initialDisplayName={initialDisplayName}
        translations={onboardingTranslations}
      />
    </div>
    </GuestGateProvider>
    </UnsyncedGuardProvider>
  );
}
