import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

// The old "Catadores" nav item now points at the Tasting Groups feature
// (app/[locale]/app/groups). This route is kept as a redirect so any stale
// bookmarks/links to /app/team still land somewhere useful instead of 404ing.

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect(`/${locale}/app/groups`);
}
