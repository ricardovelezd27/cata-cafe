import { getTranslations } from "next-intl/server";
import { ShieldCheck, Users, WifiOff } from "lucide-react";

export default async function TrustStrip() {
  const t = await getTranslations("landing.trust");

  return (
    <section className="border-y border-outline-variant/50 bg-surface-container">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 py-8 sm:px-8 lg:flex-row lg:justify-between lg:gap-8">
        <p className="rounded-full border border-outline-variant/70 bg-surface px-4 py-2 text-center">
          <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
            {t("formulaLabel")}
          </span>
          <span className="font-serif tabular-nums text-sm text-primary">
            {t("formula")}
          </span>
        </p>
        <ul className="flex flex-col items-center gap-3 text-sm text-on-surface-variant sm:flex-row sm:gap-7">
          <li className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-primary-container" />
            {t("item1")}
          </li>
          <li className="flex items-center gap-2 text-center">
            <Users className="h-4 w-4 shrink-0 text-primary-container" />
            {t("item2")}
          </li>
          <li className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 shrink-0 text-primary-container" />
            {t("item3")}
          </li>
        </ul>
      </div>
    </section>
  );
}
