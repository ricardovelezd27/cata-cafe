"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { createSession, createGroupSession } from "@/app/actions/sessions";
import { startSession } from "@/app/actions/community";

type CoffeeInput = {
  name: string;
  producer: string;
  variety: string;
  altitude: string;
  roastLevel: string;
  country: string;
  region: string;
};

type CoffeeEntry = CoffeeInput & { id: string };

type SampleEntry = {
  id: string;
  label: string;
  coffeeId: string;
  /** True while the label is still the auto-generated "Muestra X" text (not user-edited). */
  auto: boolean;
  /** Each coffee card owns exactly one primary sample; extras are added explicitly. */
  primary: boolean;
};

type Translations = {
  name: string;
  namePh: string;
  date: string;
  objective: string;
  objectivePh: string;
  format: string;
  cups: string;
  formatDescriptive: string;
  formatAffective: string;
  formatCombined: string;
  // coffee section
  coffees: string;
  coffeeName: string;
  producerRoaster: string;
  coffeeVariety: string;
  coffeeAltitude: string;
  coffeeRoastLevel: string;
  coffeeCountry: string;
  coffeeRegion: string;
  addCoffee: string;
  removeCoffee: string;
  start: string;
  // group
  groupToggle: string;
  groupClosesAt: string;
  groupInviteLink: string;
  groupCopyLink: string;
  groupCopied: string;
  groupStartCupping: string;
  // new form microcopy
  newForm: {
    required: string;
    optionalSuffix: string;
    coffeeCard: string;
    addSampleOfCoffee: string;
    sampleChip: string;
    errors: {
      no_samples: string;
      no_coffees: string;
      missing_coffee_fields: string;
      sample_without_coffee: string;
      generic: string;
    };
  };
};

type WizardStep = "form" | "invite";

const sampleLetter = (i: number) => {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s; // 0→A … 25→Z, 26→AA
};

/** Stable id for coffees/samples so React keys and card refs survive add/remove. */
const newId = () => crypto.randomUUID();

const EMPTY_COFFEE: CoffeeInput = {
  name: "",
  producer: "",
  variety: "",
  altitude: "",
  roastLevel: "",
  country: "",
  region: "",
};

/** All samples in card display order: coffees in order, each coffee's samples in their own order. */
function displayOrder(coffees: CoffeeEntry[], samples: SampleEntry[]): SampleEntry[] {
  const out: SampleEntry[] = [];
  for (const c of coffees) {
    for (const s of samples) {
      if (s.coffeeId === c.id) out.push(s);
    }
  }
  return out;
}

/** Recomputes A, B, C… letters across all samples in display order; leaves user-edited labels untouched. */
function relabel(coffees: CoffeeEntry[], samples: SampleEntry[], chip: string): SampleEntry[] {
  const ordered = displayOrder(coffees, samples);
  const letters = new Map(ordered.map((s, i) => [s.id, sampleLetter(i)]));
  return samples.map((s) => {
    if (!s.auto) return s;
    const letter = letters.get(s.id);
    return letter ? { ...s, label: `${chip} ${letter}` } : s;
  });
}

const inputCls =
  "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

function FieldLabel({
  children,
  required,
  requiredText,
  optionalText,
}: {
  children: React.ReactNode;
  required?: boolean;
  requiredText?: string;
  optionalText?: string;
}) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5">
      {children}
      {required && (
        <>
          <span className="text-secondary" aria-hidden="true">
            {" "}
            *
          </span>
          {requiredText && <span className="sr-only"> ({requiredText})</span>}
        </>
      )}
      {!required && optionalText && (
        <span className="normal-case tracking-normal font-normal text-on-surface-variant">
          {" "}
          ({optionalText})
        </span>
      )}
    </label>
  );
}

