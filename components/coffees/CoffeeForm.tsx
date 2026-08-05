"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCoffee } from "@/app/actions/coffees";
import { PROCESS_TYPES, CERTIFICATIONS } from "@/lib/constants";

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
  error: string;
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
    <label className="block text-[11px] font-semibold uppercase tracking-widest text-brown-mid mb-1.5">
      {children}
      {required && (
        <span className="text-red-defect" aria-hidden="true">
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
}: {
  locale: string;
  translations: CoffeeFormTranslations;
  countries: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [farm, setFarm] = useState("");
  const [producer, setProducer] = useState("");
  const [variety, setVariety] = useState("");
  const [harvestYear, setHarvestYear] = useState("");
  const [processType, setProcessType] = useState("");
  const [altitude, setAltitude] = useState("");
  const [roastLevel, setRoastLevel] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
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

    start(async () => {
      const res = await createCoffee({
        name,
        country: country || undefined,
        region: region || undefined,
        farm: farm || undefined,
        producer: producer || undefined,
        variety: variety || undefined,
        harvestYear: harvestYear || undefined,
        processType: processType || undefined,
        altitude: altitude || undefined,
        roastLevel: roastLevel || undefined,
        certifications,
        notes: notes || undefined,
        visibility,
      });

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
      : errorCode
        ? t.error
        : null;

  const visibilityOptions: {
    value: Visibility;
    label: string;
    hint: string;
  }[] = [
    { value: "private", label: t.visibilityPrivate, hint: t.visibilityPrivateHint },
    { value: "shared", label: t.visibilityShared, hint: t.visibilitySharedHint },
    { value: "public", label: t.visibilityPublic, hint: t.visibilityPublicHint },
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <datalist id="cata-coffee-form-countries">
        {countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Basic info */}
      <div className="bg-white border border-[#E8E0D0] rounded-card p-5 space-y-4">
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
              className={inputCls}
              value={altitude}
              onChange={(e) => setAltitude(e.target.value)}
              placeholder={t.altitude}
            />
          </div>
          <div>
            <FieldLabel>{t.roastLevel}</FieldLabel>
            <input
              className={inputCls}
              value={roastLevel}
              onChange={(e) => setRoastLevel(e.target.value)}
              placeholder={t.roastLevel}
            />
          </div>
        </div>
      </div>

      {/* Certifications */}
      <div className="bg-white border border-[#E8E0D0] rounded-card p-5 space-y-3">
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
                    ? "bg-green-dark text-white rounded-pill px-3.5 py-1.5 text-xs font-semibold transition-colors"
                    : "border border-brown-light text-brown-dark rounded-pill px-3.5 py-1.5 text-xs font-medium hover:bg-cream transition-colors"
                }
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white border border-[#E8E0D0] rounded-card p-5 space-y-1.5">
        <FieldLabel>{t.notes}</FieldLabel>
        <textarea
          className={inputCls + " min-h-[88px]"}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t.notesPh}
        />
      </div>

      {/* Visibility */}
      <div className="bg-white border border-[#E8E0D0] rounded-card p-5 space-y-3">
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
                    ? "border-green-dark bg-green-dark/5"
                    : "border-brown-light bg-white hover:bg-cream")
                }
              >
                <div className="flex items-center gap-2">
                  <span
                    className={
                      "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 " +
                      (active ? "border-green-dark" : "border-brown-light")
                    }
                  >
                    {active && <span className="h-2 w-2 rounded-full bg-green-dark" />}
                  </span>
                  <span className="text-sm font-semibold text-brown-dark">{opt.label}</span>
                </div>
                <p className="text-xs text-brown-mid mt-1.5">{opt.hint}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Error + submit */}
      <div className="space-y-4">
        {errorText && (
          <div className="bg-red-defect/10 text-red-defect rounded-card px-4 py-3 text-sm">
            {errorText}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full bg-green-dark text-white rounded-pill py-3.5 font-semibold hover:bg-green-dark/90 transition-colors disabled:opacity-50"
        >
          {pending ? t.creating : t.create}
        </button>
      </div>
    </form>
  );
}
