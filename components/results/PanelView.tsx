"use client";

import type { ReactNode } from "react";
import { CupperAlignment, type AlignmentTranslations, type CupperAlignmentRow } from "@/components/results/CupperAlignment";
import { LateEvaluationsPanel, type LateEvaluationsTranslations } from "@/components/results/LateEvaluationsPanel";
import {
  OwnerParticipantSection,
  type OwnerMatrixTranslations,
  type ParticipantResult,
} from "@/components/results/OwnerParticipantSection";
import { PostCloseNotesOwnerList, type PostCloseNoteTranslations } from "@/components/results/PostCloseNote";
import type { SessionFormat } from "@/lib/constants";
import type { CupperPostCloseNote, OwnerLateRow } from "@/lib/lateContributions";
import type { PanelStrings } from "./panelStrings";

/**
 * The organizer's Panel (package R5): their working view, with names, in ONE
 * place and in the order they work in:
 *   1. what waits for a decision: the evaluations received late;
 *   2. every cupper's total for every coffee, beside the group's, with a mark on
 *      the cells far from the group, and under it who counts in the group's
 *      numbers (the exclusion switches);
 *   3. the notes the cuppers added after the close;
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
  /** Other cuppers' notes after the close; null when the page holds none. */
  notes: {
    byCupper: Record<string, Record<string, CupperPostCloseNote>>;
    sampleLabels: Record<string, string>;
    t: PostCloseNoteTranslations;
  } | null;
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
        <h2 className="section-title inline-flex items-center gap-1.5">
          {matrixTitle}
          {matrixHelp}
        </h2>
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
          byCupper={notes.byCupper}
          cupperNames={Object.fromEntries(participants.map((p) => [p.id, p.name]))}
          sampleLabels={notes.sampleLabels}
          locale={locale}
          translations={notes.t}
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
