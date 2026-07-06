import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSuperAdminEmail } from "@/lib/analytics/access";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import OnboardingWrapper from "@/components/onboarding/OnboardingWrapper";
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
  const showInsights = isSuperAdminEmail(user.email) || !!profile?.analyticsAccess;
  const initialDisplayName =
    profile?.displayName ?? user.email?.split("@")[0] ?? "";

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar locale={locale} showInsights={showInsights} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar locale={locale} />
        <main className="relative flex-1 overflow-y-auto bg-[#FDFBF7] p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
        <BottomNav locale={locale} className="lg:hidden" showInsights={showInsights} />
      </div>
      <OnboardingWrapper
        showOnboarding={showOnboarding}
        locale={locale}
        initialDisplayName={initialDisplayName}
      />
    </div>
  );
}
