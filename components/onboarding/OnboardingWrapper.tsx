"use client";

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
  if (!showOnboarding) return null;
  return (
    <WelcomeModal
      locale={locale}
      initialDisplayName={initialDisplayName}
      translations={translations}
    />
  );
}
