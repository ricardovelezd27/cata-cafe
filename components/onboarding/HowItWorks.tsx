"use client";

import { useState } from "react";
import { ChevronDown, Sigma } from "lucide-react";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import { TextAction } from "@/components/ui";

/**
 * The words of "Cómo funciona" (messages `dashboard.intro`, kept under that key so
 * the copy did not move: it used to be a card on the dashboard, 2026-11-20).
 * Client components do not call useTranslations, so the page passes them in.
 */
export type HowItWorksStrings = {
  eyebrow: string;
  title: string;
  whyLabel: string;
  why: string;
  whatLabel: string;
  what: string;
  howLabel: string;
  how: string;
  ctaCalc: string;
  calcTitle: string;
  calcLead: string;
  calcSigma: string;
  calcU: string;
  calcD: string;
  calcAnchors: string;
  calcRounding: string;
  calcGroup: string;
  calcPerResult: string;
};

/**
 * "Cómo funciona": the three moves (choose, cup, review) and the CVA formula behind
 * the score, one disclosure away. It is the second step of the welcome dialog and
 * the dialog the profile reopens for someone who already finished onboarding.
 * It draws only: no storage, no action.
 */
export function HowItWorks({ t, showTitle = true }: { t: HowItWorksStrings; showTitle?: boolean }) {
  const [showCalc, setShowCalc] = useState(false);
  const steps = [
    { label: t.whyLabel, body: t.why },
    { label: t.whatLabel, body: t.what },
    { label: t.howLabel, body: t.how },
  ];

  return (
    <div className="flex flex-col gap-5 text-left">
      {showTitle && <p className="text-body font-medium text-on-surface">{t.title}</p>}

      {/* choose / cup / review: a connected sequence, not a grid of cards */}
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-start gap-3">
            <span className="step-mark mt-0.5" aria-hidden>
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="label-caps text-primary-container">{step.label}</p>
              <p className="mt-1 max-w-[68ch] text-body leading-relaxed text-on-surface-variant">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <TextAction
        tone="none"
        onClick={() => setShowCalc((v) => !v)}
        aria-expanded={showCalc}
        className="gap-2 self-start text-caption font-semibold text-primary-container transition-colors hover:text-primary-muted"
      >
        <Sigma size={15} className="text-secondary" aria-hidden />
        {t.ctaCalc}
        <ChevronDown
          size={15}
          aria-hidden
          className="transition-transform duration-200"
          style={{ transform: showCalc ? "rotate(180deg)" : "none" }}
        />
      </TextAction>

      {/* methodology: progressive disclosure, animated via grid-rows */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: showCalc ? "1fr" : "0fr" }}
        // Collapsed content must not be reachable by Tab or a reader.
        inert={!showCalc}
      >
        <div className="overflow-hidden">
          <div className="rounded-input border border-outline-variant bg-surface-container/60 p-4">
            <PaperSectionHeading level={3} title={t.calcTitle} flush />
            <p className="mt-1 max-w-[68ch] text-body text-on-surface-variant">{t.calcLead}</p>

            {/* the formula, set apart and scrollable on narrow screens */}
            <div className="mt-3 overflow-x-auto rounded-sm border border-outline-variant bg-surface-container-lowest px-4 py-3">
              <code className="mono whitespace-nowrap text-body font-semibold text-primary-container">
                S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
              </code>
            </div>

            <dl className="mt-4 space-y-2.5">
              {[
                { term: "Σhᵢ", body: t.calcSigma },
                { term: "u", body: t.calcU },
                { term: "d", body: t.calcD },
              ].map((row) => (
                <div key={row.term} className="flex gap-3">
                  <dt className="mono shrink-0 pt-px text-caption font-bold text-secondary">{row.term}</dt>
                  <dd className="max-w-[68ch] text-body leading-relaxed text-on-surface-variant">{row.body}</dd>
                </div>
              ))}
            </dl>

            <ul className="mt-4 space-y-1.5 border-t border-outline-variant pt-3">
              {[t.calcAnchors, t.calcRounding, t.calcGroup, t.calcPerResult].map((note, i) => (
                <li key={i} className="flex max-w-[68ch] gap-2 text-body leading-relaxed text-on-surface-variant">
                  <span aria-hidden className="text-on-surface-variant">
                    ·
                  </span>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
