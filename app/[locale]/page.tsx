import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import StepSection from "@/components/landing/StepSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import AudienceSection from "@/components/landing/AudienceSection";
import FoundingSection from "@/components/landing/FoundingSection";
import FinalCTASection from "@/components/landing/FinalCTASection";
import LandingFooter from "@/components/landing/LandingFooter";
import ScrollFx from "@/components/landing/ScrollFx";
import ConstellationMount from "@/components/landing/journey/ConstellationMount";

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
      // No `images` here — app/[locale]/opengraph-image.tsx (file-based
      // convention) supplies og:image automatically and takes priority over
      // any explicit entry here, so duplicating it would be dead config.
      url: locale === "es" ? "/" : "/en",
      siteName: "cafesensible.ai",
      locale: locale === "es" ? "es_ES" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("ogTitle"),
      description: t("ogDescription"),
      // twitter-image is a separate file convention; point it at the same
      // generated route. Locale-prefixed on purpose: proxy.ts excludes this
      // path from the intl middleware (no 307 for the default locale), so the
      // unprefixed form would 404.
      images: [`/${locale}/opengraph-image`],
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
      <main className="relative flex-1 bg-primary text-surface">
        <ConstellationMount />
        <HeroSection locale={locale} />
        <StepSection locale={locale} step={1} />
        <StepSection locale={locale} step={2} />
        <StepSection locale={locale} step={3} />
        <FeaturesSection />
        <AudienceSection />
        <FoundingSection locale={locale} />
        <FinalCTASection locale={locale} />
      </main>
      <LandingFooter locale={locale} />
      <ScrollFx />
    </>
  );
}
