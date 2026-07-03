"use client";

import { useState } from "react";

export type SampleCoffeeFields = {
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  processType: string;
  altitude: string;
  roastLevel: string;
};

export type SampleMetadataFormData = SampleCoffeeFields & { label: string };

export type EditSampleMetadataFormTranslations = {
  label: string;
  name: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  process: string;
  altitude: string;
  roastLevel: string;
  save: string;
  saving: string;
  cancel: string;
  error?: string;
};

const inputCls =
  "w-full px-3 py-2 border border-[#D4C5A9] rounded-lg text-sm bg-white text-brown-dark focus:outline-none focus:border-green-dark";
const labelCls =
  "block text-xs text-brown-mid font-semibold uppercase tracking-wide mb-1";

export function EditSampleMetadataForm({
  initialData,
  onSubmit,
  onCancel,
  translations: t,
}: {
  initialData: SampleMetadataFormData;
  onSubmit: (data: SampleMetadataFormData) => Promise<void>;
  onCancel: () => void;
  translations: EditSampleMetadataFormTranslations;
}) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof SampleMetadataFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(data);
    } catch {
      setError(t.error ?? "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof SampleMetadataFormData; label: string }[] = [
    { key: "label", label: t.label },
    { key: "name", label: t.name },
    { key: "country", label: t.country },
    { key: "region", label: t.region },
    { key: "farm", label: t.farm },
    { key: "producer", label: t.producer },
    { key: "variety", label: t.variety },
    { key: "processType", label: t.process },
    { key: "altitude", label: t.altitude },
    { key: "roastLevel", label: t.roastLevel },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ key, label }) => (
          <div key={key} className={key === "name" || key === "label" ? "col-span-2" : undefined}>
            <label className={labelCls}>{label}</label>
            <input
              className={inputCls}
              value={data[key]}
              onChange={set(key)}
            />
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-defect">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-brown-light font-sans text-sm text-brown-dark hover:bg-cream disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {t.cancel}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-md bg-green-dark font-sans text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {saving ? t.saving : t.save}
        </button>
      </div>
    </form>
  );
}
