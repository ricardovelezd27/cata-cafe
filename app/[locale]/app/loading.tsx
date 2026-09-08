import { getTranslations } from "next-intl/server";

// Tiny skeleton: a page-header-shaped bar + one card, sized to reduce
// layout shift while the real page streams in.
export default async function AppLoading() {
  const t = await getTranslations("errors");

  return (
    <div className="space-y-6">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true" className="h-8 w-48 animate-pulse rounded-card bg-surface-container-high" />
      <div aria-hidden="true" className="h-40 w-full animate-pulse rounded-card bg-surface-container-high" />
    </div>
  );
}
