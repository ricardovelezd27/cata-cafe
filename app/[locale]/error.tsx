"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
// Boundary components can't receive a `translations` prop the way normal
// client components in this app do — they render inside NextIntlClientProvider
// (see app/[locale]/layout.tsx) which inherits messages automatically in
// next-intl 4.9, so we call useTranslations directly here, as an exception.
import { useTranslations } from "next-intl";
import { ErrorPanel } from "@/components/errors/ErrorPanel";

export default function LocaleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("errors");
  const params = useParams<{ locale?: string }>();
  const locale = typeof params?.locale === "string" ? params.locale : "es";

  useEffect(() => {
    console.error(error.message, error.digest);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <ErrorPanel
        title={t("title")}
        body={t("body")}
        retryLabel={t("retry")}
        onRetry={unstable_retry}
        homeLabel={t("home")}
        homeHref={`/${locale}/app`}
        supportLabel={t("support")}
        digest={error.digest}
      />
    </main>
  );
}
