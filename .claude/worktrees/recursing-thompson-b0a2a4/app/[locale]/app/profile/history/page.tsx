import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("history");

  const history = await prisma.userCoffeeHistory.findMany({
    where: { userId: user.id },
    orderBy: { tastedAt: "desc" },
    include: {
      coffee: { select: { id: true, name: true } },
      session: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-3xl text-green-dark font-semibold">{t("title")}</h1>

      {history.length === 0 ? (
        <p className="text-sm text-brown-mid">{t("empty")}</p>
      ) : (
        <div className="bg-[#FDFBF7] border border-brown-light rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brown-light bg-cream/50">
                <th className="text-left px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                  Café
                </th>
                <th className="text-left px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                  Sesión
                </th>
                <th className="text-right px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                  {t("yourScore")}
                </th>
                <th className="text-right px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                  {t("communityScore")}
                </th>
                <th className="text-right px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                  {t("tasted")}
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr
                  key={h.id}
                  className={i < history.length - 1 ? "border-b border-brown-light/50" : ""}
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/${locale}/app/coffees/${h.coffee.id}`}
                      className="text-green-dark font-semibold hover:underline"
                    >
                      {h.coffee.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-brown-mid">{h.session.name}</td>
                  <td className="px-4 py-2 text-right font-semibold text-green-dark">
                    {h.individualScore?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-brown-mid">
                    {h.communityScore?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-brown-mid text-xs">
                    {h.tastedAt.toLocaleDateString(
                      locale === "es" ? "es-CO" : "en-US",
                      { year: "numeric", month: "short", day: "numeric" },
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
