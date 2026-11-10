import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import LegalPage from "@/components/legal/LegalPage";
import { TERMS } from "@/lib/legal/terms";

// Draft legal page (S8-08). Sole dynamic segment is [locale], so static
// generation is right. noindex until the owner publishes the final text
// (lib/legal/config.ts).
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
    title: TERMS[locale === "en" ? "en" : "es"].title,
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPage locale={locale} docs={TERMS} />;
}
