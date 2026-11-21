"use client";

import type { AlignmentTranslations } from "@/components/results/CupperAlignment";
import type { LateEvaluationsTranslations } from "@/components/results/LateEvaluationsPanel";
import type { OwnerMatrixTranslations } from "@/components/results/OwnerParticipantSection";
import { PanelView } from "@/components/results/PanelView";
import type { PanelStrings } from "@/components/results/panelStrings";
import type { PostCloseNoteTranslations } from "@/components/results/PostCloseNote";
import type { ReflectionStrings } from "@/components/results/Reflection";
import type { PanelFixture } from "@/lib/dev/panelFixtures";
import { ownerNotesBlock } from "@/lib/sessionReflection";

/** The words the organizer's Panel needs, read whole from the messages. */
export type PanelWords = {
  matrixTitle: string;
  referenceBadge: string;
  matrix: OwnerMatrixTranslations;
  panel: PanelStrings;
  late: LateEvaluationsTranslations;
  note: PostCloseNoteTranslations;
  reflection: ReflectionStrings & { ownerTitle: string; ownerIntro: string };
  align: AlignmentTranslations;
};

/** One invented cupping drawn with the real Panel. Opening a cell does nothing
 *  here (the board has no coffee sheet); the switches and "Incluir" are the real
 *  controls and are not to be pressed on the board: they call the real actions. */
export function PanelFixtureView({
  fixture,
  locale,
  rows,
  readOnly = false,
  words,
}: {
  fixture: PanelFixture;
  locale: string;
  rows: "cuppers" | "coffees";
  readOnly?: boolean;
  words: PanelWords;
}) {
  const block = ownerNotesBlock({
    coffeeNotes: fixture.notes,
    reflections: fixture.reflections,
    cupperNames: Object.fromEntries(fixture.participants.map((p) => [p.id, p.name])),
    sampleLabels: Object.fromEntries(fixture.samples.map((s) => [s.id, s.label])),
  });
  return (
    <div style={{ margin: "0 -16px" }}>
      <PanelView
        sessionId={`dev-${fixture.id}`}
        participants={fixture.participants}
        format={fixture.format}
        cupsPerSample={2}
        readOnly={readOnly}
        onOpenDetail={() => {}}
        referenceBadge={words.referenceBadge}
        groupScores={fixture.groupScores}
        matrixRows={rows}
        matrixTitle={words.matrixTitle}
        matrixHelp={null}
        matrixT={words.matrix}
        late={fixture.lateRows.length > 0 ? { rows: fixture.lateRows, t: words.late } : null}
        notes={
          !block
            ? null
            : block.kind === "coffee"
              ? { title: words.note.ownerTitle, intro: words.note.ownerIntro, dated: words.note.added, items: block.items }
              : {
                  title: words.reflection.ownerTitle,
                  intro: words.reflection.ownerIntro,
                  dated: words.reflection.written,
                  items: block.items,
                }
        }
        alignment={
          fixture.alignment.length > 0 ? { rows: fixture.alignment, samples: fixture.samples, t: words.align, help: null } : null
        }
        locale={locale}
        t={words.panel}
      />
    </div>
  );
}
