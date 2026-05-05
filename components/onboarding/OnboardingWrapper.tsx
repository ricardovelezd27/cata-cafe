"use client";

import WelcomeModal from "./WelcomeModal";

interface OnboardingWrapperProps {
  showOnboarding: boolean;
  locale: string;
  initialDisplayName: string;
}

export default function OnboardingWrapper({
  showOnboarding,
  locale,
  initialDisplayName,
}: OnboardingWrapperProps) {
  if (!showOnboarding) return null;
  return (
    <WelcomeModal locale={locale} initialDisplayName={initialDisplayName} />
  );
}
