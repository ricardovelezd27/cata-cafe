import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import CostOfGuessingSection from "@/components/landing/CostOfGuessingSection";
import ComparisonSection from "@/components/landing/ComparisonSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import TrustStrip from "@/components/landing/TrustStrip";
import AudienceSection from "@/components/landing/AudienceSection";
import RoadmapSection from "@/components/landing/RoadmapSection";
import PricingSection from "@/components/landing/PricingSection";
import FinalCTASection from "@/components/landing/FinalCTASection";
import LandingFooter from "@/components/landing/LandingFooter";
import ScrollFx from "@/components/landing/ScrollFx";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: locale === "es" ? "/" : "/en",
      languages: { es: "/", en: "/en", "x-default": "/" },
    },
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      images: ["/og.png"],
      locale: locale === "es" ? "es_ES" : "en_US",
      type: "website",
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <LandingHeader locale={locale} />
      <main className="flex-1">
        <HeroSection locale={locale} />
        <CostOfGuessingSection />
        <ComparisonSection />
        <HowItWorksSection locale={locale} />
        <TrustStrip />
        <AudienceSection />
        <RoadmapSection />
        <PricingSection locale={locale} />
        <FinalCTASection locale={locale} />
      </main>
      <LandingFooter locale={locale} />
      <ScrollFx />
    </>
  );
}
