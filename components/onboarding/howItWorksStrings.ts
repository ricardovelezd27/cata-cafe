import type { HowItWorksStrings } from "@/components/onboarding/HowItWorks";

/** Builds the "Cómo funciona" words from the `dashboard` namespace (they keep their old keys, `intro.*`). */
export function howItWorksStrings(t: (key: string) => string): HowItWorksStrings {
  return {
    eyebrow: t("intro.eyebrow"),
    title: t("intro.title"),
    whyLabel: t("intro.whyLabel"),
    why: t("intro.why"),
    whatLabel: t("intro.whatLabel"),
    what: t("intro.what"),
    howLabel: t("intro.howLabel"),
    how: t("intro.how"),
    ctaCalc: t("intro.ctaCalc"),
    calcTitle: t("intro.calcTitle"),
    calcLead: t("intro.calcLead"),
    calcSigma: t("intro.calcSigma"),
    calcU: t("intro.calcU"),
    calcD: t("intro.calcD"),
    calcAnchors: t("intro.calcAnchors"),
    calcRounding: t("intro.calcRounding"),
    calcGroup: t("intro.calcGroup"),
    calcPerResult: t("intro.calcPerResult"),
  };
}
