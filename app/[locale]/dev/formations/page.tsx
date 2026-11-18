import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clipboard, Coffee, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

// Dev-only review board for audit K-03: every still formation, in the real
// EmptyState, with the real words of the pages that show it. Outside
// `next dev` it is a 404.
export const dynamic = "force-dynamic";

export default async function FormationsDevPage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { locale } = await params;
  setRequestLocale(locale);
  const td = await getTranslations("dashboard");
  const ts = await getTranslations("session.table");
  const tc = await getTranslations("coffee");
  const tg = await getTranslations("groups");
  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-[16px] px-4 py-6">
      <p className="text-caption text-on-surface-variant">Dev board · K-03 · still formations in EmptyState</p>
      <div className="grid gap-[16px] md:grid-cols-2">
        <section className="rounded-card border border-outline-variant bg-surface-container-lowest" data-case="dashboard">
          <EmptyState icon={<Coffee size={20} />} title={td("emptyTitle")} body={td("emptyBody")} />
        </section>
        <section className="rounded-card border border-outline-variant bg-surface-container-lowest" data-case="sessions">
          <EmptyState icon={<Coffee size={20} />} title={ts("emptyTitle")} body={ts("emptyBody")} />
        </section>
        <section className="rounded-card border border-outline-variant bg-surface-container-lowest" data-case="coffees">
          <EmptyState formation="wheel" icon={<Coffee size={20} aria-hidden />} title={tc("noData")} body={tc("noDataBody")} />
        </section>
        <section className="rounded-card border border-outline-variant bg-surface-container-lowest" data-case="groups">
          <EmptyState icon={<Users size={20} aria-hidden />} title={tg("empty")} body={tg("emptyBody")} />
        </section>
        <section className="rounded-card border border-outline-variant bg-surface-container-lowest" data-case="group-sessions">
          <EmptyState icon={<Clipboard size={20} aria-hidden />} title={ts("emptyTitle")} />
        </section>
      </div>
    </div>
  );
}
