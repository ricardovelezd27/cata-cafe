import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { FigureGallery } from "./FigureGallery";

// Dev-only review board: every warm-up figure kind with pose sliders, eyes,
// lead and tile/stage framing (figures are static now). 404 in production.
export const dynamic = "force-dynamic";

export default async function DevFiguresPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (process.env.NODE_ENV === "production") notFound();
  return <FigureGallery locale={locale} />;
}
