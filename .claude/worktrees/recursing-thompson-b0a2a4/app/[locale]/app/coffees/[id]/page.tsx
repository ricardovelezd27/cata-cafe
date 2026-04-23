import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export function generateStaticParams() {
  return [];
}
export const dynamicParams = true;

export default async function CoffeeProfilePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const t = await getTranslations("coffee");
  const th = await getTranslations("history");

  const coffee = await prisma.coffee.findFirst({
    where: {
      id,
      OR: [{ isPublic: true }, { createdBy: user.id }],
    },
  });

  if (!coffee) notFound();

  const history = await prisma.userCoffeeHistory.findMany({
    where: { userId: user.id, coffeeId: id },
    orderBy: { tastedAt: "desc" },
    include: {
      session: { select: { id: true, name: true } },
    },
  });

  return (
    <div className="max-w-2xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl text-green-dark font-semibold">{coffee.name}</h1>
        {coffee.variety && (
          <p className="text-sm text-brown-mid mt-1">{coffee.variety}</p>
        )}
      </div>

      {/* Details grid */}
      <div className="bg-[#FDFBF7] border border-brown-light rounded-xl p-5 grid grid-cols-2 gap-4">
        {coffee.country && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("country")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.country}</p>
          </div>
        )}
        {coffee.region && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("region")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.region}</p>
          </div>
        )}
        {coffee.farm && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("farm")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.farm}</p>
          </div>
        )}
        {coffee.producer && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("producer")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.producer}</p>
          </div>
        )}
        {coffee.species && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("species")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.species}</p>
          </div>
        )}
        {coffee.variety && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("variety")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.variety}</p>
          </div>
        )}
        {coffee.harvestYear && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("harvest")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.harvestYear}</p>
          </div>
        )}
        {coffee.processType && (
          <div>
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-0.5">
              {t("process")}
            </p>
            <p className="text-sm text-brown-dark">{coffee.processType}</p>
          </div>
        )}
        {coffee.certifications.length > 0 && (
          <div className="col-span-2">
            <p className="text-xs text-brown-mid font-semibold uppercase tracking-wide mb-1">
              {t("certifications")}
            </p>
            <div className="flex flex-wrap gap-2">
              {coffee.certifications.map((c) => (
                <span
                  key={c}
                  className="text-xs px-2 py-0.5 rounded-full bg-amber-warm/20 text-brown-dark border border-amber-warm/40"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tasting history */}
      <div>
        <h2 className="font-serif text-xl text-green-dark font-semibold mb-4">
          {t("tastingHistory")}
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-brown-mid">{th("empty")}</p>
        ) : (
          <div className="bg-[#FDFBF7] border border-brown-light rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-brown-light bg-cream/50">
                  <th className="text-left px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                    Sesión
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                    {th("yourScore")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                    {th("communityScore")}
                  </th>
                  <th className="text-right px-4 py-2 text-xs text-brown-mid font-semibold uppercase tracking-wide">
                    {th("tasted")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr
                    key={h.id}
                    className={i < history.length - 1 ? "border-b border-brown-light/50" : ""}
                  >
                    <td className="px-4 py-2 text-brown-dark">{h.session.name}</td>
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
    </div>
  );
}
