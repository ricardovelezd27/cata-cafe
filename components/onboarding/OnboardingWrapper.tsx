"use client";

import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/guestScope";
import WelcomeModal, { type WelcomeModalTranslations } from "./WelcomeModal";

interface OnboardingWrapperProps {
  showOnboarding: boolean;
  locale: string;
  initialDisplayName: string;
  translations: WelcomeModalTranslations;
}

export default function OnboardingWrapper({
  showOnboarding,
  locale,
  initialDisplayName,
  translations,
}: OnboardingWrapperProps) {
  // Only on the dashboard itself. The welcome dialog used to cover every /app
  // page, so a first-time invitee who followed a link to a session saw a modal
  // instead of it (S8-06, F-entrar-4); it never mounts under /app/sessions/*.
  const pathname = usePathname();
  const inner = stripLocale(pathname ?? "/").replace(/\/+$/, "");
  if (!showOnboarding || inner !== "/app") return null;
  return (
    <WelcomeModal
      locale={locale}
      initialDisplayName={initialDisplayName}
      translations={translations}
    />
  );
}
