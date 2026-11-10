"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { Button, PageHeader, useActionFeedback } from "@/components/ui";
import { createExpressSession } from "@/app/actions/sessions";
import { useConnectivity } from "@/hooks/useConnectivity";
import {
  EXPRESS_DEFAULT_SAMPLES,
  EXPRESS_FORMATS,
  EXPRESS_MAX_SAMPLES,
  EXPRESS_NAME_MAX,
  clampSampleCount,
  type ExpressFormat,
} from "@/lib/expressSession";
import {
  EXPRESS_FIRST_RUN_FORMAT,
  LAST_FORMAT_KEY,
  parseLastFormat,
  wizardHandoffQuery,
} from "@/lib/sessionDefaults";

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
  nameRequired: string;
  /** Shown (and submit disabled) while the connectivity probe says offline. */
  offline: string;
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
  // Shared connectivity probe (not navigator.onLine): creating a session needs
  // the server, so offline the submit is disabled and every value is kept.
  // TODO(E5): queued creation while offline awaits Kim (E5); detection only.
  const { online } = useConnectivity();

  const [name, setName] = useState(defaultName);
  const [format, setFormat] = useState<ExpressFormat>(EXPRESS_FIRST_RUN_FORMAT);
  const [nameError, setNameError] = useState(false);

  // Remembered last format (per device; shared with the full wizard).
  useEffect(() => {
    try {
      const last = parseLastFormat(window.localStorage.getItem(LAST_FORMAT_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last) setFormat(last);
    } catch {
      // storage blocked: keep the first-run default
    }
  }, []);
  const [sampleCount, setSampleCount] = useState(EXPRESS_DEFAULT_SAMPLES);

  const formatLabels: Record<ExpressFormat, string> = {
    descriptive: t.formatDescriptive,
    affective: t.formatAffective,
    combined: t.formatCombined,
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError(true);
      document.getElementById("express-name")?.focus();
      return;
    }
    try {
      window.localStorage.setItem(LAST_FORMAT_KEY, format);
    } catch {
      // non-fatal
    }
    startTransition(async () => {
      await feedback.run(
        createExpressSession({ name: name.trim(), format, sampleCount, locale }),
        ({ sessionId }) => router.push(`/${locale}/app/sessions/${sessionId}/cup`),
      );
    });
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-md mx-auto space-y-6">
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
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(false);
          }}
          enterKeyHint="go"
          aria-invalid={nameError}
          aria-describedby={nameError ? "express-name-error" : undefined}
          className={inputClass}
        />
        {nameError && (
          <p id="express-name-error" role="alert" className="text-sm text-error">
            {t.nameRequired}
          </p>
        )}
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
        {!online && (
          <p role="status" className="text-center text-sm text-error">
            {t.offline}
          </p>
        )}
        <Button
          variant="primary"
          className="w-full min-h-[48px]"
          type="submit"
          disabled={pending || !online}
        >
          {pending ? t.creating : t.cta}
        </Button>
        <Link
          href={`/${locale}/app/sessions/new${wizardHandoffQuery({ name, format, sampleCount })}`}
          className="text-sm text-on-surface-variant underline-offset-4 hover:underline text-center block"
        >
          {t.fullWizard}
        </Link>
      </div>
    </form>
  );
}
