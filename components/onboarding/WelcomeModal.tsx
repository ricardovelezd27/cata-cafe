"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Coffee, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { completeOnboarding, dismissOnboarding } from "@/app/actions/profile";
import { TextAction, useActionFeedback, Button } from "@/components/ui";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { radioKeyDown } from "@/components/radioKeys";
import { COUNTRIES } from "@/lib/constants";
import { HowItWorks, type HowItWorksStrings } from "@/components/onboarding/HowItWorks";

// NOTE: these lists drive ONBOARDING CHOICES (values + prompt copy), a separate
// concern from display labels shown elsewhere (profile, co-cupper cards, etc).
// For display labels of a Profile's `role` field, see lib/constants.ts ROLE_LABELS.
// Copy arrives through `translations` (messages `onboarding`): client components
// do not call useTranslations (CLAUDE.md i18n rule).
const ROLE_VALUES = ["q_grader", "barista", "roaster", "producer", "trader", "enthusiast"] as const;

const PATH_DEFS = [
  { id: "session", icon: ClipboardList, href: "/app/sessions/new" },
  { id: "coffee", icon: Coffee, href: "/app/coffees" },
  { id: "join", icon: Users, href: "/app/sessions" },
] as const;

export interface WelcomeModalTranslations {
  welcomeTitle: string;
  welcomeTagline: string;
  welcomeBody: string;
  start: string;
  skip: string;
  aboutYou: string;
  fullName: string;
  namePlaceholder: string;
  role: string;
  selectRole: string;
  country: string;
  selectCountry: string;
  back: string;
  next: string;
  whereToStart: string;
  saving: string;
  close: string;
  /** Raw ICU template with a {label} placeholder, replaced client-side. */
  goTo: string;
  /** Raw template "Paso {n} de {total}", replaced client-side. */
  stepOf: string;
  /** The second step, "Cómo funciona" (the words of `dashboard.intro`, moved off the dashboard). */
  howItWorks: HowItWorksStrings;
  roles: Record<(typeof ROLE_VALUES)[number], string>;
  paths: Record<(typeof PATH_DEFS)[number]["id"], { label: string; description: string }>;
}

const inputClass =
  "w-full border border-outline-variant rounded-input px-3 py-2 text-body text-on-surface placeholder:text-on-surface-variant/60 bg-surface-container-lowest focus:border-primary-container transition-colors";

interface WelcomeModalProps {
  locale: string;
  initialDisplayName: string;
  translations: WelcomeModalTranslations;
}

