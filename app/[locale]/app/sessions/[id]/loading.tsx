import { getTranslations } from "next-intl/server";

// Tiny skeleton for a session detail route: header bar + two stacked cards.
export default async function SessionLoading() {
  const t = await getTranslations("errors");

  return (
    <div className="space-y-6">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true" className="h-8 w-56 animate-pulse rounded-card bg-surface-container-high" />
      <div aria-hidden="true" className="h-32 w-full animate-pulse rounded-card bg-surface-container-high" />
      <div aria-hidden="true" className="h-32 w-full animate-pulse rounded-card bg-surface-container-high" />
    </div>
  );
}
