import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localeHref } from "@/components/landing/locale-href";
import type { LegalDocs } from "@/lib/legal/types";

// Public legal document (S8-08). Server component; the "Borrador" banner is
// the guard against draft text being read as final.
export default async function LegalPage({
  locale,
  docs,
}: {
  locale: string;
  docs: LegalDocs;
}) {
  const t = await getTranslations("legal");
  const doc = docs[locale === "en" ? "en" : "es"];
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8">
      <div
        role="note"
        className="mb-8 rounded-card border border-secondary/40 bg-secondary-container/30 px-4 py-3 text-sm text-on-surface"
      >
        <p className="font-semibold">{t("draftTitle")}</p>
        <p className="mt-1">{t("draftBody")}</p>
      </div>
      <h1 className="font-serif text-3xl text-primary">{doc.title}</h1>
      <div className="mt-8 space-y-8">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-serif text-xl text-on-surface">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
      <p className="mt-12 text-sm">
        <Link href={localeHref(locale, "/")} className="text-primary underline underline-offset-2">
          {t("back")}
        </Link>
      </p>
    </main>
  );
}
