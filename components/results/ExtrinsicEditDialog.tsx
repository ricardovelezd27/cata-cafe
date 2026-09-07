"use client";

/**
 * Post-close origin-data editor: a ResponsiveDialog wrapping the existing
 * controlled ExtrinsicForm (components/cupping/ExtrinsicForm.tsx), so the
 * session owner can fill in/fix cultivo/procesamiento/comercio data on the
 * results page after the sample has been revealed — without going back into
 * the cupping flow. Mirrors the EditSampleMetadataForm dialog pattern already
 * used in ResultsClient (~676-716): local state seeded once from the
 * sample's current extrinsic data, Save → upsertExtrinsic, close on success.
 *
 * upsertExtrinsic (app/actions/sessions.ts) is member-gated and status-
 * ungated already — this dialog adds no new authz surface, it just gives the
 * owner a second entry point into that same action.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Button } from "@/components/ui";
import { ExtrinsicForm } from "@/components/cupping/ExtrinsicForm";
import { upsertExtrinsic } from "@/app/actions/sessions";

export type ExtrinsicEditDialogTranslations = {
  /** Dialog title prefix — rendered as "{title}: {sampleLabel}". */
  title: string;
  save: string;
  saving: string;
  cancel: string;
  error: string;
};

export function ExtrinsicEditDialog({
  sampleId,
  sampleLabel,
  initialData,
  onClose,
  t,
}: {
  sampleId: string;
  sampleLabel: string;
  initialData: Record<string, unknown>;
  onClose: () => void;
  t: ExtrinsicEditDialogTranslations;
}) {
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await upsertExtrinsic({ sessionSampleId: sampleId, data });
      onClose();
      router.refresh();
    } catch {
      setError(t.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={`${t.title}: ${sampleLabel}`}
      closeLabel={t.cancel}
    >
      <div className="flex flex-col gap-4">
        <ExtrinsicForm sampleData={data} onChange={setData} hideHeader />

        {error && (
          <p role="alert" className="text-xs text-error">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end pt-1">
          <Button variant="secondary" size="md" onClick={onClose} disabled={saving}>
            {t.cancel}
          </Button>
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
