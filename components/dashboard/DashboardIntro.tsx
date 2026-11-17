"use client";

import { useState, useSyncExternalStore } from "react";
import { X, ChevronDown, Sigma, HelpCircle } from "lucide-react";
import { introStartsCollapsed } from "@/lib/dashboardIntro";

export type IntroTranslations = {
  eyebrow: string;
  title: string;
  whyLabel: string;
  why: string;
  whatLabel: string;
  what: string;
  howLabel: string;
  how: string;
  ctaCalc: string;
  dismiss: string;
  reopen: string;
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

const STORAGE_KEY = "cata_intro_dismissed";
const STORE_EVENT = "cata-intro-change";

// Read the dismissed flag from localStorage via an external store so we avoid
// calling setState inside an effect (React 19 cascading-render rule) and let
// React handle the SSR → client snapshot transition without a hydration flash.
function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(STORE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(STORE_EVENT, cb);
  };
}
function getSnapshot() {
  return localStorage.getItem(STORAGE_KEY) === "1";
}
function getServerSnapshot() {
  return false; // SSR: render the full intro
}

export function DashboardIntro({
  t,
  sessionCount,
}: {
  t: IntroTranslations;
  /** The person's sessions (owned or joined): one or more makes them a returning user (S6, F-15). */
  sessionCount: number;
}) {
  const dismissed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [showCalc, setShowCalc] = useState(false);
  // Reopened on this page view only (not stored): a returning user who opens it sees it until they leave.
  const [expanded, setExpanded] = useState(false);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setShowCalc(false);
    setExpanded(false);
    window.dispatchEvent(new Event(STORE_EVENT));
  }

  function reopen() {
    localStorage.removeItem(STORAGE_KEY);
    setExpanded(true);
    window.dispatchEvent(new Event(STORE_EVENT));
  }

  if (!expanded && introStartsCollapsed({ sessionCount, dismissed })) {
    return (
      <button
        onClick={reopen}
        className="min-h-[44px] group inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary-container transition-colors"
      >
        <HelpCircle size={15} className="text-green-mid" />
        <span className="underline decoration-outline-variant decoration-1 underline-offset-4 group-hover:decoration-primary-container">
          {t.reopen}
        </span>
      </button>
    );
  }

  const steps = [
    { label: t.whyLabel, body: t.why },
    { label: t.whatLabel, body: t.what },
    { label: t.howLabel, body: t.how },
  ];

  return (
    <section
      aria-label={t.eyebrow}
      className="relative overflow-hidden rounded-card border border-outline-variant bg-surface-container-lowest"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* warm parchment wash so the panel reads as guidance, not data */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--color-green-dark) 5%, white) 0%, white 42%)",
        }}
      />

      <div className="relative p-5 sm:p-6">
        {/* dismiss */}
        <button
          onClick={dismiss}
          aria-label={t.dismiss}
          className="absolute right-1 top-1 grid h-[44px] w-[44px] place-items-center rounded-pill text-on-surface-variant hover:bg-surface-container hover:text-primary-container transition-colors"
        >
          <X size={15} />
        </button>

        {/* heading */}
        <p className="mono text-[11px] font-semibold uppercase tracking-[0.18em] text-green-mid">
          {t.eyebrow}
        </p>
        <h2 className="section-title mt-1 max-w-xl text-2xl leading-tight sm:text-[26px]">
          {t.title}
        </h2>

        {/* why / what / how — a connected sequence, not a grid of cards */}
        <ol className="mt-5 grid gap-5 sm:grid-cols-3 sm:gap-0">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className="relative sm:px-5 sm:first:pl-0 sm:last:pr-0"
            >
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1 hidden h-[calc(100%-0.25rem)] w-px bg-outline-variant sm:block"
                />
              )}
              <div className="flex items-baseline gap-2.5">
                <span className="font-display text-xl leading-none text-primary-fixed-dim tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-primary-container">
                  {step.label}
                </span>
              </div>
              <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-on-surface-variant">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        {/* actions */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button
            onClick={() => setShowCalc((v) => !v)}
            aria-expanded={showCalc}
            className="min-h-[44px] inline-flex items-center gap-2 text-sm font-semibold text-primary-container transition-colors hover:text-green-mid"
          >
            <Sigma size={15} className="text-secondary" />
            {t.ctaCalc}
            <ChevronDown
              size={15}
              className="transition-transform duration-200"
              style={{ transform: showCalc ? "rotate(180deg)" : "none" }}
            />
          </button>
        </div>

        {/* methodology — progressive disclosure, animated via grid-rows */}
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: showCalc ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="mt-5 rounded-input border border-outline-variant bg-surface-container/60 p-4 sm:p-5">
              <h3 className="text-lg">
                {t.calcTitle}
              </h3>
              <p className="mt-1 max-w-[68ch] text-sm text-on-surface-variant">{t.calcLead}</p>

              {/* the formula, set apart and scrollable on narrow screens */}
              <div className="mt-3 overflow-x-auto rounded-sm border border-outline-variant bg-surface-container-lowest px-4 py-3">
                <code className="mono whitespace-nowrap text-[15px] font-semibold text-primary-container">
                  S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
                </code>
              </div>

              {/* term glossary */}
              <dl className="mt-4 space-y-2.5">
                {[
                  { term: "Σhᵢ", body: t.calcSigma },
                  { term: "u", body: t.calcU },
                  { term: "d", body: t.calcD },
                ].map((row) => (
                  <div key={row.term} className="flex gap-3">
                    <dt className="mono shrink-0 pt-px text-sm font-bold text-secondary">
                      {row.term}
                    </dt>
                    <dd className="max-w-[68ch] text-sm leading-relaxed text-on-surface-variant">
                      {row.body}
                    </dd>
                  </div>
                ))}
              </dl>

              {/* notes */}
              <ul className="mt-4 space-y-1.5 border-t border-outline-variant pt-3">
                {[t.calcAnchors, t.calcRounding, t.calcGroup, t.calcPerResult].map(
                  (note, i) => (
                    <li
                      key={i}
                      className="flex max-w-[68ch] gap-2 text-[13px] leading-relaxed text-on-surface-variant"
                    >
                      <span aria-hidden className="text-green-mid">
                        ·
                      </span>
                      {note}
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>

        {/* clear completion action (onboarding best practice) */}
        <div className="mt-5">
          <button
            onClick={dismiss}
            className="min-h-[44px] min-w-[44px] text-sm font-medium text-on-surface-variant underline decoration-outline-variant decoration-1 underline-offset-4 transition-colors hover:text-primary-container hover:decoration-primary-container"
          >
            {t.dismiss}
          </button>
        </div>
      </div>
    </section>
  );
}
