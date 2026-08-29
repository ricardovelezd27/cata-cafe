"use client";

/**
 * ResponsiveDialog host for the personal drill-down (`SampleDetail`). Adds
 * two owner-only affordances on top of the plain per-sample view:
 * - a catador switcher (PillTabs) to inspect any participant's evaluation of
 *   this sample, when a `participants` matrix is supplied
 * - a shortcut into the sample's metadata editor
 *
 * Does not fetch or mutate anything itself — all data arrives as props and
 * all actions are callbacks. Not wired into ResultsClient here; a later pass
 * integrates it.
 */

import { useState } from "react";
import { Pencil } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { PillTabs, Button, type PillTabItem } from "@/components/ui";
import { SampleDetail, type SampleDetailTranslations } from "@/components/results/SampleDetail";
import type { SessionFormat } from "@/lib/constants";
import type { SampleResult } from "@/app/[locale]/app/sessions/[id]/results/types";

/** SampleDetail's full translation shape, plus the dialog's own strings. */
export type SampleDetailDialogTranslations = SampleDetailTranslations & {
  myEvaluation: string;
  viewingAs: string;
  editSample: string;
  close: string;
};

type ParticipantSample = {
  id: string;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
};

export type SampleDetailParticipant = {
  id: string;
  name: string;
  samples: ParticipantSample[];
};

export function SampleDetailDialog({
  open,
  onClose,
  sample,
  isOwner,
  participants,
  initialParticipantId,
  format,
  cupsPerSample,
  locale,
  onEdit,
  onEditMetadata,
  t,
}: {
  open: boolean;
  onClose: () => void;
  sample: SampleResult;
  isOwner: boolean;
  participants?: SampleDetailParticipant[] | null;
  // Non-null when the dialog is opened directly onto a specific catador (e.g.
  // from the owner CVA matrix) rather than the viewer's own evaluation.
  initialParticipantId?: string | null;
  format: SessionFormat;
  cupsPerSample: number;
  locale: string;
  // Absent in read-only contexts (super-admin god mode) — hides the edit CTA.
  onEdit?: () => void;
  onEditMetadata?: () => void;
  t: SampleDetailDialogTranslations;
}) {
  const initialViewerId = initialParticipantId ?? "me";
  const [viewerId, setViewerId] = useState<string>(initialViewerId);
  // Reset whenever a new sample is opened, or a new initial catador is
  // requested for the same sample (e.g. clicking a different matrix cell),
  // so the switcher never leaves a stale participant selected. Adjusted
  // during render (React's documented pattern for resetting state on a prop
  // change) instead of an effect, so there is no extra commit + cascading
  // render.
  const [lastKey, setLastKey] = useState(`${sample.id}|${initialViewerId}`);
  const currentKey = `${sample.id}|${initialViewerId}`;
  if (currentKey !== lastKey) {
    setLastKey(currentKey);
    setViewerId(initialViewerId);
  }

  // The participants list is only ever passed to owner-perspective viewers
  // (owner or super-admin read view), so its presence alone gates the
  // switcher — isOwner keeps gating the metadata-edit button below.
  const showSwitcher = !!participants && participants.length > 0;
  const activeParticipant =
    showSwitcher && viewerId !== "me"
      ? (participants!.find((p) => p.id === viewerId) ?? null)
      : null;
  const activeSample = activeParticipant
    ? (activeParticipant.samples.find((s) => s.id === sample.id) ?? null)
    : null;

  const descriptive = activeParticipant ? (activeSample?.descriptive ?? {}) : sample.descriptive;
  const affective = activeParticipant ? (activeSample?.affective ?? {}) : sample.affective;
  const combined = activeParticipant ? (activeSample?.combined ?? {}) : sample.combined;

  const title =
    sample.revealed && sample.coffee ? `${sample.label} · ${sample.coffee.name}` : sample.label;
  const subtitle = activeParticipant ? `${t.viewingAs} ${activeParticipant.name}` : undefined;

  const pillItems: PillTabItem[] = showSwitcher
    ? [{ id: "me", label: t.myEvaluation }, ...participants!.map((p) => ({ id: p.id, label: p.name }))]
    : [];

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      subtitle={subtitle}
      closeLabel={t.close}
    >
      <div className="flex flex-col gap-4">
        {showSwitcher && (
          <PillTabs
            items={pillItems}
            value={viewerId}
            onChange={setViewerId}
            ariaLabel={t.viewingAs}
            size="sm"
          />
        )}

        {isOwner && onEditMetadata && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Pencil size={13} aria-hidden />}
            onClick={onEditMetadata}
            className="w-fit"
          >
            {t.editSample}
          </Button>
        )}

        <SampleDetail
          sampleLabel={sample.label}
          coffeeName={sample.revealed ? (sample.coffee?.name ?? null) : null}
          descriptive={descriptive}
          affective={affective}
          combined={combined}
          extrinsic={sample.extrinsic}
          format={format}
          cupsPerSample={cupsPerSample}
          locale={locale}
          onEdit={viewerId === "me" ? onEdit : undefined}
          t={t}
        />
      </div>
    </ResponsiveDialog>
  );
}
