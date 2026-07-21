import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getBenchmarkComparison,
  getOriginContext,
  listBenchmarkSlices,
} from "@/lib/analytics/benchmarks";
import { citationLines } from "@/lib/analytics/referenceSources";
import { BenchmarkPanel } from "@/components/insights/BenchmarkPanel";
import { OriginContextPanel } from "@/components/insights/OriginContextPanel";
import { SourceAttribution } from "@/components/insights/SourceAttribution";

export function generateStaticParams() {
  return [{ locale: "es" }, { locale: "en" }];
}

export default async function InsightsBenchmarkPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale === "en" ? "en" : "es";

  const [t, originT, slices, comparison] = await Promise.all([
    getTranslations("insights.benchmark"),
    getTranslations("insights.origin"),
    listBenchmarkSlices(loc),
    getBenchmarkComparison({}),
  ]);

  const initialCountryCode = slices.countries.length > 0 ? slices.countries[0].iso2 : null;
  const initialContext = initialCountryCode
    ? await getOriginContext(initialCountryCode, loc)
    : null;

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div>
        <h2 className="font-display text-xl text-brown-dark mb-1">{t("title")}</h2>
        <p className="text-sm text-brown-mid">{t("subtitle")}</p>
      </div>

      <BenchmarkPanel
        slices={slices}
        initialComparison={comparison}
        t={{
          country: t("country"),
          process: t("process"),
          variety: t("variety"),
          all: t("all"),
          mineTitle: t("mineTitle"),
          benchmarkTitle: t("benchmarkTitle"),
          evaluations: t("evaluations"),
          lots: t("lots"),
          avg: t("avg"),
          range: t("range"),
          p25p75: t("p25p75"),
          methodologyNote: t("methodologyNote"),
          empty: t("empty"),
        }}
      />

      <OriginContextPanel
        locale={loc}
        countries={slices.countries}
        initialCountryCode={initialCountryCode}
        initialContext={initialContext}
        t={{
          title: originT("title"),
          country: t("country"),
          production: originT("production"),
          myActivity: originT("myActivity"),
          avgScore: originT("avgScore"),
          empty: originT("empty"),
        }}
      />

      <SourceAttribution lines={citationLines(["cqi_arabica", "owid_fao"], loc)} />
    </div>
  );
}
