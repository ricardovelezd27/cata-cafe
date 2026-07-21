import { getTranslations } from "next-intl/server";
import {
  ShieldCheck,
  Eye,
  Sparkles,
  WifiOff,
  FileText,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: LucideIcon[] = [ShieldCheck, Eye, Sparkles, WifiOff, FileText, Users];

export default async function FeaturesSection() {
  const t = await getTranslations("landing.features");

  const items = ICONS.map((Icon, index) => {
    const key = `item${index + 1}` as const;
    return {
      Icon,
      title: t(`${key}.title`),
      desc: t(`${key}.desc`),
    };
  });

  return (
    <section className="cv-auto bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div data-reveal className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 font-serif text-3xl leading-tight text-on-surface sm:text-4xl">
            {t("title")}
          </h2>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ Icon, title, desc }) => (
            <li
              key={title}
              data-reveal
              className="rounded-2xl border border-outline-variant/50 bg-surface-container p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-fixed/30">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-4 font-serif text-lg text-on-surface">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                {desc}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
