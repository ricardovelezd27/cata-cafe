"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  updateSession,
  addSessionSample,
  renameSessionSample,
  removeSessionSample,
} from "@/app/actions/sessions";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export type EditSessionFormTranslations = {
  name: string;
  namePh: string;
  date: string;
  objective: string;
  objectivePh: string;
  format: string;
  cups: string;
  formats: { descriptive: string; affective: string; combined: string };
  formatLocked: string;
  linkedGroup: string;
  noGroup: string;
  samplesTitle: string;
  addSample: string;
  sampleLabel: string;
  sampleHasEvals: string;
  removeSampleTitle: string;
  /** Raw ICU string (t.raw()) — contains a literal "{label}" token. */
  removeSampleBody: string;
  removeSample: string;
  cancel: string;
  close: string;
  save: string;
  saving: string;
  saved: string;
  error: string;
};

export type EditSampleRow = { id: string; label: string; evalCount: number };
export type EditGroupOption = { id: string; name: string };

const inputCls =
  "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const cardCls = "bg-surface-container-lowest border border-outline-variant rounded-card p-5 space-y-4";

const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1.5";

const FORMAT_OPTIONS = ["descriptive", "affective", "combined"] as const;

export function EditSessionForm({
  locale,
  sessionId,
  initial,
  samples: initialSamples,
  groups,
  evalCount,
  translations: t,
}: {
  locale: string;
  sessionId: string;
  initial: {
    name: string;
    date: string;
    objective: string;
    format: "descriptive" | "affective" | "combined";
    cupsPerSample: number;
    isGroup: boolean;
    groupId: string | null;
  };
  samples: EditSampleRow[];
  groups: EditGroupOption[];
  evalCount: number;
  translations: EditSessionFormTranslations;
}) {
  const router = useRouter();
  const locked = evalCount > 0;

  const [name, setName] = useState(initial.name);
  const [date, setDate] = useState(initial.date);
  const [objective, setObjective] = useState(initial.objective);
  const [format, setFormat] = useState<"descriptive" | "affective" | "combined">(initial.format);
  const [cupsInput, setCupsInput] = useState(String(initial.cupsPerSample));
  const [groupId, setGroupId] = useState(initial.groupId ?? "");

  const [saved, setSaved] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [savePending, startSave] = useTransition();

  const clearSaved = () => setSaved(false);

  // ── Samples: local mirror of the server prop, resynced on every
  // router.refresh() (add/remove/rename all trigger one). Adjusting state
  // during render (not in an effect) per React's guidance — same pattern as
  // components/ui/ConfirmDialog.tsx:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [samples, setSamples] = useState<EditSampleRow[]>(initialSamples);
  const [prevInitialSamples, setPrevInitialSamples] = useState(initialSamples);
  if (initialSamples !== prevInitialSamples) {
    setPrevInitialSamples(initialSamples);
    setSamples(initialSamples);
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [, startRename] = useTransition();

  const [newSampleLabel, setNewSampleLabel] = useState("");
  const [addPending, startAdd] = useTransition();

  const [removeTarget, setRemoveTarget] = useState<EditSampleRow | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorCode(null);
    setSaved(false);
    startSave(async () => {
      const cups = Math.min(5, Math.max(1, parseInt(cupsInput, 10) || initial.cupsPerSample));
      const result = await updateSession(sessionId, {
        name,
        date,
        objective: objective || null,
        ...(initial.isGroup ? { groupId: groupId || null } : {}),
        ...(!locked ? { format, cupsPerSample: cups } : {}),
        locale,
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setErrorCode(result.error);
      }
    });
  };

  const startEditingSample = (row: EditSampleRow) => {
    setEditingId(row.id);
    setEditingValue(row.label);
  };

  const commitRename = (row: EditSampleRow) => {
    const value = editingValue.trim();
    setEditingId(null);
    if (!value || value === row.label) return;
    startRename(async () => {
      const result = await renameSessionSample(row.id, value);
      if (result.ok) {
        setSamples((prev) => prev.map((s) => (s.id === row.id ? { ...s, label: value } : s)));
        router.refresh();
      }
    });
  };

  const handleAddSample = () => {
    const label = newSampleLabel.trim();
    startAdd(async () => {
      const result = await addSessionSample(sessionId, { label: label || undefined, locale });
      if (result.ok) {
        setNewSampleLabel("");
        router.refresh();
      }
    });
  };

  const handleRemoveConfirm = async () => {
    if (!removeTarget) return;
    const result = await removeSessionSample(removeTarget.id, locale);
    if (!result.ok) throw new Error(result.error);
    router.refresh();
  };

  const errorText = errorCode ? (errorCode === "format_locked" ? t.formatLocked : t.error) : null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* a. Metadata */}
      <div className={cardCls}>
        <div>
          <label className={labelCls}>{t.name}</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearSaved();
            }}
            placeholder={t.namePh}
            required
          />
        </div>
        <div>
          <label className={labelCls}>{t.date}</label>
          <input
            type="date"
            className={inputCls}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              clearSaved();
            }}
          />
        </div>
        <div>
          <label className={labelCls}>{t.objective}</label>
          <textarea
            className={inputCls + " min-h-[72px]"}
            value={objective}
            onChange={(e) => {
              setObjective(e.target.value);
              clearSaved();
            }}
            placeholder={t.objectivePh}
          />
        </div>
      </div>

      {/* b. Format & cups */}
      <div className={cardCls}>
        <div>
          <label className={labelCls}>{t.format}</label>
          <div className="flex flex-wrap gap-2">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={locked}
                onClick={() => {
                  setFormat(opt);
                  clearSaved();
                }}
                className={
                  format === opt
                    ? "rounded-pill bg-primary-container px-5 py-2.5 text-sm font-medium text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
                    : "rounded-pill border border-outline-variant px-5 py-2.5 text-sm text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                }
              >
                {t.formats[opt]}
              </button>
            ))}
          </div>
        </div>
        <div className="max-w-[10rem]">
          <label className={labelCls}>{t.cups}</label>
          <input
            type="number"
            min={1}
            max={5}
            disabled={locked}
            className={inputCls}
            value={cupsInput}
            onChange={(e) => {
              setCupsInput(e.target.value);
              clearSaved();
            }}
          />
        </div>
        {locked && <p className="text-xs text-on-surface-variant">{t.formatLocked}</p>}
      </div>

      {/* c. Group link (group sessions only) */}
      {initial.isGroup && (
        <div className={cardCls}>
          <div>
            <label className={labelCls}>{t.linkedGroup}</label>
            <Select
              value={groupId}
              onChange={(v) => {
                setGroupId(v);
                clearSaved();
              }}
              ariaLabel={t.linkedGroup}
              options={[{ value: "", label: t.noGroup }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
            />
          </div>
        </div>
      )}

      {/* d. Samples */}
      <div className={cardCls}>
        <label className={labelCls}>{t.samplesTitle}</label>
        <div className="space-y-2">
          {samples.map((sample) => {
            const hasEvals = sample.evalCount > 0;
            const isEditing = editingId === sample.id;
            return (
              <div key={sample.id} className="flex items-center gap-2">
                <input
                  value={isEditing ? editingValue : sample.label}
                  onFocus={() => startEditingSample(sample)}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => commitRename(sample)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  aria-label={t.sampleLabel}
                  className={inputCls + " flex-1"}
                />
                <button
                  type="button"
                  disabled={hasEvals}
                  title={hasEvals ? t.sampleHasEvals : undefined}
                  onClick={() => setRemoveTarget(sample)}
                  aria-label={t.removeSample}
                  className="p-1.5 text-on-surface-variant transition-colors hover:text-error disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-on-surface-variant"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <input
            value={newSampleLabel}
            onChange={(e) => setNewSampleLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddSample();
              }
            }}
            aria-label={t.addSample}
            placeholder={t.sampleLabel}
            className={inputCls + " flex-1"}
          />
          <button
            type="button"
            disabled={addPending}
            onClick={handleAddSample}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-primary-container px-4 py-2.5 text-sm font-medium text-primary-container transition-colors hover:bg-primary-fixed disabled:opacity-50"
          >
            <Plus size={16} />
            {t.addSample}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
        title={t.removeSampleTitle}
        body={t.removeSampleBody.replace("{label}", removeTarget?.label ?? "")}
        confirmLabel={t.removeSample}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        onConfirm={handleRemoveConfirm}
        error={t.error}
      />

      {/* e. Save bar */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={savePending}
          className="rounded-pill bg-primary-container px-6 py-3 text-sm font-medium text-on-primary transition-colors hover:bg-primary disabled:opacity-50"
        >
          {savePending ? t.saving : t.save}
        </button>
        {saved && <p className="text-sm text-primary-container">{t.saved}</p>}
        {errorText && <p className="text-sm text-error">{errorText}</p>}
      </div>
    </form>
  );
}
