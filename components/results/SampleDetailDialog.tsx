"use client";

/**
 * The host of a coffee's SHEET: a bottom sheet on a phone, a dialog from 640 px
 * (`ResponsiveDialog`). A dialog, not a page, because the reader comes from a
 * card and goes back to the cards where they left them; the coffee is written
 * in the address by the results page, so a reload opens it again and "back"
 * closes it (see `ResultsClient.tsx`).
 *
 * On top of the sheet's body (`SampleDetail`) it adds the organizer's own
 * controls, as before:
 * - the cupper switch, to read any participant's evaluation of this coffee
 *   (only when a `participants` matrix is supplied: the organizer's lens);
 * - "Asignar café", "Editar muestra", "Editar datos de origen".
 *
 * It fetches and mutates nothing: all data arrives as props, every action is a
 * callback. What a viewer may read of the GROUP is decided before it: every
 * group prop here is null where the page's gates say so, and none of them is
 * passed on while the organizer reads one cupper.
 */

import { useState, type ReactNode } from "react";
import { Coffee, Pencil } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { PillTabs, Button, type PillTabItem } from "@/components/ui";
import {
  SampleDetail,
  type SampleDetailTranslations,
  type SheetCompareTranslations,
} from "@/components/results/SampleDetail";
import type { GroupBreakdownData } from "@/components/results/ScoreBreakdownPanel";
import type { SessionFormat } from "@/lib/constants";
import type { WheelFamilyId } from "@/lib/flavorWheel";
import type { CoffeeCard, CompareOption } from "@/lib/reports/coffeeCards";
import type { SheetData } from "@/lib/reports/coffeeSheet";
import type { DefectSummary } from "@/lib/reports/defectSummary";
import type { WheelData } from "@/lib/reports/wheelData";
import { referenceBadgeText } from "@/lib/referenceRules";
import type { ScoreRule } from "@/lib/scoreRule";
import type { SampleResult } from "@/app/[locale]/app/sessions/[id]/results/types";
import type { CardsStrings } from "./cardsStrings";
import type { OverviewStrings } from "./overviewStrings";
import type { ResultsPartsStrings } from "./partsStrings";
import type { SheetStrings } from "./sheetStrings";

/** The sheet's own words, plus the dialog's. */
export type SampleDetailDialogTranslations = SampleDetailTranslations & {
  myEvaluation: string;
  viewingAs: string;
  editSample: string;
  editExtrinsic: string;
  assignCoffee: string;
  close: string;
  compare: SheetCompareTranslations;
};

type Module = Record<string, unknown>;
type ParticipantSample = {
  id: string;
  descriptive: Module;
  affective: Module;
  combined: Module;
  scoreRule?: ScoreRule;
};

export type SampleDetailParticipant = {
  id: string;
  name: string;
  samples: ParticipantSample[];
};

/** What the sheet shows of the group and of the other coffees: all of it
 *  already gated by the page and the server. */