export default function WelcomeModal({ locale, initialDisplayName, translations: t }: WelcomeModalProps) {
  const PATHS = PATH_DEFS.map((p) => ({ ...p, ...t.paths[p.id] }));
  const ROLES = ROLE_VALUES.map((value) => ({ value, label: t.roles[value] }));
  const router = useRouter();
  const feedback = useActionFeedback();
  const [isPending, startTransition] = useTransition();

  const [open, setOpen] = useState(true);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [role, setRole] = useState("");
  const [country, setCountry] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // X, Esc, tapping outside and "skip" all do the same thing: mark onboarding
  // done and write nothing else (no invented role). F-entrar-4.
  function handleDismiss() {
    setOpen(false);
    startTransition(async () => {
      await feedback.run(dismissOnboarding(), () => router.refresh());
    });
  }

  function handleFinish() {
    if (!selectedPath) return;
    const path = PATHS.find((p) => p.id === selectedPath);
    if (!path) return;
    startTransition(async () => {
      await feedback.run(completeOnboarding({ displayName, role, country }), () =>
        router.push(`/${locale}${path.href}`),
      );
    });
  }

  const selectedPathLabel = PATHS.find((p) => p.id === selectedPath)?.label ?? "";

  const dialogTitle =
    step === 1 ? t.welcomeTitle : step === 2 ? t.howItWorks.eyebrow : step === 3 ? t.aboutYou : t.whereToStart;

  return (
    <ResponsiveDialog
      open={open}
      // Escape / outside tap only dismiss on the welcome step; from step 2 on
      // they are ignored so a typed name/role/country is never discarded by
      // accident. The X (below) and "skip" always dismiss.
      onOpenChange={(next) => {
        if (!next && step === 1) handleDismiss();
      }}
      onCloseButtonClick={(e) => {
        e.preventDefault();
        handleDismiss();
      }}
      title={dialogTitle}
      closeLabel={t.close}
    >
      <div>
        {/* Step 1 — Welcome */}
        {step === 1 && (
          <div className="pb-2 flex flex-col items-center text-center gap-5">
            <span className="text-5xl" aria-hidden>☕</span>
            <div className="space-y-2">
              <p className="text-body font-medium text-on-surface">
                {t.welcomeTagline}
              </p>
              <p className="text-caption text-on-surface-variant">
                {t.welcomeBody}
              </p>
            </div>

            <Steps current={1} label={t.stepOf} />

            <Button
              onClick={() => setStep(2)}
              className="w-full"
            >
              {t.start} <ChevronRight className="w-4 h-4" />
            </Button>
            <TextAction
              tone="none"
              onClick={handleDismiss}
              disabled={isPending}
              className="text-caption text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {t.skip}
            </TextAction>
          </div>
        )}

        {/* Step 2 — How it works (moved here from the dashboard, 2026-11-20) */}
        {step === 2 && (
          <div className="pb-2 flex flex-col gap-5">
            <HowItWorks t={t.howItWorks} />

            <Steps current={2} label={t.stepOf} />

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4" /> {t.back}
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                {t.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Profile */}
        {step === 3 && (
          <div className="pb-2 flex flex-col gap-5">
            <div className="space-y-4">
              <label className="block">
                <span className="text-body font-medium text-on-surface mb-1 block">
                  {t.fullName}
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  className={`${inputClass} min-h-[44px]`}
                />
              </label>

              <label className="block">
                <span className="text-body font-medium text-on-surface mb-1 block">
                  {t.role}
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={`${inputClass} min-h-[44px]`}
                >
                  <option value="" disabled>{t.selectRole}</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-body font-medium text-on-surface mb-1 block">
                  {t.country}
                </span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={`${inputClass} min-h-[44px]`}
                >
                  <option value="" disabled>{t.selectCountry}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <Steps current={3} label={t.stepOf} />

            <div className="flex gap-3">
              <Button variant="secondary"
                onClick={() => setStep(2)}
              >
                <ChevronLeft className="w-4 h-4" /> {t.back}
              </Button>
              <Button
                onClick={() => setStep(4)}
                disabled={!displayName || !role || !country}
                className="flex-1"
              >
                {t.next} <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 — First step */}
        {step === 4 && (
          <div className="pb-2 flex flex-col gap-5">
            {/* N3: one choice of three, a radio group named by the step's visible title. */}
            <div role="radiogroup" aria-label={t.whereToStart} className="space-y-3">
              {PATHS.map((path, i) => {
                const Icon = path.icon;
                const isSelected = selectedPath === path.id;
                return (
                  <button
                    key={path.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    // The checked card is the Tab stop; before any choice, the first one.
                    tabIndex={isSelected || (selectedPath === null && i === 0) ? 0 : -1}
                    onClick={() => setSelectedPath(path.id)}
                    onKeyDown={(e) => radioKeyDown(e, i, PATHS.length, (n) => setSelectedPath(PATHS[n].id))}
                    className={`w-full text-left rounded-card border-2 p-4 flex items-start gap-3 transition-all ${
                      isSelected
                        ? "border-primary-fixed bg-primary-fixed"
                        : "border-outline hover:bg-surface-container active:bg-surface-container"
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1.5 rounded-sm ${
                        isSelected
                          ? "bg-surface-container-lowest text-on-primary-fixed"
                          : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-body font-medium ${isSelected ? "text-primary-container" : "text-on-surface"}`}>
                        {path.label}
                      </p>
                      <p className="text-caption text-on-surface-variant mt-0.5">{path.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Steps current={4} label={t.stepOf} />

            <div className="flex gap-3">
              <Button variant="secondary"
                onClick={() => setStep(3)}
              >
                <ChevronLeft className="w-4 h-4" /> {t.back}
              </Button>
              <Button
                onClick={handleFinish}
                disabled={!selectedPath || isPending}
                className="flex-1"
              >
                {isPending ? t.saving : t.goTo.replace("{label}", selectedPathLabel)}
                {!isPending && <ChevronRight className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

/**
 * Where the person is in the four steps (audit D-04): numbered steps, the app's
 * one paper recipe (`.step-mark`), with the step said in words ("Paso 2 de 3").
 * They run left to right because the dialog is advanced with a "next" button.
 * Not tappable: going back is the "Atrás" button.
 */
function Steps({ current, label }: { current: 1 | 2 | 3 | 4; label: string }) {
  const total = 4;
  const said = label.replace("{n}", String(current)).replace("{total}", String(total));
  return (
    <div className="flex flex-col items-center gap-[8px]" data-onboarding-steps="">
      <ol className="m-0 flex list-none items-center gap-[8px] p-0" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <li key={n} className="step-mark" data-on={n === current ? "1" : undefined}>
            {n}
          </li>
        ))}
      </ol>
      <p className="text-caption text-on-surface-variant">{said}</p>
    </div>
  );
}
