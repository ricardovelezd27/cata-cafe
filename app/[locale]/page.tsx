import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="max-w-2xl text-center space-y-6">
        <div className="text-[10px] tracking-[3px] text-brown-mid uppercase">
          {t("brand.name")}
        </div>
        <h1 className="text-4xl md:text-5xl text-green-dark font-serif font-normal">
          {t("home.heroTitle")}
        </h1>
        <p className="text-brown-dark text-lg">{t("home.heroSubtitle")}</p>
        <div className="pt-4">
          <Link
            href={`/${locale}/auth/login`}
            className="inline-block px-6 py-3 rounded-lg bg-green-dark text-white font-bold hover:bg-green-mid transition"
          >
            {t("home.cta")}
          </Link>
        </div>
      </div>
    </main>
  );
}
