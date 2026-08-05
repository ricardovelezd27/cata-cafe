"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { createSession, createGroupSession } from "@/app/actions/sessions";
import { startSession } from "@/app/actions/community";
import type { GroupEmailSummary } from "@/app/actions/groups";
import { NotifyGroupPanel, type NotifyGroupOption, type NotifyGroupTranslations } from "@/components/groups/NotifyGroupPanel";
import { InviteQR } from "@/components/ui/InviteQR";
import { buildInviteUrl } from "@/lib/inviteUrl";
import { CoffeePicker, type UsableCoffee } from "@/components/coffees/CoffeePicker";

// Groups v2: session wizard extends NotifyGroupTranslations with the
// step-1 "link a group" selector copy + the step-2 auto-invite success
// strip template. Kept local (not exported from components/groups/*) since
// this file owns the wizard's translation shape.
type SessionGroupsTranslations = NotifyGroupTranslations & {
  linkGroupLabel: string;
  noGroupOption: string;
  autoInviteToggle: string;
  // Raw ICU template — interpolated locally via formatTemplate, not t().
  autoInviteSummary: string;
};

// Same tiny interpolation helper as components/groups/NotifyGroupPanel.tsx.
function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

type CoffeeInput = {
  name: string;
  producer: string;
  variety: string;
  altitude: string;
  roastLevel: string;
  country: string;
  region: string;
};

type CoffeeEntry = CoffeeInput & {
  id: string;
  existingCoffeeId?: string;
  /** Origin badge of the linked coffee — display-only, never submitted. */
  linkedOrigin?: UsableCoffee["origin"];
};

