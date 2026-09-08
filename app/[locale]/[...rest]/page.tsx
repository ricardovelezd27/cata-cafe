import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

// Catch-all for any unmatched URL under a locale — routes it to the
// localized not-found.tsx in this segment instead of falling through to the
// bilingual root app/not-found.tsx.
// EXCEPTION: extra dynamic segment ([...rest]) beyond [locale] — no
// generateStaticParams here (see CLAUDE.md's production-outage note).
export const dynamic = "force-dynamic";

export default async function CatchAllPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  notFound();
}
