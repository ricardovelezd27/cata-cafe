"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

type SampleEntry = {
  label: string;
  coffeeIdx: number;
};

type Translations = {
  title: string;
  name: string;
  namePh: string;
  date: string;
  objective: string;
  objectivePh: string;
  format: string;
  cups: string;
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
  sampleCoffee: string;
  // samples
  samples: string;
  addSample: string;
  removeSample: string;
  sampleLabel: string;
  start: string;
  formatDescriptive: string;
  formatAffective: string;
  formatCombined: string;
  // group
  groupToggle: string;
  groupClosesAt: string;
  groupInviteLink: string;
  groupCopyLink: string;
  groupCopied: string;
  groupStartCupping: string;
};

type WizardStep = "form" | "invite";

const EMPTY_COFFEE: CoffeeInput = {
  name: "",
  producer: "",
  variety: "",
  altitude: "",
  roastLevel: "",
  country: "",
  region: "",
};

export function NewSessionForm({ locale, t }: { locale: string; t: Translations }) {
  const router = useRouter();

  // Form fields
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [objective, setObjective] = useState("");
  const [format, setFormat] = useState<"descriptive" | "affective" | "combined">("combined");
  const [cupsPerSample, setCupsPerSample] = useState(5);

  // Coffee entries
  const [coffees, setCoffees] = useState<CoffeeInput[]>([{ ...EMPTY_COFFEE }]);

  // Sample entries (each maps to a coffee by index)
  const [samples, setSamples] = useState<SampleEntry[]>([
    { label: "Muestra A", coffeeIdx: 0 },
    { label: "Muestra B", coffeeIdx: 0 },
    { label: "Muestra C", coffeeIdx: 0 },
  ]);

  // Group session fields
  const [isGroup, setIsGroup] = useState(false);
  const [closesAt, setClosesAt] = useState("");

  // Wizard state
  const [step, setStep] = useState<WizardStep>("form");
  const [inviteToken, setInviteToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [copied, setCopied] = useState(false);

  const [pending, start] = useTransition();

  // Coffee helpers
  const updateCoffee = (i: number, field: keyof CoffeeInput, val: string) =>
    setCoffees((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: val } : c)));

  const addCoffee = () => setCoffees((prev) => [...prev, { ...EMPTY_COFFEE }]);

  const removeCoffee = (i: number) => {
    setCoffees((prev) => prev.filter((_, idx) => idx !== i));
    // Remap sample coffeeIdx: clamp to new last index
    setSamples((prev) =>
      prev.map((s) => ({
        ...s,
        coffeeIdx: s.coffeeIdx >= i && s.coffeeIdx > 0 ? s.coffeeIdx - 1 : s.coffeeIdx,
      }))
    );
  };

  // Sample helpers
  const updateSampleLabel = (i: number, val: string) =>
    setSamples((prev) => prev.map((s, idx) => (idx === i ? { ...s, label: val } : s)));

  const updateSampleCoffee = (i: number, coffeeIdx: number) =>
    setSamples((prev) => prev.map((s, idx) => (idx === i ? { ...s, coffeeIdx } : s)));

  const addSample = () =>
    setSamples((prev) => [...prev, { label: `Muestra ${prev.length + 1}`, coffeeIdx: 0 }]);

  const removeSample = (i: number) =>
    setSamples((prev) => prev.filter((_, idx) => idx !== i));

  const getCoffeeLabel = (i: number) =>
    coffees[i]?.name.trim() || `Café ${i + 1}`;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const coffeePayload = coffees.filter((c) => c.name.trim());
      const samplePayload = samples.map((s) => ({
        label: s.label,
        coffeeIdx: s.coffeeIdx,
      }));

      if (!isGroup) {
        await createSession({
          name,
          date,
          objective: objective || undefined,
          format,
          cupsPerSample,
          coffees: coffeePayload,
          samples: samplePayload,
          locale,
        });
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
        setSessionId(result.sessionId);
        setInviteToken(result.inviteToken);
        setStep("invite");
      }
    });
  };

  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${locale}/join/${inviteToken}`
      : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const inputCls =
    "w-full px-3 py-2 border border-[#D4C5A9] rounded-lg text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark";
  const labelCls = "block text-xs text-brown-mid font-semibold uppercase tracking-wide mb-1";
  const smallInputCls =
    "w-full px-2 py-1.5 border border-[#D4C5A9] rounded-md text-xs bg-white text-brown-dark focus:outline-none focus:border-green-dark";

  // ── Step 2: Invite link ──────────────────────────────────────────────────────
  if (step === "invite") {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-green-dark/5 border border-green-dark/20 rounded-xl space-y-3">
          <p className="text-sm font-semibold text-green-dark">{t.groupInviteLink}</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={inviteUrl}
              className={inputCls + " flex-1 text-xs select-all"}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="px-4 py-2 rounded-lg bg-green-dark text-white text-sm font-semibold whitespace-nowrap"
            >
              {copied ? t.groupCopied : t.groupCopyLink}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            start(async () => {
              await startSession(sessionId);
              router.push(`/${locale}/app/sessions/${sessionId}/cup`);
            });
          }}
          className="w-full py-3 rounded-lg bg-green-dark text-white font-bold hover:bg-green-mid"
        >
          {t.groupStartCupping}
        </button>
      </div>
    );
  }

  // ── Step 1: Session form ─────────────────────────────────────────────────────
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className={labelCls}>{t.name}</label>
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
          <label className={labelCls}>{t.date}</label>
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>{t.cups}</label>
          <input
            type="number"
            min={1}
            max={5}
            className={inputCls}
            value={cupsPerSample}
            onChange={(e) => setCupsPerSample(parseInt(e.target.value) || 5)}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>{t.objective}</label>
        <textarea
          className={inputCls + " min-h-[60px]"}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder={t.objectivePh}
        />
      </div>

      <div>
        <label className={labelCls}>{t.format}</label>
        <div className="flex gap-2">
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
              className={`px-4 py-2 rounded-lg text-sm border ${
                format === opt.v
                  ? "bg-green-dark text-white border-green-dark"
                  : "bg-white text-brown-dark border-[#D4C5A9]"
              }`}
            >
              {opt.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Coffees to evaluate ─────────────────────────────────────────────── */}
      <div>
        <label className={labelCls}>{t.coffees}</label>
        <div className="space-y-3">
          {coffees.map((coffee, i) => (
            <div
              key={i}
              className="p-3 border border-[#D4C5A9] rounded-xl bg-white/60 space-y-2"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-green-dark uppercase tracking-wide">
                  {getCoffeeLabel(i)}
                </span>
                {coffees.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeCoffee(i)}
                    className="text-xs text-brown-mid hover:text-red-defect"
                  >
                    {t.removeCoffee}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] text-brown-mid mb-0.5">{t.coffeeName} *</label>
                  <input
                    className={smallInputCls}
                    value={coffee.name}
                    onChange={(e) => updateCoffee(i, "name", e.target.value)}
                    required
                    placeholder={t.coffeeName}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brown-mid mb-0.5">{t.producerRoaster}</label>
                  <input
                    className={smallInputCls}
                    value={coffee.producer}
                    onChange={(e) => updateCoffee(i, "producer", e.target.value)}
                    placeholder={t.producerRoaster}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brown-mid mb-0.5">{t.coffeeVariety}</label>
                  <input
                    className={smallInputCls}
                    value={coffee.variety}
                    onChange={(e) => updateCoffee(i, "variety", e.target.value)}
                    placeholder={t.coffeeVariety}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brown-mid mb-0.5">{t.coffeeCountry}</label>
                  <input
                    className={smallInputCls}
                    value={coffee.country}
                    onChange={(e) => updateCoffee(i, "country", e.target.value)}
                    placeholder={t.coffeeCountry}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brown-mid mb-0.5">{t.coffeeRegion}</label>
                  <input
                    className={smallInputCls}
                    value={coffee.region}
                    onChange={(e) => updateCoffee(i, "region", e.target.value)}
                    placeholder={t.coffeeRegion}
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brown-mid mb-0.5">{t.coffeeAltitude}</label>
                  <input
                    className={smallInputCls}
                    value={coffee.altitude}
                    onChange={(e) => updateCoffee(i, "altitude", e.target.value)}
                    placeholder="1800 msnm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-brown-mid mb-0.5">{t.coffeeRoastLevel}</label>
                  <input
                    className={smallInputCls}
                    value={coffee.roastLevel}
                    onChange={(e) => updateCoffee(i, "roastLevel", e.target.value)}
                    placeholder="Medio"
                  />
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addCoffee}
            className="text-sm text-green-dark font-semibold"
          >
            + {t.addCoffee}
          </button>
        </div>
      </div>

      {/* ── Samples ──────────────────────────────────────────────────────────── */}
      <div>
        <label className={labelCls}>{t.samples}</label>
        <div className="space-y-2">
          {samples.map((s, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className={inputCls + " flex-1"}
                value={s.label}
                onChange={(e) => updateSampleLabel(i, e.target.value)}
                placeholder={`${t.sampleLabel} ${i + 1}`}
              />
              {coffees.length > 1 && (
                <select
                  className="px-2 py-2 border border-[#D4C5A9] rounded-lg text-xs bg-white text-brown-dark focus:outline-none focus:border-green-dark"
                  value={s.coffeeIdx}
                  onChange={(e) => updateSampleCoffee(i, parseInt(e.target.value))}
                  title={t.sampleCoffee}
                >
                  {coffees.map((c, ci) => (
                    <option key={ci} value={ci}>
                      {getCoffeeLabel(ci)}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => removeSample(i)}
                className="px-3 py-2 text-xs text-brown-mid hover:text-red-defect whitespace-nowrap"
              >
                {t.removeSample}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addSample}
            className="text-sm text-green-dark font-semibold"
          >
            + {t.addSample}
          </button>
        </div>
      </div>

      {/* Group session toggle */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          role="switch"
          aria-checked={isGroup}
          onClick={() => setIsGroup((v) => !v)}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
            isGroup ? "bg-green-dark" : "bg-[#D4C5A9]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              isGroup ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <span className="text-sm text-brown-dark font-medium">{t.groupToggle}</span>
      </div>

      {/* Group-only fields — just closing date, async is derived */}
      {isGroup && (
        <div className="pl-4 border-l-2 border-green-dark/30 space-y-4">
          <div>
            <label className={labelCls}>{t.groupClosesAt}</label>
            <input
              type="date"
              className={inputCls}
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || samples.length === 0}
        className="w-full py-3 rounded-lg bg-green-dark text-white font-bold hover:bg-green-mid disabled:opacity-50"
      >
        {t.start}
      </button>
    </form>
  );
}
