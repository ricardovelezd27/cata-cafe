"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Button, PageHeader, useActionFeedback } from "@/components/ui";
import { createExpressSession } from "@/app/actions/sessions";
import {
  EXPRESS_DEFAULT_FORMAT,
  EXPRESS_DEFAULT_SAMPLES,
  EXPRESS_FORMATS,
  EXPRESS_MAX_SAMPLES,
  EXPRESS_NAME_MAX,
  clampSampleCount,
  type ExpressFormat,
} from "@/lib/expressSession";

export type ExpressFormTranslations = {
  title: string;
  subtitle: string;
  back: string;
  name: string;
  format: string;
  formatDescriptive: string;
  formatAffective: string;
  formatCombined: string;
  samples: string;
  samplesHint: string;
  decrement: string;
  increment: string;
  cta: string;
  creating: string;
  fullWizard: string;
};

const inputClass =
  "w-full min-h-[48px] border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

const stepperButtonClass =
  "h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-full border border-outline-variant text-on-surface bg-surface-container-lowest transition-colors hover:bg-primary-fixed disabled:opacity-40 disabled:cursor-default disabled:hover:bg-surface-container-lowest";

export function ExpressForm({
  locale,
  defaultName,
  translations,
}: {
  locale: string;
  defaultName: string;
  translations: ExpressFormTranslations;
}) {
  const t = translations;
  const router = useRouter();
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<ExpressFormat>(EXPRESS_DEFAULT_FORMAT);
  const [sampleCount, setSampleCount] = useState(EXPRESS_DEFAULT_SAMPLES);

  const formatLabels: Record<ExpressFormat, string> = {
    descriptive: t.formatDescriptive,
    affective: t.formatAffective,
    combined: t.formatCombined,
  };

  function submit() {
    startTransition(async () => {
      await feedback.run(
        createExpressSession({ name: name.trim(), format, sampleCount, locale }),
        ({ sessionId }) => router.push(`/${locale}/app/sessions/${sessionId}/cup`),
      );
    });
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        backHref={`/${locale}/app/sessions`}
        backLabel={t.back}
      />

      <div className="space-y-2">
        <label htmlFor="express-name" className="block text-sm font-medium text-on-surface">
          {t.name}
        </label>
        <input
          id="express-name"
          type="text"
          value={name}
          maxLength={EXPRESS_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <span id="express-format-label" className="block text-sm font-medium text-on-surface">
          {t.format}
        </span>
        <div
          role="radiogroup"
          aria-labelledby="express-format-label"
          className="grid grid-cols-3 gap-2"
        >
          {EXPRESS_FORMATS.map((f) => {
            const active = f === format;
            return (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFormat(f)}
                className={`min-h-[48px] rounded-pill px-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary-container text-on-primary border border-primary-container"
                    : "border border-outline-variant text-on-surface bg-surface-container-lowest hover:bg-primary-fixed"
                }`}
              >
                {formatLabels[f]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <span id="express-samples-label" className="block text-sm font-medium text-on-surface">
          {t.samples}
        </span>
        <div
          role="group"
          aria-labelledby="express-samples-label"
          className="flex items-center justify-center gap-6"
        >
          <button
            type="button"
            aria-label={t.decrement}
            disabled={sampleCount <= 1}
            onClick={() => setSampleCount((n) => clampSampleCount(n - 1))}
            className={stepperButtonClass}
          >
            <Minus size={20} aria-hidden />
          </button>
          <span
            aria-live="polite"
            className="min-w-[3ch] text-center font-display text-4xl text-primary-container"
          >
            {sampleCount}
          </span>
          <button
            type="button"
            aria-label={t.increment}
            disabled={sampleCount >= EXPRESS_MAX_SAMPLES}
            onClick={() => setSampleCount((n) => clampSampleCount(n + 1))}
            className={stepperButtonClass}
          >
            <Plus size={20} aria-hidden />
          </button>
        </div>
        <p className="text-center text-xs text-on-surface-variant">{t.samplesHint}</p>
      </div>

      <div className="space-y-3">
        <Button
          variant="primary"
          className="w-full min-h-[48px]"
          disabled={pending || !name.trim()}
          onClick={submit}
        >
          {pending ? t.creating : t.cta}
        </Button>
        <Link
          href={`/${locale}/app/sessions/new`}
          className="text-sm text-on-surface-variant underline-offset-4 hover:underline text-center block"
        >
          {t.fullWizard}
        </Link>
      </div>
    </div>
  );
}
