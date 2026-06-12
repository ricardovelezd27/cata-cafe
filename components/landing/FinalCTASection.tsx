import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { loginHref } from "./locale-href";

export default async function FinalCTASection({ locale }: { locale: string }) {
  const t = await getTranslations("landing.finalCta");

  return (
    <section className="bg-primary text-surface">
      <div data-reveal className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <h2 className="font-serif text-3xl leading-tight text-surface sm:text-5xl">
          {t("title")}
        </h2>
        <div className="mt-9">
          <Link
            href={loginHref(locale)}
            className="inline-block rounded-full bg-surface px-8 py-4 text-base font-semibold text-primary shadow-lg transition-colors hover:bg-primary-fixed"
          >
            {t("cta")}
          </Link>
        </div>
        <p className="mt-4 text-sm text-surface/80">{t("note")}</p>
      </div>
    </section>
  );
}
