import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { buildCardsStrings } from "@/components/results/cardsStrings";
import type { SampleDetailTranslations, SheetCompareTranslations } from "@/components/results/SampleDetail";
import { buildSheetStrings } from "@/components/results/sheetStrings";
import { buildPanelStrings } from "@/components/results/panelStrings";
import type { PanelWords } from "./PanelFixtureView";
import { buildOverviewStrings, type OverviewStrings } from "@/components/results/overviewStrings";
import { buildResultsPartsStrings } from "@/components/results/partsStrings";
import { AFFECTIVE_ATTRIBUTES } from "@/lib/constants";
import { OVERVIEW_SCENARIOS } from "@/lib/dev/overviewFixtures";
import { SHEET_BLOCK_IDS } from "@/lib/reports/coffeeSheet";
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
  const tAlign = await getTranslations("alignment");
  const tDesc = await getTranslations("descriptors");
  // The Panel's words, read whole from the messages (the board has no session to shape them).
  const matrixWords = t.raw("matrix") as Record<string, string> & { exclusionReasons: Record<string, string> };
  const panelWords: PanelWords = {
    matrixTitle: matrixWords.ownerSection,
    referenceBadge: t("referenceBadge"),
    matrix: {
      ...matrixWords,
      title: matrixWords.matrixTitle,
      partialLabel: t("partial.label"),
      oldRuleNote: null,
      closedNote: matrixWords.closedNote,
      reasons: matrixWords.exclusionReasons,
    } as unknown as PanelWords["matrix"],
    panel: buildPanelStrings(t),
    late: {
      ...(t.raw("late") as Record<string, string>),
      attributeLabels: Object.fromEntries(
        AFFECTIVE_ATTRIBUTES.map((a) => [a.id, tAttr(a.id as Parameters<typeof tAttr>[0])]),
      ),
    } as unknown as PanelWords["late"],
    note: t.raw("postCloseNote") as PanelWords["note"],
    reflection: t.raw("reflection") as PanelWords["reflection"],
    align: {
      title: tAlign("title"),
      subtitle: tAlign("subtitle"),
      excluded: tAlign("excluded"),
      noData: tAlign("noData"),
      all: tDesc("filterSampleAll"),
    },
  };
  // The words of each invented cupping, built as the results page builds them.
  const overviewStrings: Record<string, OverviewStrings> = Object.fromEntries(
    OVERVIEW_SCENARIOS.map((s) => {
      return [
        s.id,
        {
          ...buildOverviewStrings(t, {
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
      panelWords={panelWords}
      // the sheet's words, read whole from the messages (the board has no session to shape them)
      sheetWords={{
        detail: {
          ...(t.raw("detail") as SampleDetailTranslations),
          breakdown: t.raw("breakdown") as SampleDetailTranslations["breakdown"],
          inProgress: t("table.inProgress"),
          notEvaluated: t("table.notEvaluated"),
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
