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
 * upsertExtrinsic (app/actions/sessions.ts) is owner-gated and, once the
 * session is over, additionally requires a REVEALED sample (the first
 * sanctioned post-close write, S8-12). It returns an ActionResult, so a
 * refusal (session_closed, not_found_or_forbidden…) surfaces as a localized
 * toast through useActionFeedback and the dialog stays open.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { Button, useActionFeedback } from "@/components/ui";
import { ExtrinsicForm } from "@/components/cupping/ExtrinsicForm";
import { upsertExtrinsic } from "@/app/actions/sessions";

export type ExtrinsicEditDialogTranslations = {
  /** Dialog title prefix — rendered as "{title}: {sampleLabel}". */
  title: string;
  save: string;
  saving: string;
  cancel: string;
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
  const feedback = useActionFeedback();

  const handleSave = async () => {
    setSaving(true);
    try {
      await feedback.run(upsertExtrinsic({ sessionSampleId: sampleId, data }), () => {
        onClose();
        router.refresh();
      });
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
