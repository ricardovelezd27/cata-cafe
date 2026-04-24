"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSession, createGroupSession } from "@/app/actions/sessions";

type Translations = {
  title: string;
  name: string;
  namePh: string;
  date: string;
  objective: string;
  objectivePh: string;
  format: string;
  cups: string;
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
  groupAsync: string;
  groupClosesAt: string;
  groupInviteLink: string;
  groupCopyLink: string;
  groupCopied: string;
  groupStartCupping: string;
};

type WizardStep = "form" | "invite";

export function NewSessionForm({ locale, t }: { locale: string; t: Translations }) {
  const router = useRouter();

  // Form fields
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [objective, setObjective] = useState("");
  const [format, setFormat] = useState<"descriptive" | "affective" | "combined">("combined");
  const [cupsPerSample, setCupsPerSample] = useState(5);
  const [samples, setSamples] = useState<string[]>(["Muestra A", "Muestra B", "Muestra C"]);

  // Group session fields
  const [isGroup, setIsGroup] = useState(false);
  const [isAsync, setIsAsync] = useState(false);
  const [closesAt, setClosesAt] = useState("");

  // Wizard state
  const [step, setStep] = useState<WizardStep>("form");
  const [inviteToken, setInviteToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [copied, setCopied] = useState(false);

  const [pending, start] = useTransition();

  const updateSample = (i: number, val: string) => {
    setSamples((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      if (!isGroup) {
        // Solo session — server action handles redirect
        await createSession({
          name,
          date,
          objective: objective || undefined,
          format,
          cupsPerSample,
          samples: samples.map((label) => ({ label })),
          locale,
        });
      } else {
        // Group session — receive token and show invite step
        const result = await createGroupSession({
          name,
          date,
          objective: objective || undefined,
          format,
          cupsPerSample,
          samples: samples.map((label) => ({ label })),
          isAsync,
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
          onClick={() => router.push(`/${locale}/app/sessions/${sessionId}/cup`)}
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

      {/* Group-only fields */}
      {isGroup && (
        <div className="pl-4 border-l-2 border-green-dark/30 space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={isAsync}
              onClick={() => setIsAsync((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                isAsync ? "bg-green-dark" : "bg-[#D4C5A9]"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  isAsync ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span className="text-sm text-brown-dark font-medium">{t.groupAsync}</span>
          </div>

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

      <div>
        <label className={labelCls}>{t.samples}</label>
        <div className="space-y-2">
          {samples.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input
                className={inputCls}
                value={s}
                onChange={(e) => updateSample(i, e.target.value)}
                placeholder={`${t.sampleLabel} ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => setSamples((prev) => prev.filter((_, idx) => idx !== i))}
                className="px-3 py-2 text-xs text-brown-mid hover:text-red-defect"
              >
                {t.removeSample}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSamples((prev) => [...prev, `Muestra ${prev.length + 1}`])}
            className="text-sm text-green-dark font-semibold"
          >
            + {t.addSample}
          </button>
        </div>
      </div>

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