type SampleEntry = {
  id: string;
  label: string;
  coffeeId: string;
  /** True while the label is still the auto-generated "Muestra X" text (not user-edited). */
  auto: boolean;
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
  // samples section
  addSample: string;
  removeSample: string;
  sampleLabel: string;
  sampleCoffee: string;
  start: string;
  // group
  groupToggle: string;
  groupClosesAt: string;
  groupInviteLink: string;
  groupCopyLink: string;
  groupCopied: string;
  groupCopyImage: string;
  groupDownloadQr: string;
  groupStartCupping: string;
  // new form microcopy
  newForm: {
    required: string;
    optionalSuffix: string;
    coffeeCard: string;
    sampleChip: string;
    samplesTitle: string;
    samplesHelper: string;
    errors: {
      no_samples: string;
      no_coffees: string;
      missing_coffee_fields: string;
      sample_without_coffee: string;
      generic: string;
      coffee_not_found: string;
    };
  };
  picker: {
    useExisting: string;
    title: string;
    searchPlaceholder: string;
    mine: string;
    shared: string;
    public: string;
    empty: string;
    linked: string;
    unlink: string;
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

/** Recomputes A, B, C… labels by list position; leaves user-edited labels untouched. */
function relabel(samples: SampleEntry[], chip: string): SampleEntry[] {
  return samples.map((s, i) => (s.auto ? { ...s, label: `${chip} ${sampleLetter(i)}` } : s));
}

const inputCls =
  "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

/** Origin badge colors mirror CoffeePicker's own badges. */
const originBadgeCls: Record<UsableCoffee["origin"], string> = {
  mine: "bg-green-dark/10 text-green-dark border-green-dark/30",
  shared: "bg-amber-warm/15 text-brown-dark border-amber-warm/40",
  public: "bg-cream text-brown-mid border-brown-light",
};

function originBadgeLabel(origin: UsableCoffee["origin"], t: Translations): string {
  return origin === "mine" ? t.picker.mine : origin === "shared" ? t.picker.shared : t.picker.public;
}

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
  groupsT,
  groups,
  usableCoffees,
}: {
  locale: string;
  t: Translations;
  countries: string[];
  groupsT: SessionGroupsTranslations;
  groups: NotifyGroupOption[];
  usableCoffees: UsableCoffee[];
}) {
  const router = useRouter();

  // Session basics
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [objective, setObjective] = useState("");
  const [format, setFormat] = useState<"descriptive" | "affective" | "combined">("combined");
  const [cupsPerSample, setCupsPerSample] = useState(2);
  const [cupsInput, setCupsInput] = useState("2");

  const [coffees, setCoffees] = useState<CoffeeEntry[]>(() => [{ ...EMPTY_COFFEE, id: newId() }]);
  const [samples, setSamples] = useState<SampleEntry[]>(() => [
    {
      id: newId(),
      label: `${t.newForm.sampleChip} ${sampleLetter(0)}`,
      coffeeId: coffees[0].id,
      auto: true,
    },
  ]);

  // Group session fields
  const [isGroup, setIsGroup] = useState(false);
  const [closesAt, setClosesAt] = useState("");
  const [linkedGroupId, setLinkedGroupId] = useState("");
  const [notifyGroup, setNotifyGroup] = useState(true);
  const [emailSummary, setEmailSummary] = useState<GroupEmailSummary | undefined>(undefined);

  // Client-side validation state
  const [invalidCoffeeId, setInvalidCoffeeId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Coffee picker — targets a single CoffeeEntry card at a time.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

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

  const applyExistingCoffee = (id: string, picked: UsableCoffee) => {
    setCoffees((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              name: picked.name,
              producer: picked.producer ?? "",
              variety: picked.variety ?? "",
              altitude: picked.altitude ?? "",
              roastLevel: picked.roastLevel ?? "",
              country: picked.country ?? "",
              region: picked.region ?? "",
              existingCoffeeId: picked.id,
              linkedOrigin: picked.origin,
            }
          : c
      )
    );
    if (invalidCoffeeId === id) {
      setInvalidCoffeeId(null);
      setErrorCode(null);
    }
    setPickerFor(null);
  };

  const unlinkCoffee = (id: string) => {
    setCoffees((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, existingCoffeeId: undefined, linkedOrigin: undefined } : c
      )
    );
  };

  const addCoffee = () => {
    // Adding a coffee also seeds one sample assigned to it (the common 1:1 case
    // needs zero extra clicks); the sample lives in the flat Muestras list where
    // its label and coffee can be freely edited afterward.
    const coffeeId = newId();
    setCoffees((prev) => [...prev, { ...EMPTY_COFFEE, id: coffeeId }]);
    setSamples((prev) =>
      relabel([...prev, { id: newId(), label: "", coffeeId, auto: true }], t.newForm.sampleChip)
    );
  };

  const removeCoffee = (id: string) => {
    if (coffees.length <= 1) return;
    const nextCoffees = coffees.filter((c) => c.id !== id);
    // Drop samples that pointed at the removed coffee; never leave the list empty.
    let nextSamples = samples.filter((s) => s.coffeeId !== id);
    if (nextSamples.length === 0) {
      nextSamples = [{ id: newId(), label: "", coffeeId: nextCoffees[0].id, auto: true }];
    }
    setCoffees(nextCoffees);
    setSamples(relabel(nextSamples, t.newForm.sampleChip));
    if (invalidCoffeeId === id) {
      setInvalidCoffeeId(null);
      setErrorCode(null);
    }
  };

  const addSample = () => {
    setSamples((prev) =>
      relabel(
        [...prev, { id: newId(), label: "", coffeeId: coffees[0].id, auto: true }],
        t.newForm.sampleChip
      )
    );
  };

  const removeSample = (id: string) => {
    if (samples.length <= 1) return;
    setSamples((prev) => relabel(prev.filter((s) => s.id !== id), t.newForm.sampleChip));
  };

  const updateSampleLabel = (id: string, value: string) => {
    setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, label: value, auto: false } : s)));
  };

  const updateSampleCoffee = (id: string, coffeeId: string) => {
    setSamples((prev) => prev.map((s) => (s.id === id ? { ...s, coffeeId } : s)));
    setErrorCode(null);
  };

  const coffeeLabel = (coffee: CoffeeEntry, i: number) =>
    coffee.name.trim() || `${t.newForm.coffeeCard} ${i + 1}`;

  // ── Submit ──────────────────────────────────────────────────────────────────
  const validateClient = (): boolean => {
    for (const c of coffees) {
      if (c.existingCoffeeId) continue;
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

    const idxById = new Map(coffees.map((c, i) => [c.id, i]));
    const coffeePayload = coffees.map((c) => {
      const { id, linkedOrigin, existingCoffeeId, ...rest } = c;
      void id;
      void linkedOrigin;
      return existingCoffeeId ? { ...rest, existingCoffeeId } : rest;
    });
    const samplePayload = samples.map((s) => ({
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
          groupId: linkedGroupId || undefined,
          notifyGroup,
        });
        if (result.ok) {
          setSessionId(result.sessionId);
          setInviteToken(result.inviteToken);
          setEmailSummary(result.emailSummary);
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
    typeof window !== "undefined" ? buildInviteUrl(window.location.origin, locale, inviteToken) : "";

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
          {inviteUrl && (
            <div className="flex justify-center py-1">
              <InviteQR
                url={inviteUrl}
                labels={{
                  copyImage: t.groupCopyImage,
                  download: t.groupDownloadQr,
                  copied: t.groupCopied,
                }}
              />
            </div>
          )}
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

        {emailSummary && (
          <div className="bg-primary-fixed border border-primary-container/40 rounded-card px-4 py-3 text-sm text-primary-container font-medium">
            {formatTemplate(groupsT.autoInviteSummary, {
              sent: emailSummary.sent,
              skipped: emailSummary.skipped,
              failed: emailSummary.failed,
            })}
          </div>
        )}

        <NotifyGroupPanel
          groups={groups}
          sessionId={sessionId}
          defaultSubject={name}
          t={groupsT}
        />

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
              value={cupsInput}
              onChange={(e) => {
                const raw = e.target.value;
                setCupsInput(raw);
                const n = parseInt(raw, 10);
                if (!Number.isNaN(n) && n >= 1 && n <= 5) {
                  setCupsPerSample(n);
                }
              }}
              onBlur={() => {
                const n = parseInt(cupsInput, 10);
                const clamped = Number.isNaN(n) ? 2 : Math.min(5, Math.max(1, n));
                setCupsPerSample(clamped);
                setCupsInput(String(clamped));
              }}
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
                    {t.newForm.coffeeCard} {i + 1}
                  </span>
                  <div className="flex-1" />
                  {usableCoffees.length > 0 && !coffee.existingCoffeeId && (
                    <button
                      type="button"
                      onClick={() => setPickerFor(coffee.id)}
                      className="rounded-pill border border-primary-container px-3 py-1 text-xs font-medium text-primary-container hover:bg-primary-fixed transition-colors"
                    >
                      {t.picker.useExisting}
                    </button>
                  )}
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

                {coffee.existingCoffeeId ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
                      {t.picker.linked}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-on-surface">{coffee.name}</span>
                      {coffee.linkedOrigin && (
                        <span
                          className={`rounded-pill border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            originBadgeCls[coffee.linkedOrigin]
                          }`}
                        >
                          {originBadgeLabel(coffee.linkedOrigin, t)}
                        </span>
                      )}
                    </div>
                    {[coffee.country, coffee.region, coffee.variety, coffee.altitude]
                      .filter(Boolean)
                      .join(" · ") && (
                      <p className="text-xs text-on-surface-variant">
                        {[coffee.country, coffee.region, coffee.variety, coffee.altitude]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => unlinkCoffee(coffee.id)}
                      className="rounded-pill border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container transition-colors"
                    >
                      {t.picker.unlink}
                    </button>
                  </div>
                ) : (
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
                )}
              </div>
            );
          })}
        </div>

        <CoffeePicker
          open={pickerFor !== null}
          onOpenChange={(o) => !o && setPickerFor(null)}
          coffees={usableCoffees}
          onSelect={(picked) => {
            if (pickerFor) applyExistingCoffee(pickerFor, picked);
          }}
          translations={{
            title: t.picker.title,
            searchPlaceholder: t.picker.searchPlaceholder,
            mine: t.picker.mine,
            shared: t.picker.shared,
            public: t.picker.public,
            empty: t.picker.empty,
          }}
        />

        <button
          type="button"
          onClick={addCoffee}
          className="border border-primary-container text-primary-container rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-fixed transition-colors"
        >
          + {t.addCoffee}
        </button>
      </div>

      <hr className="border-t border-outline-variant" />

      {/* 4. Muestras — flat list: each sample has an editable label + coffee assignment */}
      <div className="space-y-4">
        <div>
          <FieldLabel>{t.newForm.samplesTitle}</FieldLabel>
          <p className="text-xs text-on-surface-variant">{t.newForm.samplesHelper}</p>
        </div>

        <div className="space-y-2">
          {samples.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                value={s.label}
                onChange={(e) => updateSampleLabel(s.id, e.target.value)}
                aria-label={t.sampleLabel}
                placeholder={t.sampleLabel}
                className={inputCls + " flex-1"}
              />
              {coffees.length > 1 && (
                <select
                  value={s.coffeeId}
                  onChange={(e) => updateSampleCoffee(s.id, e.target.value)}
                  aria-label={t.sampleCoffee}
                  className={inputCls + " flex-1 cursor-pointer"}
                >
                  {coffees.map((c, ci) => (
                    <option key={c.id} value={c.id}>
                      {coffeeLabel(c, ci)}
                    </option>
                  ))}
                </select>
              )}
              {samples.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSample(s.id)}
                  aria-label={t.removeSample}
                  className="p-1 text-on-surface-variant hover:text-error transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addSample}
          className="border border-primary-container text-primary-container rounded-pill px-5 py-2.5 text-sm font-medium hover:bg-primary-fixed transition-colors"
        >
          + {t.addSample}
        </button>
      </div>

      <hr className="border-t border-outline-variant" />

      {/* 5. Group session */}
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
          <div className="bg-surface-container-low rounded-card p-4 space-y-4">
            <div>
              <FieldLabel>{t.groupClosesAt}</FieldLabel>
              <input
                type="date"
                className={inputCls}
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
              />
            </div>

            <div>
              <FieldLabel>{groupsT.linkGroupLabel}</FieldLabel>
              <select
                value={linkedGroupId}
                onChange={(e) => setLinkedGroupId(e.target.value)}
                className={inputCls + " cursor-pointer"}
              >
                <option value="">{groupsT.noGroupOption}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.memberCount}
                  </option>
                ))}
              </select>
            </div>

            {linkedGroupId && (
              <label className="flex items-center gap-2.5 text-sm text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyGroup}
                  onChange={(e) => setNotifyGroup(e.target.checked)}
                  className="h-4 w-4 rounded accent-primary-container cursor-pointer"
                />
                {groupsT.autoInviteToggle}
              </label>
            )}
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
