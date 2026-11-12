import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { localeHref } from "@/components/landing/locale-href";
import { LEGAL_PAGES_PUBLISHED } from "@/lib/legal/config";
import type { LegalBlock, LegalDocs } from "@/lib/legal/types";

const TEXT = "text-sm leading-relaxed text-on-surface-variant";

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return <p className={`mt-2 ${TEXT}`}>{block}</p>;
  }
  if ("list" in block) {
    return (
      <ul className={`mt-2 list-disc space-y-1.5 pl-5 ${TEXT}`}>
        {block.list.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  // Two-column definition table: stacked (term over description) below md:.
  return (
    <dl className="mt-3 divide-y divide-outline-variant rounded-card border border-outline-variant">
      {block.rows.map(([term, description], i) => (
        <div key={i} className="px-4 py-3 md:grid md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-6">
          <dt className="text-sm font-semibold text-on-surface">{term}</dt>
          <dd className={`mt-1 break-words md:mt-0 ${TEXT}`}>{description}</dd>
        </div>
      ))}
    </dl>
  );
}

// Public legal document (S8-08, S10 WP9a). Server component. While the pages
// are unpublished (lib/legal/config.ts) the "Borrador" banner is the guard
// against the text being read as final; once published the banner is gone.
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
      {!LEGAL_PAGES_PUBLISHED && (
        <div
          role="note"
          className="mb-8 rounded-card border border-secondary/40 bg-secondary-container/30 px-4 py-3 text-sm text-on-surface"
        >
          <p className="font-semibold">{t("draftTitle")}</p>
          <p className="mt-1">{t("draftBody")}</p>
        </div>
      )}
      <h1 className="font-serif text-3xl text-primary">{doc.title}</h1>
      <p className="mt-2 text-sm text-on-surface-variant">{doc.version}</p>
      {doc.intro && doc.intro.length > 0 && (
        <div className="mt-6">
          {doc.intro.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
      )}
      <div className="mt-8 space-y-8">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-serif text-xl text-on-surface">{s.heading}</h2>
            {s.body.map((block, i) => (
              <Block key={i} block={block} />
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