export type SheetGroupProps = {
  /** This coffee's card (`coffeeCards`): the score's context, the quality rows. */
  card: CoffeeCard<unknown> | null;
  /** The group's stored numbers; null where this viewer may not read the group's results. */
  aggregate: (GroupBreakdownData & { partialCount?: number }) | null;
  /** The session's reference is fixed at 79.00 for everyone. */
  referencePinned: boolean;
  /** The viewer's own score minus their own score of the reference. */
  ownDelta: number | null;
  wheel: WheelData | null;
  defects: DefectSummary | null;
  blocks: SheetData | null;
  /** "Comparar con": null unless the session is closed and counts may be compared. */
  compare: {
    self: CompareOption;
    others: CompareOption[];
    /** A coffee's label and name: the legend, the table and a chip's spoken name. */
    names: Readonly<Record<string, string>>;
    /** What a chip prints beside the letter: the name once revealed, else the label. */
    short: Readonly<Record<string, string>>;
  } | null;
  compareGround: "rings" | "families";
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
  onEditExtrinsic,
  onAssignCoffee,
  referenceBadge,
  referenceCount = 1,
  extra,
  group,
  familyLabels,
  blockLabels,
  parts,
  cards,
  overview,
  s,
  t,
}: {
  open: boolean;
  onClose: () => void;
  sample: SampleResult;
  isOwner: boolean;
  participants?: SampleDetailParticipant[] | null;
  // Non-null when the sheet is opened directly onto a specific cupper (from the
  // organizer's matrix) rather than the viewer's own evaluation.
  initialParticipantId?: string | null;
  format: SessionFormat;
  cupsPerSample: number;
  locale: string;
  // Absent in read-only contexts (the admin's lens, a closed cupping): hides "Editar".
  onEdit?: () => void;
  onEditMetadata?: () => void;
  // Absent unless the sample is revealed (blind integrity: origin data stays
  // hidden before the reveal) and the viewer is not a read-only admin.
  onEditExtrinsic?: () => void;
  // Organizer only: link a coffee to a coffee-less (express) sample.
  onAssignCoffee?: () => void;
  // The words of the "Referencia" badge: rendered only when `sample` is one.
  referenceBadge?: string;
  /** Number of references in the session: numbers the badge when there are several. */
  referenceCount?: number;
  /** Extra content for the shown viewer ("me" or a participant id): the note
   *  after the close (S10 WP4b). A slot, so this dialog never knows about it. */
  extra?: (viewerId: string) => ReactNode;
  group: SheetGroupProps;
  familyLabels: Record<WheelFamilyId, string>;
  blockLabels: Readonly<Record<string, string>>;
  parts: ResultsPartsStrings;
  cards: CardsStrings;
  overview: OverviewStrings;
  s: SheetStrings;
  t: SampleDetailDialogTranslations;
}) {
  const initialViewerId = initialParticipantId ?? "me";
  const [viewerId, setViewerId] = useState<string>(initialViewerId);
  // Reset whenever a new coffee is opened, or a new cupper is asked for on the
  // same coffee (another cell of the matrix), so the switch never keeps a stale
  // participant. Adjusted during render (React's documented pattern for
  // resetting state on a prop change), not in an effect.
  const [lastKey, setLastKey] = useState(`${sample.id}|${initialViewerId}`);
  const currentKey = `${sample.id}|${initialViewerId}`;
  if (currentKey !== lastKey) {
    setLastKey(currentKey);
    setViewerId(initialViewerId);
  }

  // The participants list is only ever passed to the organizer's lens (the
  // organizer or the admin's read-only view), so its presence alone gates the
  // switch; `isOwner` keeps gating the editing buttons below.
  const showSwitcher = !!participants && participants.length > 0;
  const activeParticipant =
    showSwitcher && viewerId !== "me" ? (participants!.find((p) => p.id === viewerId) ?? null) : null;
  const activeSample = activeParticipant ? (activeParticipant.samples.find((x) => x.id === sample.id) ?? null) : null;
  const moduleOf = (x: { descriptive: Module; affective: Module; combined: Module } | null): Module =>
    !x ? {} : format === "affective" ? x.affective : format === "descriptive" ? x.descriptive : x.combined;
  const data = activeParticipant ? moduleOf(activeSample) : moduleOf(sample);
  // Rule the shown evaluation was scored under (stored cups NULL = before 2026-11).
  const scoreRule = activeParticipant ? activeSample?.scoreRule : sample.scoreRule;

  const title = sample.revealed && sample.coffee ? `${sample.label} · ${sample.coffee.name}` : sample.label;
  const subtitle = activeParticipant ? `${t.viewingAs} ${activeParticipant.name}` : undefined;
  const pillItems: PillTabItem[] = showSwitcher
    ? [{ id: "me", label: t.myEvaluation }, ...participants!.map((p) => ({ id: p.id, label: p.name }))]
    : [];
  const isPinnedReference = sample.isReference && group.referencePinned;

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
          <PillTabs items={pillItems} value={viewerId} onChange={setViewerId} ariaLabel={t.viewingAs} size="sm" />
        )}

        {isOwner && (onEditMetadata || onEditExtrinsic || onAssignCoffee) && (
          <div className="flex flex-wrap gap-2">
            {onAssignCoffee && (
              <Button size="sm" variant="secondary" icon={<Coffee size={13} aria-hidden />} onClick={onAssignCoffee} className="w-fit">
                {t.assignCoffee}
              </Button>
            )}
            {onEditMetadata && (
              <Button size="sm" variant="ghost" icon={<Pencil size={13} aria-hidden />} onClick={onEditMetadata} className="w-fit">
                {t.editSample}
              </Button>
            )}
            {onEditExtrinsic && (
              <Button size="sm" variant="ghost" icon={<Pencil size={13} aria-hidden />} onClick={onEditExtrinsic} className="w-fit">
                {t.editExtrinsic}
              </Button>
            )}
          </div>
        )}

        <SampleDetail
          // a new coffee or a new cupper starts the sheet's own choices afresh
          key={`${sample.id}|${viewerId}`}
          data={data}
          format={format}
          cupsPerSample={cupsPerSample}
          scoreRule={scoreRule}
          locale={locale}
          // Other cuppers' rows come from the sent-only matrix query, so the
          // own-evaluation state only applies to the viewer's own lens.
          myEvaluation={activeParticipant ? undefined : sample.myEvaluation}
          cupperName={activeParticipant ? activeParticipant.name : null}
          referenceBadge={
            sample.isReference && referenceBadge
              ? referenceBadgeText(referenceBadge, sample.referenceRank, referenceCount)
              : null
          }
          referencePinned={isPinnedReference}
          onEdit={viewerId === "me" ? onEdit : undefined}
          // nothing of the group while the organizer reads one cupper
          card={activeParticipant ? null : group.card}
          aggregate={activeParticipant ? null : group.aggregate}
          ownDelta={activeParticipant ? null : group.ownDelta}
          wheel={activeParticipant ? null : group.wheel}
          defects={activeParticipant ? null : group.defects}
          sheet={activeParticipant ? null : group.blocks}
          comparison={activeParticipant ? null : (sample.comparison ?? null)}
          repeatDiffs={activeParticipant ? [] : (sample.repeatDiffs ?? [])}
          compare={activeParticipant ? null : group.compare}
          compareGround={group.compareGround}
          extrinsic={sample.extrinsic}
          extrinsicNote={sample.extrinsicEditedLabel ?? null}
          prep={sample.prep ?? null}
          extra={extra?.(viewerId)}
          familyLabels={familyLabels}
          blockLabels={blockLabels}
          parts={parts}
          cards={cards}
          overview={overview}
          s={s}
          compareT={t.compare}
          t={t}
        />
      </div>
    </ResponsiveDialog>
  );
}
