import { getTranslations } from "next-intl/server";
import Frame from "./Frame";

// Stylized recreation of the affective evaluation screen (1–9 scale).
export default async function MockFrameCVA({ ariaLabel }: { ariaLabel: string }) {
  const t = await getTranslations();

  const attrs = [
    { label: t("cupping.flavor"), value: 7 },
    { label: t("cupping.acidity"), value: 6 },
    { label: t("cupping.sweetness"), value: 8 },
  ];

  return (
    <Frame ariaLabel={ariaLabel}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
        {t("cupping.sample")} A
      </p>
      <div className="mt-3 space-y-4">
        {attrs.map((attr) => (
          <div key={attr.label}>
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium text-on-surface">{attr.label}</p>
              <p className="font-serif tabular-nums text-lg text-primary">
                {attr.value}
              </p>
            </div>
            <div className="mt-1.5 flex justify-between gap-1">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                <span
                  key={n}
                  className={
                    n === attr.value
                      ? "h-4 w-4 rounded-full bg-primary-container ring-2 ring-primary-fixed"
                      : n < attr.value
                        ? "h-4 w-4 rounded-full bg-primary-fixed"
                        : "h-4 w-4 rounded-full border border-outline-variant bg-surface-container-lowest"
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}
