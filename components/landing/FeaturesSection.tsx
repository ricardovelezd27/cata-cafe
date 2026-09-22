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

// Deterministic 8x5 "attribute x cupper" deviation mini-heatmap — decorative,
// illustrative only (not real session data).
const HEATMAP_COLS = 8;
const HEATMAP_ROWS = 5;
const HEATMAP_LIT = new Set([2, 5, 9, 12, 14, 18, 21, 22, 26, 29, 30, 33, 35, 37, 38, 39]);
const HEATMAP_STRONG = new Set([5, 14, 22, 33, 38]);

function DeviationHeatmap({ ariaLabel }: { ariaLabel: string }) {
  const cell = 14;
  const gap = 3;
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${HEATMAP_COLS * (cell + gap)} ${HEATMAP_ROWS * (cell + gap)}`}
      className="mt-5 h-16 w-full max-w-[220px]"
    >
      {Array.from({ length: HEATMAP_ROWS * HEATMAP_COLS }, (_, i) => {
        const x = (i % HEATMAP_COLS) * (cell + gap);
        const y = Math.floor(i / HEATMAP_COLS) * (cell + gap);
        const lit = HEATMAP_LIT.has(i);
        const strong = HEATMAP_STRONG.has(i);
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={cell}
            height={cell}
            rx={3}
            className={
              !lit
                ? "fill-surface opacity-15"
                : strong
                  ? "fill-secondary-container opacity-80"
                  : "fill-primary-fixed opacity-60"
            }
          />
        );
      })}
    </svg>
  );
}

export default async function FeaturesSection() {
  const t = await getTranslations("landing.features");

  const items = ICONS.map((Icon, index) => {
    const key = `item${index + 1}` as const;
    return {
      Icon,
      title: t(`${key}.title`),
      desc: t(`${key}.desc`),
      isAi: index === 2,
    };
  });

  return (
    <section data-fold="3" className="cv-auto relative z-10 bg-transparent">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div data-reveal className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-secondary-container">
            {t("eyebrow")}
          </p>
          <h2 className="pt-4 font-serif text-3xl leading-tight text-surface sm:text-4xl">
            {t("title")}
          </h2>
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-6 sm:auto-rows-fr sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ Icon, title, desc, isAi }) => (
            <li
              key={title}
              data-reveal
              className="stage-card flex flex-col rounded-[1.5rem] p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface/10">
                <Icon className="h-5 w-5 text-primary-fixed" />
              </div>
              <h3 className="pt-4 font-serif text-lg text-surface">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-surface/80">
                {desc}
              </p>
              {isAi ? <DeviationHeatmap ariaLabel={t("heatmapAria")} /> : null}
            </li>
          ))}
        </ul>

        <div
          data-reveal
          className="mt-14 flex flex-wrap justify-center gap-x-10 gap-y-3"
        >
          {[t("factsSheets"), t("factsAttrs"), t("factsRef")].map((fact) => (
            <span
              key={fact}
              data-counter
              className="font-serif tabular-nums text-2xl text-surface"
            >
              {fact}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