export function NewSessionForm({
  locale,
  t,
  countries,
}: {
  locale: string;
  t: Translations;
  countries: string[];
}) {
  const router = useRouter();

  // Session basics
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [objective, setObjective] = useState("");
  const [format, setFormat] = useState<"descriptive" | "affective" | "combined">("combined");
  const [cupsPerSample, setCupsPerSample] = useState(2);

  const [coffees, setCoffees] = useState<CoffeeEntry[]>(() => [{ ...EMPTY_COFFEE, id: newId() }]);
  const [samples, setSamples] = useState<SampleEntry[]>(() => [
    {
      id: newId(),
      label: `${t.newForm.sampleChip} ${sampleLetter(0)}`,
      coffeeId: coffees[0].id,
      auto: true,
      primary: true,
    },
  ]);

  // Group session fields
  const [isGroup, setIsGroup] = useState(false);
  const [closesAt, setClosesAt] = useState("");

  // Client-side validation state
  const [invalidCoffeeId, setInvalidCoffeeId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Wizard state
  const [step, setStep] = useState<WizardStep>("form");
  const [inviteToken, setInviteToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [copied, setCopied] = useState(false);

  const [pending, start] = useTransition();

  // ── Coffee + sample helpers ────────────────────────────────────────────────
  const updateCoffee = (id: string, field: keyof CoffeeInput, value: string) => {
    setCoffees((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    if (invalidCoffeeId === id) {
      setInvalidCoffeeId(null);
      setErrorCode(null);
    }
  };

  const addCoffee = () => {
    const coffeeId = newId();
    const nextCoffees = [...coffees, { ...EMPTY_COFFEE, id: coffeeId }];
    const nextSamples = relabel(
      nextCoffees,
      [...samples, { id: newId(), label: "", coffeeId, auto: true, primary: true }],
      t.newForm.sampleChip
    );
    setCoffees(nextCoffees);
    setSamples(nextSamples);
  };

  const removeCoffee = (id: string) => {
    if (coffees.length <= 1) return;
    const nextCoffees = coffees.filter((c) => c.id !== id);
    const nextSamples = relabel(
      nextCoffees,
      samples.filter((s) => s.coffeeId !== id),
      t.newForm.sampleChip
    );
    setCoffees(nextCoffees);
    setSamples(nextSamples);
    if (invalidCoffeeId === id) {
      setInvalidCoffeeId(null);
      setErrorCode(null);
    }
  };

  const addSampleOfCoffee = (coffeeId: string) => {
    const nextSamples = relabel(
      coffees,
      [...samples, { id: newId(), label: "", coffeeId, auto: true, primary: false }],
      t.newForm.sampleChip
    );
    setSamples(nextSamples);
  };

  const removeSample = (id: string) => {
    const nextSamples = relabel(coffees, samples.filter((s) => s.id !== id), t.newForm.sampleChip);
    setSamples(nextSamples);
  };

  const updateSampleLabel = (id: string, value: string) => {
    setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, label: value, auto: false } : s)));
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const validateClient = (): boolean => {
    for (const c of coffees) {
      if (!c.name.trim() || !c.variety.trim() || !c.country.trim() || !c.altitude.trim()) {
        setInvalidCoffeeId(c.id);
        setErrorCode("missing_coffee_fields");
        cardRefs.current[c.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }
    }
    return true;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode(null);
    if (!validateClient()) return;

    const ordered = displayOrder(coffees, samples);
    const idxById = new Map(coffees.map((c, i) => [c.id, i]));
    const coffeePayload: CoffeeInput[] = coffees.map((c) => {
      const { id, ...rest } = c;
      void id;
      return rest;
    });
    const samplePayload = ordered.map((s) => ({
      label: s.label,
      coffeeIdx: idxById.get(s.coffeeId) ?? 0,
    }));

    start(async () => {
      if (!isGroup) {
        const result = await createSession({
          name,
          date,
          objective: objective || undefined,
          format,
          cupsPerSample,
          coffees: coffeePayload,
          samples: samplePayload,
          locale,
        });
        if (result) setErrorCode(result.error);
      } else {
        const result = await createGroupSession({
          name,
          date,
          objective: objective || undefined,
          format,
          cupsPerSample,
          coffees: coffeePayload,
          samples: samplePayload,
          closesAt: closesAt || undefined,
        });
        if (result.ok) {
          setSessionId(result.sessionId);
          setInviteToken(result.inviteToken);
          setStep("invite");
        } else {
          setErrorCode(result.error);
        }
      }
    });
  };

  const errorText = errorCode
    ? (t.newForm.errors as Record<string, string>)[errorCode] ?? t.newForm.errors.generic
    : null;

  const inviteUrl =
    typeof window !== "undefined" ? `${window.location.origin}/${locale}/join/${inviteToken}` : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Step 2: Invite link ──────────────────────────────────────────────────────
  if (step === "invite") {
    return (
      <div className="space-y-6">
        <div className="bg-surface-container-low border border-outline-variant rounded-card p-5 space-y-3">
          <p className="text-sm font-semibold text-primary-container">{t.groupInviteLink}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={inviteUrl}
              className={inputCls + " flex-1 text-xs select-all"}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="border border-primary-container text-primary-container rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-fixed transition-colors whitespace-nowrap"
            >
              {copied ? t.groupCopied : t.groupCopyLink}
            </button>
          </div>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            start(async () => {
              await startSession(sessionId);
              router.push(`/${locale}/app/sessions/${sessionId}/cup`);
            });
          }}
          className="w-full bg-primary-container text-on-primary rounded-pill py-3.5 font-medium hover:bg-primary transition-colors disabled:opacity-50"
        >
          {t.groupStartCupping}
        </button>
      </div>
    );
  }

  // ── Step 1: Session form ─────────────────────────────────────────────────────
  return (
    <form onSubmit={onSubmit} className="space-y-10">
      {/* 1. Session basics */}
      <div className="space-y-5">
        <div>
          <FieldLabel>{t.name}</FieldLabel>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t.namePh}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>{t.date}</FieldLabel>
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>{t.cups}</FieldLabel>
            <input
              type="number"
              min={1}
              max={5}
              className={inputCls}
              value={cupsPerSample}
              onChange={(e) => setCupsPerSample(parseInt(e.target.value) || 2)}
            />
          </div>
        </div>

        <div>
          <FieldLabel>{t.objective}</FieldLabel>
          <textarea
            className={inputCls + " min-h-[72px]"}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={t.objectivePh}
          />
        </div>
      </div>

      <hr className="border-t border-outline-variant" />

      {/* 2. Format */}
      <div>
        <FieldLabel>{t.format}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { v: "descriptive", l: t.formatDescriptive },
              { v: "affective", l: t.formatAffective },
              { v: "combined", l: t.formatCombined },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setFormat(opt.v)}
              className={
                format === opt.v
                  ? "bg-primary-container text-on-primary rounded-pill px-5 py-2.5 text-sm font-medium"
                  : "border border-outline-variant text-on-surface rounded-pill px-5 py-2.5 text-sm hover:bg-surface-container transition-colors"
              }
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      <hr className="border-t border-outline-variant" />

      {/* 3. Cafés a evaluar — unified coffee + sample cards */}
      <div className="space-y-4">
        <FieldLabel>{t.coffees}</FieldLabel>

        <datalist id="cata-coffee-countries">
          {countries.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="space-y-4">
          {coffees.map((coffee, i) => {
            const forCoffee = samples.filter((s) => s.coffeeId === coffee.id);
            const primarySample = forCoffee.find((s) => s.primary);
            const extraSamples = forCoffee.filter((s) => !s.primary);
            const invalid = invalidCoffeeId === coffee.id;

            return (
              <div
                key={coffee.id}
                ref={(el) => {
                  cardRefs.current[coffee.id] = el;
                }}
                role="group"
                aria-label={`${t.newForm.coffeeCard} ${i + 1}`}
                className={
                  "bg-surface-container-lowest border rounded-card shadow-card p-5 space-y-4 " +
                  (invalid ? "border-error" : "border-outline-variant")
                }
              >
                <div className="flex items-center gap-2">
                  <span className="bg-surface-container rounded-pill px-3 py-1 text-xs font-semibold tracking-wide uppercase text-on-surface">
                    {primarySample?.label ?? `${t.newForm.sampleChip} ${sampleLetter(i)}`}
                  </span>
                  <div className="flex-1" />
                  {coffees.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCoffee(coffee.id)}
                      aria-label={t.removeCoffee}
                      className="p-1 text-on-surface-variant hover:text-error transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FieldLabel required requiredText={t.newForm.required}>
                      {t.coffeeName}
                    </FieldLabel>
                    <input
                      className={inputCls}
                      value={coffee.name}
                      onChange={(e) => updateCoffee(coffee.id, "name", e.target.value)}
                      required
                      placeholder={t.coffeeName}
                    />
                  </div>

                  <div>
                    <FieldLabel required requiredText={t.newForm.required}>
                      {t.coffeeCountry}
                    </FieldLabel>
                    <input
                      list="cata-coffee-countries"
                      className={inputCls}
                      value={coffee.country}
                      onChange={(e) => updateCoffee(coffee.id, "country", e.target.value)}
                      required
                      placeholder={t.coffeeCountry}
                    />
                  </div>
                  <div>
                    <FieldLabel required requiredText={t.newForm.required}>
                      {t.coffeeVariety}
                    </FieldLabel>
                    <input
                      className={inputCls}
                      value={coffee.variety}
                      onChange={(e) => updateCoffee(coffee.id, "variety", e.target.value)}
                      required
                      placeholder={t.coffeeVariety}
                    />
                  </div>

                  <div>
                    <FieldLabel required requiredText={t.newForm.required}>
                      {t.coffeeAltitude}
                    </FieldLabel>
                    <div className="relative">
                      <input
                        className={inputCls + " pr-14"}
                        value={coffee.altitude}
                        onChange={(e) => updateCoffee(coffee.id, "altitude", e.target.value)}
                        required
                        placeholder="1800"
                      />
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant pointer-events-none">
                        msnm
                      </span>
                    </div>
                  </div>
                  <div>
                    <FieldLabel optionalText={t.newForm.optionalSuffix}>{t.coffeeRegion}</FieldLabel>
                    <input
                      className={inputCls}
                      value={coffee.region}
                      onChange={(e) => updateCoffee(coffee.id, "region", e.target.value)}
                      placeholder={t.coffeeRegion}
                    />
                  </div>

                  <div>
                    <FieldLabel optionalText={t.newForm.optionalSuffix}>{t.producerRoaster}</FieldLabel>
                    <input
                      className={inputCls}
                      value={coffee.producer}
                      onChange={(e) => updateCoffee(coffee.id, "producer", e.target.value)}
                      placeholder={t.producerRoaster}
                    />
                  </div>
                  <div>
                    <FieldLabel optionalText={t.newForm.optionalSuffix}>{t.coffeeRoastLevel}</FieldLabel>
                    <input
                      className={inputCls}
                      value={coffee.roastLevel}
                      onChange={(e) => updateCoffee(coffee.id, "roastLevel", e.target.value)}
                      placeholder={t.coffeeRoastLevel}
                    />
                  </div>
                </div>

                {extraSamples.length > 0 && (
                  <div className="space-y-2">
                    {extraSamples.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <input
                          value={s.label}
                          onChange={(e) => updateSampleLabel(s.id, e.target.value)}
                          className="flex-1 border border-outline-variant rounded-input px-2.5 py-1.5 text-xs bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => removeSample(s.id)}
                          aria-label={t.removeCoffee}
                          className="p-1 text-on-surface-variant hover:text-error transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => addSampleOfCoffee(coffee.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-container hover:text-primary transition-colors"
                >
                  {t.newForm.addSampleOfCoffee}
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addCoffee}
          className="border border-primary-container text-primary-container rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-fixed transition-colors"
        >
          + {t.addCoffee}
        </button>
      </div>

      <hr className="border-t border-outline-variant" />

      {/* 4. Group session */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isGroup}
            onClick={() => setIsGroup((v) => !v)}
            className={
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
              (isGroup ? "bg-primary-container" : "bg-outline-variant")
            }
          >
            <span
              className={
                "inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow-card transition-transform " +
                (isGroup ? "translate-x-5" : "translate-x-0.5")
              }
            />
          </button>
          <span className="text-sm text-on-surface font-medium">{t.groupToggle}</span>
        </div>

        {isGroup && (
          <div className="bg-surface-container-low rounded-card p-4">
            <FieldLabel>{t.groupClosesAt}</FieldLabel>
            <input
              type="date"
              className={inputCls}
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>
        )}
      </div>

      <hr className="border-t border-outline-variant" />

      {/* Error strip + submit */}
      <div className="space-y-4">
        {errorText && (
          <div className="bg-error-container text-on-error-container rounded-card px-4 py-3 text-sm">
            {errorText}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-primary-container text-on-primary rounded-pill py-3.5 font-medium hover:bg-primary transition-colors disabled:opacity-50"
        >
          {t.start}
        </button>
      </div>
    </form>
  );
}
