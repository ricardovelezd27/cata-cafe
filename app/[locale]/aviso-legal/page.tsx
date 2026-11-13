import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import LegalPage from "@/components/legal/LegalPage";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import { LEGAL_NOTICE } from "@/lib/legal/legalNotice";

// Legal notice (S10 WP9a). Sole dynamic segment is [locale], so static
// generation is right. noindex while LEGAL_PAGES_PUBLISHED is false.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: LEGAL_NOTICE[locale === "en" ? "en" : "es"].title,
    robots: LEGAL_PAGES_PUBLISHED ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage locale={locale} docs={LEGAL_NOTICE} />;
}
