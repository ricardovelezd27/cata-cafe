"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCoffee, updateCoffee } from "@/app/actions/coffees";
import { PROCESS_TYPES, CERTIFICATIONS, ROAST_LEVELS } from "@/lib/constants";

type Visibility = "private" | "shared" | "public";

export type CoffeeFormTranslations = {
  // field labels (shared with the coffee profile "details grid")
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  species: string;
  variety: string;
  harvest: string;
  process: string;
  altitude: string;
  roastLevel: string;
  certifications: string;
  // newPage-scoped microcopy
  notes: string;
  notesPh: string;
  harvestPh: string;
  visibilityLabel: string;
  visibilityPrivate: string;
  visibilityPrivateHint: string;
  visibilityShared: string;
  visibilitySharedHint: string;
  visibilityPublic: string;
  visibilityPublicHint: string;
  create: string;
  creating: string;
  nameRequired: string;
  roastRequired: string;
  error: string;
};

export type CoffeeFormInitialValues = {
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  species: string;
  variety: string;
  harvestYear: string;
  processType: string;
  altitude: string;
  roastLevel: string;
  certifications: string[];
  notes: string;
};

const inputCls =
  "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5">
      {children}
      {required && (
        <span className="text-error" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </label>
  );
}

export function CoffeeForm({
  locale,
  translations: t,
  countries,
  mode = "create",
  coffeeId,
  initialValues,
  submitLabel,
  submittingLabel,
}: {
  locale: string;
  translations: CoffeeFormTranslations;
  countries: string[];
  /** "create" (default) posts createCoffee + shows visibility. "edit" posts updateCoffee(coffeeId, ...) and hides visibility — it has its own toggle on the detail page. */
  mode?: "create" | "edit";
  /** Required when mode="edit". */
  coffeeId?: string;
  /** Prefill values for edit mode. */
  initialValues?: CoffeeFormInitialValues;
  /** Overrides t.create / t.creating (edit mode uses coffee.saveChanges / coffee.savingChanges). */
  submitLabel?: string;
  submittingLabel?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isEdit = mode === "edit";

  const [name, setName] = useState(initialValues?.name ?? "");
  const [country, setCountry] = useState(initialValues?.country ?? "");
  const [region, setRegion] = useState(initialValues?.region ?? "");
  const [farm, setFarm] = useState(initialValues?.farm ?? "");
  const [producer, setProducer] = useState(initialValues?.producer ?? "");
  const [species, setSpecies] = useState(initialValues?.species ?? "");
  const [variety, setVariety] = useState(initialValues?.variety ?? "");
  const [harvestYear, setHarvestYear] = useState(initialValues?.harvestYear ?? "");
  const [processType, setProcessType] = useState(initialValues?.processType ?? "");
  const [altitude, setAltitude] = useState(initialValues?.altitude ?? "");
  const [roastLevel, setRoastLevel] = useState(initialValues?.roastLevel ?? "");
  const [certifications, setCertifications] = useState<string[]>(
    initialValues?.certifications ?? [],
  );
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [visibility, setVisibility] = useState<Visibility>("private");

  const [errorCode, setErrorCode] = useState<string | null>(null);

  const toggleCertification = (c: string) => {
    setCertifications((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode(null);

    if (!name.trim()) {
      setErrorCode("name_required");
      return;
    }
    if (!roastLevel.trim()) {
      setErrorCode("roast_required");
      return;
    }

    start(async () => {
      const fields = {
        name,
        country: country || undefined,
        region: region || undefined,
        farm: farm || undefined,
        producer: producer || undefined,
        species: species || undefined,
        variety: variety || undefined,
        harvestYear: harvestYear || undefined,
        processType: processType || undefined,
        altitude: altitude || undefined,
        roastLevel: roastLevel || undefined,
        certifications,
        notes: notes || undefined,
      };

      if (isEdit) {
        if (!coffeeId) return;
        const res = await updateCoffee(coffeeId, fields);
        if (res.ok) {
          router.push(`/${locale}/app/coffees/${coffeeId}`);
        } else {
          setErrorCode(res.error);
        }
        return;
      }

      const res = await createCoffee({ ...fields, visibility });
      if (res.ok) {
        router.push(`/${locale}/app/coffees/${res.coffeeId}`);
      } else {
        setErrorCode(res.error);
      }
    });
  };

  const errorText =
    errorCode === "name_required"
      ? t.nameRequired
      : errorCode === "roast_required"
        ? t.roastRequired
        : errorCode
          ? t.error
          : null;

  // Legacy coffees may hold free-text roast values from before the fixed
  // scale — keep the saved value selectable instead of silently dropping it.
  const roastOptions: string[] =
    initialValues?.roastLevel && !ROAST_LEVELS.includes(initialValues.roastLevel as (typeof ROAST_LEVELS)[number])
      ? [initialValues.roastLevel, ...ROAST_LEVELS]
      : [...ROAST_LEVELS];

  const visibilityOptions: {
    value: Visibility;
    label: string;
    hint: string;
  }[] = [
    { value: "private", label: t.visibilityPrivate, hint: t.visibilityPrivateHint },
    { value: "shared", label: t.visibilityShared, hint: t.visibilitySharedHint },
    { value: "public", label: t.visibilityPublic, hint: t.visibilityPublicHint },
  ];

  const resolvedSubmitLabel = submitLabel ?? t.create;
  const resolvedSubmittingLabel = submittingLabel ?? t.creating;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <datalist id="cata-coffee-form-countries">
        {countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Basic info */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5 space-y-4">
        <div>
          <FieldLabel required>{t.name}</FieldLabel>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.name}
            required
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <FieldLabel>{t.country}</FieldLabel>
            <input
              list="cata-coffee-form-countries"
              className={inputCls}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t.country}
            />
          </div>
          <div>
            <FieldLabel>{t.region}</FieldLabel>
            <input
              className={inputCls}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={t.region}
            />
          </div>
          <div>
            <FieldLabel>{t.farm}</FieldLabel>
            <input
              className={inputCls}
              value={farm}
              onChange={(e) => setFarm(e.target.value)}
              placeholder={t.farm}
            />
          </div>
          <div>
            <FieldLabel>{t.producer}</FieldLabel>
            <input
              className={inputCls}
              value={producer}
              onChange={(e) => setProducer(e.target.value)}
              placeholder={t.producer}
            />
          </div>
          <div>
            <FieldLabel>{t.species}</FieldLabel>
            <input
              className={inputCls}
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              placeholder={t.species}
            />
          </div>
          <div>
            <FieldLabel>{t.variety}</FieldLabel>
            <input
              className={inputCls}
              value={variety}
              onChange={(e) => setVariety(e.target.value)}
              placeholder={t.variety}
            />
          </div>
          <div>
            <FieldLabel>{t.harvest}</FieldLabel>
            <input
              className={inputCls}
              value={harvestYear}
              onChange={(e) => setHarvestYear(e.target.value)}
              placeholder={t.harvestPh}
            />
          </div>
          <div>
            <FieldLabel>{t.process}</FieldLabel>
            <select
              className={inputCls + " cursor-pointer"}
              value={processType}
              onChange={(e) => setProcessType(e.target.value)}
            >
              <option value="">—</option>
              {PROCESS_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {pt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>{t.altitude}</FieldLabel>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={6000}
              className={inputCls}
              value={altitude}
              onChange={(e) => setAltitude(e.target.value)}
              placeholder="1800"
            />
          </div>
          <div>
            <FieldLabel required>{t.roastLevel}</FieldLabel>
            <select
              className={inputCls + " cursor-pointer"}
              value={roastLevel}
              onChange={(e) => setRoastLevel(e.target.value)}
              required
            >
              <option value="">—</option>
              {roastOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Certifications */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5 space-y-3">
        <FieldLabel>{t.certifications}</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {CERTIFICATIONS.map((c) => {
            const active = certifications.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggleCertification(c)}
                className={
                  active
                    ? "bg-primary-container text-on-primary rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors"
                    : "border border-outline-variant text-on-surface rounded-pill px-3.5 py-1.5 text-xs font-medium hover:bg-surface-container transition-colors"
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5 space-y-1.5">
        <FieldLabel>{t.notes}</FieldLabel>
        <textarea
          className={inputCls + " min-h-[88px]"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.notesPh}
        />
      </div>

      {/* Visibility — create only; edit has its own toggle on the detail page */}
      {!isEdit && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-card p-5 space-y-3">
          <FieldLabel>{t.visibilityLabel}</FieldLabel>
          <div className="grid sm:grid-cols-3 gap-3">
            {visibilityOptions.map((opt) => {
              const active = visibility === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setVisibility(opt.value)}
                  className={
                    "text-left rounded-card border p-3.5 transition-colors " +
                    (active
                      ? "border-primary-container bg-primary-fixed"
                      : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container")
                  }
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 " +
                        (active ? "border-primary-container" : "border-outline-variant")
                      }
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-primary-container" />}
                    </span>
                    <span className="text-sm font-semibold text-on-surface">{opt.label}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-1.5">{opt.hint}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error + submit */}
      <div className="space-y-4">
        {errorText && (
          <div className="bg-error-container text-on-error-container rounded-card px-4 py-3 text-sm">
            {errorText}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-primary-container text-on-primary rounded-pill py-3.5 font-semibold hover:bg-primary transition-colors disabled:opacity-50"
        >
          {pending ? resolvedSubmittingLabel : resolvedSubmitLabel}
        </button>
      </div>
    </form>
  );
}
