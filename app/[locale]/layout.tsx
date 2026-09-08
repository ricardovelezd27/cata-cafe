import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { ActionFeedbackProvider } from "@/components/ui";
import type { ReactNode } from "react";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Feedback copy for the server-action contract (lib/actionResult.ts) —
  // built once here so every client component under this layout can call
  // useActionFeedback() without threading translations through props.
  const t = await getTranslations("errors");
  const codes = t.raw("codes") as Record<string, string>;
  const feedbackTranslations = { ...codes, dismiss: t("dismiss") };

  return (
    <NextIntlClientProvider>
      <ActionFeedbackProvider translations={feedbackTranslations}>
        {/* The <html> tag lives in the root layout (above [locale]) with
            lang="es" (default locale). Correct it before paint for /en. */}
        {locale !== "es" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `document.documentElement.lang=${JSON.stringify(locale)}`,
            }}
          />
        )}
        {children}
      </ActionFeedbackProvider>
    </NextIntlClientProvider>
  );
}
