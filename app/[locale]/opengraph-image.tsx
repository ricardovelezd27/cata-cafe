import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";

export const alt = "cafesensible.ai";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// [locale] is the sole dynamic segment this route lives under (same as
// app/[locale]/page.tsx), so — unlike the authed [id]/[token] routes — it
// needs its own generateStaticParams to be statically generated per docs on
// opengraph-image under a dynamic segment; otherwise the image would render
// at request time for every share instead of being built once per locale.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Hex literals below mirror the --color-* tokens in app/globals.css
// (primary, primary-fixed, secondary-container, surface). ImageResponse
// renders outside Tailwind/CSS-variable scope, so hex is unavoidable here.
const PRIMARY = "#153526";
const CREAM = "#fff8f6";
const MINT = "#c7ebd4";
const TERRACOTTA = "#fd8c6a";

export default async function Image({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.hero" });

  // A subtle row of small mint dots along the bottom — a constellation hint,
  // no images, just staggered divs.
  const dotCount = 40;
  const dots = Array.from({ length: dotCount }, (_, i) => {
    const x = (i / (dotCount - 1)) * 100;
    const cyclePos = i % 4;
    const y = cyclePos === 0 ? 2 : cyclePos === 1 ? 12 : cyclePos === 2 ? 5 : 16;
    const dotSize = i % 5 === 0 ? 7 : 3;
    return { x, y, dotSize, key: i };
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PRIMARY,
          padding: "72px 88px 56px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              letterSpacing: "0.08em",
              color: MINT,
              marginBottom: 28,
            }}
          >
            {t("eyebrow").toUpperCase()}
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>
            <span style={{ color: CREAM }}>cafesensible</span>
            <span style={{ color: TERRACOTTA }}>.ai</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 62,
            fontWeight: 700,
            lineHeight: 1.18,
            color: CREAM,
            maxWidth: 940,
          }}
        >
          {t("title")}
        </div>

        <div
          style={{
            display: "flex",
            position: "relative",
            width: "100%",
            height: 24,
          }}
        >
          {dots.map((dot) => (
            <div
              key={dot.key}
              style={{
                display: "flex",
                position: "absolute",
                left: `${dot.x}%`,
                bottom: `${dot.y}px`,
                width: dot.dotSize,
                height: dot.dotSize,
                borderRadius: "50%",
                background: MINT,
                opacity: dot.dotSize > 5 ? 0.9 : 0.45,
              }}
            />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
