import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PaperPartsGallery } from "./PaperPartsGallery";

// Dev-only board for the paper primitives (package P2a): Card, Notice and
// PaperSectionHeading, every variant and state, beside the hand-written recipes
// they replace. No database, no session, no account. Gated like its neighbour
// app/[locale]/dev/results-parts: outside `next dev` it is a 404, checked
// before anything else. Never prerendered.
export const dynamic = "force-dynamic";

export default async function PaperPartsDevPage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();

  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("common");
  return <PaperPartsGallery locale={locale} strings={{ dismiss: t("dismissNotice"), close: t("close") }} />;
}
