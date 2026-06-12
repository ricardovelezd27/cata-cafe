import { getTranslations } from "next-intl/server";
import Frame from "./Frame";

// Stylized recreation of the flavor descriptor selector. Pill labels mirror
// the app's Spanish reference data (lib/constants.ts), like a screenshot.
const PILLS = [
  { label: "Floral", color: "var(--color-flavor-floral)", on: true },
  { label: "Bayas", color: "var(--color-flavor-fruity)", on: true },
  { label: "Cítricos", color: "var(--color-flavor-fruity)", on: false },
  { label: "Caramelo", color: "var(--color-flavor-sweet)", on: true },
  { label: "Cacao", color: "var(--color-flavor-nutty)", on: false },
  { label: "Especias", color: "var(--color-flavor-spice)", on: false },
  { label: "Té negro", color: "var(--color-flavor-green)", on: false },
];

export default async function MockFrameFlavorPills({
  ariaLabel,
}: {
  ariaLabel: string;
}) {
  const t = await getTranslations();

  return (
    <Frame ariaLabel={ariaLabel}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-on-surface-variant">
        {t("cupping.flavor")}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PILLS.map((pill) => (
          <span
            key={pill.label}
            className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
            style={
              pill.on
                ? { backgroundColor: pill.color, borderColor: pill.color, color: "#fff" }
                : { borderColor: "var(--color-outline-variant)", color: pill.color }
            }
          >
            {pill.label}
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-1.5">
        <div className="h-2 w-3/4 rounded-full bg-surface-container-high" />
        <div className="h-2 w-1/2 rounded-full bg-surface-container-high" />
      </div>
      <p className="mt-3 text-[10px] text-on-surface-variant">
        {t("cupping.notes")}
      </p>
    </Frame>
  );
}
