import { getTranslations } from "next-intl/server";

// J-03 (Q1): the results page's own skeleton, shaped like ResultsClient so nothing
// jumps when the page arrives: the same outer box (it cancels <main>'s padding),
// the header's padding, the title (26.25 px, line height 1.25), its line of facts,
// the 44 px tab row, then the overview's first two cards.
export default async function ResultsLoading() {
  const t = await getTranslations("errors");
  const bar = "animate-pulse rounded-card bg-surface-container-high";

  return (
    <div className="-mx-4 -mt-4 bg-surface lg:-mx-6 lg:-mt-6">
      <span className="sr-only">{t("loading")}</span>
      <div aria-hidden="true" className="bg-surface">
        <div className="px-4 pt-3 pb-2">
          <div className={`h-[33px] w-56 max-w-full ${bar}`} />
          <div className={`mt-1 h-[18px] w-72 max-w-full ${bar}`} />
        </div>
        <div className="flex gap-2 border-b border-outline-variant px-4 pb-2">
          <div className={`h-[44px] w-28 rounded-pill ${bar}`} />
          <div className={`h-[44px] w-20 rounded-pill ${bar}`} />
        </div>
      </div>
      <div aria-hidden="true" className="space-y-4 px-4 py-4 lg:px-6">
        <div className={`h-40 w-full ${bar}`} />
        <div className={`h-40 w-full ${bar}`} />
      </div>
    </div>
  );
}
