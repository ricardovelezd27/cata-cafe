"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Coffee, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { completeOnboarding, dismissOnboarding } from "@/app/actions/profile";
import { useActionFeedback } from "@/components/ui";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { COUNTRIES } from "@/lib/constants";

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
  roles: Record<(typeof ROLE_VALUES)[number], string>;
  paths: Record<(typeof PATH_DEFS)[number]["id"], { label: string; description: string }>;
}

const inputClass =
  "w-full border border-outline-variant rounded-input px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

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
  const [step, setStep] = useState<1 | 2 | 3>(1);
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

  const dialogTitle = step === 1 ? t.welcomeTitle : step === 2 ? t.aboutYou : t.whereToStart;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
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
              <p className="text-sm font-medium text-on-surface">
                {t.welcomeTagline}
              </p>
              <p className="text-sm text-on-surface-variant">
                {t.welcomeBody}
              </p>
            </div>

            <Dots current={1} />

            <button
              onClick={() => setStep(2)}
              className="w-full bg-primary-container text-on-primary rounded-pill py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary transition-colors"
            >
              {t.start} <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleDismiss}
              disabled={isPending}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {t.skip}
            </button>
          </div>
        )}

        {/* Step 2 — Profile */}
        {step === 2 && (
          <div className="pb-2 flex flex-col gap-5">
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-on-surface mb-1 block">
                  {t.fullName}
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-on-surface mb-1 block">
                  {t.role}
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>{t.selectRole}</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-on-surface mb-1 block">
                  {t.country}
                </span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>{t.selectCountry}</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <Dots current={2} />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-3 text-sm text-on-surface border border-outline-variant rounded-pill hover:bg-surface-container transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> {t.back}
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!displayName || !role || !country}
                className="flex-1 bg-primary-container text-on-primary rounded-pill py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t.next} <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — First step */}
        {step === 3 && (
          <div className="pb-2 flex flex-col gap-5">
            <div className="space-y-3">
              {PATHS.map((path) => {
                const Icon = path.icon;
                const isSelected = selectedPath === path.id;
                return (
                  <button
                    key={path.id}
                    onClick={() => setSelectedPath(path.id)}
                    className={`w-full text-left rounded-card border-2 p-4 flex items-start gap-3 transition-all ${
                      isSelected
                        ? "border-primary-container bg-primary-fixed"
                        : "border-outline-variant bg-surface-container-lowest hover:border-outline hover:bg-surface-container-low"
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1.5 rounded-sm ${
                        isSelected
                          ? "bg-primary-container text-on-primary"
                          : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-primary-container" : "text-on-surface"}`}>
                        {path.label}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{path.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Dots current={3} />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-4 py-3 text-sm text-on-surface border border-outline-variant rounded-pill hover:bg-surface-container transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> {t.back}
              </button>
              <button
                onClick={handleFinish}
                disabled={!selectedPath || isPending}
                className="flex-1 bg-primary-container text-on-primary rounded-pill py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? t.saving : t.goTo.replace("{label}", selectedPathLabel)}
                {!isPending && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function Dots({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-2 justify-center">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`w-2 h-2 rounded-full transition-colors ${
            n === current ? "bg-primary-container" : "bg-outline-variant"
          }`}
        />
      ))}
    </div>
  );
}
