import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function CoffeesPage({
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

  const t = await getTranslations("coffee");

  const coffees = await prisma.coffee.findMany({
    where: {
      OR: [{ isPublic: true }, { createdBy: user.id }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      country: true,
      variety: true,
      processType: true,
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-serif text-3xl text-green-dark font-semibold">{t("title")}</h1>

      {coffees.length === 0 ? (
        <p className="text-sm text-brown-mid">No hay cafés registrados aún.</p>
      ) : (
        <ul className="grid gap-2">
          {coffees.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${locale}/app/coffees/${c.id}`}
                className="block bg-[#FDFBF7] border border-brown-light rounded-lg px-4 py-3 hover:border-green-dark"
              >
                <div className="font-semibold text-brown-dark">{c.name}</div>
                <div className="text-xs text-brown-mid">
                  {[c.country, c.variety, c.processType].filter(Boolean).join(" · ")}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
