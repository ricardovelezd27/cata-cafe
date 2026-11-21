"use client";

import type { ReactNode } from "react";
import { PaperSectionHeading } from "@/components/ui";
import { CupperAlignment, type AlignmentTranslations, type CupperAlignmentRow } from "@/components/results/CupperAlignment";
import { LateEvaluationsPanel, type LateEvaluationsTranslations } from "@/components/results/LateEvaluationsPanel";
import {
  OwnerParticipantSection,
  type OwnerMatrixTranslations,
  type ParticipantResult,
} from "@/components/results/OwnerParticipantSection";
import { PostCloseNotesOwnerList, type OwnerNoteItem } from "@/components/results/PostCloseNote";
import type { SessionFormat } from "@/lib/constants";
import type { OwnerLateRow } from "@/lib/lateContributions";
import type { PanelStrings } from "./panelStrings";

/**
 * The organizer's Panel (package R5): their working view, with names, in ONE
 * place and in the order they work in:
 *   1. what waits for a decision: the evaluations received late;
 *   2. every cupper's total for every coffee, beside the group's, with a mark on
 *      the cells far from the group, and under it who counts in the group's
 *      numbers (the exclusion switches);
 *   3. what the cuppers wrote after the close (their reflections about the
 *      tasting or, in an older tasting, their notes per coffee: one block);
 *   4. how many of the panel's most chosen descriptors each cupper chose too.
 *
 * It arranges; it does not decide and it changes no control. Every part keeps
 * its own component, action and rules: `setParticipantExclusion` with its
 * reason list and its confirmation, `acceptLateEvaluation` with its version
 * guard and its "recibida después del cierre" label, the notes read-only, a
 * cell opening that cupper's evaluation. The rows it shows exist only in the
 * organizer's page (the admin's read-only lens gets the matrix, the notes and
 * the alignment, never a control): the results page mounts this view only when
 * it holds them.
 */
export function PanelView({
  sessionId,
  participants,
  format,
  cupsPerSample,
  readOnly,
  onOpenDetail,
  referenceBadge,
  groupScores,
  matrixRows,
  matrixTitle,
  matrixHelp,
  matrixT,
  late,
  notes,
  alignment,
  locale,
  t,
}: {
  sessionId: string;
  participants: ParticipantResult[];
  format: SessionFormat;
  cupsPerSample: number;
  /** The admin's read-only lens: no exclusion switch, no late evaluation to accept. */
  readOnly: boolean;
  onOpenDetail: (sampleId: string, participantId: string) => void;
  referenceBadge?: string;
  /** The score each coffee's card shows, by sample id: the matrix's "Grupo" line. */
  groupScores: Readonly<Record<string, number | null>>;
  /** The table's direction; only the review board passes it. */
  matrixRows?: "cuppers" | "coffees";
  matrixTitle: string;
  matrixHelp: ReactNode;
  matrixT: OwnerMatrixTranslations;
  /** The organizer's late rows; null for anyone else (and in the admin's lens). */
  late: { rows: OwnerLateRow[]; t: LateEvaluationsTranslations } | null;
  /** What the other cuppers wrote after the close; null when the page holds nothing. */
  notes: { title: string; intro: string; dated: string; items: OwnerNoteItem[] } | null;
  alignment: {
    rows: CupperAlignmentRow[];
    samples: { id: string; label: string }[];
    t: AlignmentTranslations;
    help: ReactNode;
  } | null;
  locale: string;
  t: PanelStrings;
}) {
  return (
    <div className="flex flex-col gap-6 p-4 outline-none lg:p-6" data-panel-view="" tabIndex={-1}>
      {late && late.rows.length > 0 && !readOnly ? (
        <LateEvaluationsPanel rows={late.rows} locale={locale} translations={late.t} embedded />
      ) : null}

      <section className="flex flex-col gap-3" data-panel-section="matrix">
        <PaperSectionHeading title={matrixTitle} info={matrixHelp} flush />
        <OwnerParticipantSection
          sessionId={sessionId}
          participants={participants}
          format={format}
          cupsPerSample={cupsPerSample}
          readOnly={readOnly}
          onOpenDetail={onOpenDetail}
          referenceBadge={referenceBadge}
          groupScores={groupScores}
          matrixRows={matrixRows}
          t={matrixT}
          panelT={t}
        />
      </section>

      {notes ? (
        <PostCloseNotesOwnerList
          title={notes.title}
          intro={notes.intro}
          dated={notes.dated}
          items={notes.items}
          locale={locale}
        />
      ) : null}

      {alignment && alignment.rows.length > 0 ? (
        <CupperAlignment
          rows={alignment.rows}
          samples={alignment.samples}
          t={alignment.t}
          countPattern={t.alignCount}
          titleAction={alignment.help}
        />
      ) : null}
    </div>
  );
}
