import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildCardsStrings } from "@/components/results/cardsStrings";
import type { SampleDetailTranslations, SheetCompareTranslations } from "@/components/results/SampleDetail";
import { buildSheetStrings } from "@/components/results/sheetStrings";
import { buildOverviewStrings, type OverviewStrings } from "@/components/results/overviewStrings";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { OVERVIEW_SCENARIOS } from "@/lib/dev/overviewFixtures";
import { SHEET_BLOCK_IDS } from "@/lib/reports/coffeeSheet";
import { referenceCopySuffix, referenceExplanation } from "@/lib/referenceRules";
import { GALLERY_SECTIONS, ResultsPartsGallery, type GallerySection } from "./ResultsPartsGallery";

// Dev-only review board for the results parts (package R1b): every part drawn
// from FIXTURES. No database, no session, no account: it reads nothing but the
// messages. Gated like its neighbour app/[locale]/dev/page.tsx: outside
// `next dev` it is a 404, checked before anything else. Never prerendered.
export const dynamic = "force-dynamic";

export default async function ResultsPartsDevPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ only?: string | string[] }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("results");
  const tCups = await getTranslations("cupping.cups");
  const tAttr = await getTranslations("attributes");
  const tg = await getTranslations("group");
  const tBlocks = await getTranslations("blocks");
  // The words of each invented cupping, chosen as the results page chooses them
  // (the reference's title and explanation depend on the format and the mode).
  const overviewStrings: Record<string, OverviewStrings> = Object.fromEntries(
    OVERVIEW_SCENARIOS.map((s) => {
      const suffix = referenceCopySuffix(referenceExplanation({ mode: s.referenceMode, moduleKey: s.ctx.format }));
      return [
        s.id,
        {
          ...buildOverviewStrings(t, {
            referenceTitle: t(`dashboard.anchorTitle${suffix}`),
            referenceHint: t(`dashboard.anchorHint${suffix}`),
            notScored: t("dashboard.notScored"),
            rankHelp: t("dashboard.rankHelp"),
            communityPending: t("communityPending"),
            defectTypes: {
              moldy: tCups("types.moldy"),
              phenolic: tCups("types.phenolic"),
              potato: tCups("types.potato"),
            },
          }),
          preliminary: t("overview.preliminary", { button: t("refresh") }),
        },
      ];
    }),
  );

  // `?only=wheel,compare` shows some groups of parts (a whole phone page is
  // taller than one screenshot can hold). Anything that is not a group is ignored.
  const { only } = await searchParams;
  const asked = (Array.isArray(only) ? only.join(",") : (only ?? "")).split(",");
  const sections = GALLERY_SECTIONS.filter((section: GallerySection) => asked.includes(section));

  return (
    <ResultsPartsGallery
      locale={locale === "en" ? "en" : "es"}
      strings={buildResultsPartsStrings(t)}
      overviewStrings={overviewStrings}
      cardsStrings={buildCardsStrings(t, {
        inProgress: t("table.inProgress"),
        notEvaluated: t("table.notEvaluated"),
        inProgressLegend: t("table.inProgressLegend"),
        partialLabel: t("partial.label"),
        reveal: tg("reveal"),
        revealed: tg("revealed"),
        referenceBadge: t("referenceBadge"),
        attributes: Object.fromEntries(
          AFFECTIVE_ATTRIBUTES.map((a) => [a.id, tAttr(a.id as Parameters<typeof tAttr>[0])]),
        ),
      })}
      // the sheet's words, read whole from the messages (the board has no session to shape them)
      sheetWords={{
        detail: {
          ...(t.raw("detail") as SampleDetailTranslations),
          breakdown: t.raw("breakdown") as SampleDetailTranslations["breakdown"],
          inProgress: t("table.inProgress"),
          notEvaluated: t("table.notEvaluated"),
          market: t.raw("market") as SampleDetailTranslations["market"],
          partial: t.raw("partial") as SampleDetailTranslations["partial"],
          prep: t.raw("samplePrep") as SampleDetailTranslations["prep"],
        },
        compare: t.raw("compare") as SheetCompareTranslations,
        s: buildSheetStrings(t),
        blockLabels: Object.fromEntries(
          SHEET_BLOCK_IDS.map((id) => [id, tBlocks(id as Parameters<typeof tBlocks>[0])]),
        ),
      }}
      only={sections}
    />
  );
}
