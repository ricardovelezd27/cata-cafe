"use client";

import { useState } from "react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import type { SyncConflict } from "@/lib/offline/types";
import { Button } from "@/components/ui";

export type SyncConflictTranslations = {
  conflictTitle: string;
  conflictBody: string; // RAW template (via t.raw()) — contains "{sample}"
  conflictKeep: string;
  conflictReplace: string;
};

// Surfaces submit-conflicts one at a time: the server already holds a SUBMITTED
// evaluation for this sample (e.g. submitted from another device), so the user
// chooses keep-submitted vs replace-with-local.
export function SyncConflictModal({
  conflicts,
  onResolve,
  translations: t,
}: {
  conflicts: SyncConflict[];
  onResolve: (conflict: SyncConflict, replace: boolean) => Promise<void>;
  translations: SyncConflictTranslations;
}) {
  const [busy, setBusy] = useState(false);
  const conflict = conflicts[0];
  if (!conflict) return null;

  const resolve = async (replace: boolean) => {
    setBusy(true);
    try {
      await onResolve(conflict, replace);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={() => {
        /* require an explicit choice — no dismiss */
      }}
      title={t.conflictTitle}
      closeLabel={t.conflictKeep}
    >
      <div className="space-y-5">
        <p className="font-sans text-body text-on-surface">
          {t.conflictBody.replace("{sample}", conflict.sampleLabel)}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary"
            type="button"
            disabled={busy}
            onClick={() => resolve(false)}
          >
            {t.conflictKeep}
          </Button>
          <Button
            type="button"
            disabled={busy}
            onClick={() => resolve(true)}
          >
            {t.conflictReplace}
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
