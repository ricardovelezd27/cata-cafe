import { getLocale, getTranslations } from "next-intl/server";
import { ErrorPanel } from "@/components/errors/ErrorPanel";

// Server component — no retry action, just the same visual as ErrorPanel.
export default async function LocaleNotFound() {
  const locale = await getLocale();
  const t = await getTranslations("errors");

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <ErrorPanel
        title={t("notFoundTitle")}
        body={t("notFoundBody")}
        homeLabel={t("home")}
        homeHref={`/${locale}/app`}
      />
    </main>
  );
}
