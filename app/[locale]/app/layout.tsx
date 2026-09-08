import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail, isAiAdminEmail } from "@/lib/analytics/access";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import OnboardingWrapper from "@/components/onboarding/OnboardingWrapper";
import { PendingDraftsBadge } from "@/components/offline/PendingDraftsBadge";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { onboardingCompleted: true, displayName: true, analyticsAccess: true },
  });

  const showOnboarding = !profile?.onboardingCompleted;
  const showInsights =
    isSuperAdminEmail(user.email) || isAiAdminEmail(user.email) || !!profile?.analyticsAccess;
  const initialDisplayName =
    profile?.displayName ?? user.email?.split("@")[0] ?? "";

  const tNav = await getTranslations({ locale, namespace: "nav" });
  const tBrand = await getTranslations({ locale, namespace: "brand" });
  const tOffline = await getTranslations({ locale, namespace: "offline" });
  // Raw template ({count} is filled in client-side by PendingDraftsBadge) —
  // t() would error on the "missing" ICU arg, same pattern as offline.conflictBody.
  const pendingDraftsLabel = tOffline.raw("pendingDrafts") as string;
  const translations: NavTranslations = {
    nav: {
      home: tNav("home"),
      sessions: tNav("sessions"),
      coffees: tNav("coffees"),
      groups: tNav("groups"),
      profile: tNav("profile"),
      insights: tNav("insights"),
      switchAccount: tNav("switchAccount"),
      logout: tNav("logout"),
    },
    brand: {
      name: tBrand("name"),
      tagline: tBrand("tagline"),
    },
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar locale={locale} showInsights={showInsights} translations={translations} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar locale={locale} translations={translations} />
        <PendingDraftsBadge
          userId={user.id}
          locale={locale}
          label={pendingDraftsLabel}
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
      />
    </div>
  );
}
