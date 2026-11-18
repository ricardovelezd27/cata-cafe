"use client";

import { useId } from "react";
import { PostCloseNoteEditor, type PostCloseNoteTranslations } from "@/components/results/PostCloseNote";
import { wheelNodeLabels } from "@/lib/flavorWheelLabels";
import type { MyPostCloseNote } from "@/lib/lateContributions";
import type { Learning } from "@/lib/reports/learnings";
import { learningSentence, type LearningNames } from "@/lib/reports/learningSentences";
import type { LearningsPayload } from "@/lib/reports/learningsInput";
import type { LearningsStrings } from "./learningsStrings";

type NamedSample = { id: string; label: string; revealed: boolean; coffee: { name: string } | null };

/** A coffee as a sentence names it: its label and, once revealed, its name
 *  (trimmed: a stored name can end in a space, and a comma follows it). */
const nameOf = (s: NamedSample) => {
  const name = s.revealed && s.coffee ? s.coffee.name.trim() : "";
  return name ? `${s.label} ${name}` : s.label;
};

const card = "flex min-w-0 flex-col gap-2 rounded-card border border-outline-variant bg-surface-container-lowest p-4 md:p-5";
const quiet = "m-0 text-[12.25px] leading-snug text-on-surface-variant";

/**
 * "Aprendizajes": what a closed cupping taught, in sentences computed by fixed
 * rules (lib/reports/learnings.ts), each with its numbers. Two columns: the
 * panel's (the same for everyone who may read the group's results) and the
 * reader's own.
 *
 * It draws; it does not decide. WHICH sentences exist for this viewer was
 * decided on the server (`learningsPayload`: nothing before the close, panel
 * sentences from three included cuppers, the reader's own built from their own
 * values). A learning carries sample ids, numbers and reference-data ids only;
 * the names printed here are the coffees' and the descriptors', never a
 * person's. Nothing is graded: a difference is a number with its sign, in ink.
 */
export function Learnings({
  learnings,
  samples,
  isGroup,
  showMine,
  viewerSent,
  locale,
  attributes,
  defectTypes,
  t,
}: {
  learnings: LearningsPayload;
  samples: readonly NamedSample[];
  isGroup: boolean;
  /** False in the admin's read-only lens: "tú" there would be the organizer. */
  showMine: boolean;
  /** The reader sent at least one evaluation (an organizer who did not cup has no column of their own). */
  viewerSent: boolean;
  locale: string;
  /** The eight quality attributes' names, by id. */
  attributes: Readonly<Record<string, string>>;
  /** The defect types' labels, by id. */
  defectTypes: Readonly<Record<string, string>>;
  t: LearningsStrings;
}) {
  const titleId = useId();
  const nodes = wheelNodeLabels(locale === "en" ? "en" : "es");
  const byId = new Map(samples.map((s) => [s.id, s]));
  const names: LearningNames = {
    sample: (id) => {
      const s = byId.get(id);
      return s ? nameOf(s) : "";
    },
    descriptor: (id) => nodes[id] ?? id,
    attribute: (id) => attributes[id] ?? id,
    defectType: (type) => defectTypes[type] ?? type,
  };
  // Which columns exist. A column with no sentence is shown only when it explains
  // something: the panel's when there are too few cuppers (the line says why) or
  // beside sentences of the reader's own; the reader's when they sent an
  // evaluation and the panel's column is there. With nothing to say, no section.
  const tooFew = learnings.panelStatus === "too_few";
  const mineCount = showMine ? learnings.mine.length : 0;
  const showPanel = isGroup && learnings.panelStatus !== "not_applicable" && (tooFew || learnings.panel.length > 0 || mineCount > 0);
  const showOwn = showMine && (mineCount > 0 || (showPanel && viewerSent));
  if (!showPanel && !showOwn) return null;
  // The closing line belongs under sentences that set something beside the
  // group: not under the repeated coffee alone (that one is the reader's two own).
  const besideGroup =
    (showPanel ? learnings.panel.length : 0) + (showMine ? learnings.mine.filter((l) => l.rule !== "P6").length : 0);
  // One column on a wide screen: its sentences run in two text columns, so a
  // line stays a readable length.
  const alone = !(showPanel && showOwn);

  const list = (items: readonly Learning[]) => (
    <ul className={`m-0 list-none p-0 ${alone && items.length > 1 ? "md:columns-2 md:gap-x-8" : ""}`}>
      {items.map((l, i) => (
        <li
          key={`${l.rule}-${l.about.join("-")}-${i}`}
          className="mb-2.5 break-inside-avoid text-[14px] leading-snug text-on-surface last:mb-0"
          data-learning={l.rule}
        >
          {learningSentence(l, names, t.sentences).map((segment, k) =>
            segment.strong ? (
              <strong key={k} className="font-semibold">
                {segment.text}
              </strong>
            ) : (
              <span key={k}>{segment.text}</span>
            ),
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="flex flex-col gap-3 font-sans md:gap-4" aria-labelledby={titleId} data-learnings="">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="section-title text-[21px] leading-tight">
          {t.title}
        </h2>
        <p className={quiet}>{t.lead}</p>
      </div>
      <div className={`grid grid-cols-1 gap-3 md:gap-4 ${showPanel && showOwn ? "md:grid-cols-2" : ""}`}>
        {showPanel ? (
          <div className={card} data-learnings-scope="panel">
            <h3 className="text-[17.5px] leading-tight">{t.panelTitle}</h3>
            {learnings.panelStatus === "too_few" ? (
              <p className={quiet}>{t.tooFew}</p>
            ) : learnings.panel.length === 0 ? (
              <p className={quiet}>{t.panelNone}</p>
            ) : (
              list(learnings.panel)
            )}
          </div>
        ) : null}
        {showOwn ? (
          <div className={card} data-learnings-scope="mine">
            <h3 className="text-[17.5px] leading-tight">{t.mineTitle}</h3>
            {learnings.mine.length === 0 ? <p className={quiet}>{t.mineNone}</p> : list(learnings.mine)}
          </div>
        ) : null}
      </div>
      {/* said once, under sentences that set someone beside the group */}
      {isGroup && besideGroup > 0 ? <p className="m-0 text-[14px] leading-snug text-on-surface">{t.closing}</p> : null}
    </section>
  );
}

/**
 * The reflection: the note after the close, one per coffee, brought out of the
 * sheet (RESULTS-DESIGN.md section 8, choice 5 a). It is the EXISTING note
 * (`setPostCloseNote`: the cupper's own submitted evaluation of a closed
 * session; read by that cupper and the organizer only) and the existing editor:
 * no new store, no new rule. `notes` holds only the coffees the reader may write
 * on, as the page built them (`buildPostCloseNotes`).
 */
export function Reflection({
  notes,
  samples,
  onlyReader,
  locale,
  userId,
  noteT,
  t,
}: {
  notes: Readonly<Record<string, MyPostCloseNote>>;
  /** The coffees, in the order of the cards. */
  samples: readonly NamedSample[];
  /** Nobody else reads the note: a solo cupping, or the reader is the organizer. */
  onlyReader: boolean;
  locale: string;
  /** The user the page was rendered for (the editor's shared-device guard). */
  userId: string;
  noteT: PostCloseNoteTranslations;
  t: LearningsStrings;
}) {
  const titleId = useId();
  const rows = samples.filter((s) => notes[s.id]);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 font-sans md:gap-4" aria-labelledby={titleId} data-reflection="">
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="section-title text-[21px] leading-tight">
          {t.reflectionTitle}
        </h2>
        <p className={quiet}>
          {t.reflectionLead} {onlyReader ? t.reflectionWhoSolo : t.reflectionWho}
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4">
        {rows.map((s) => {
          const note = notes[s.id];
          return (
            <li key={s.id} className="flex min-w-0 flex-col gap-2">
              <h3 className="text-[17.5px] leading-tight">
                {s.label}
                {s.revealed && s.coffee && s.coffee.name.trim() ? (
                  <span className="font-sans text-[14px] font-normal text-on-surface-variant"> {s.coffee.name.trim()}</span>
                ) : null}
              </h3>
              <PostCloseNoteEditor
                // the same note is also on the coffee's sheet: after a save there, show the saved text here
                key={`${s.id}|${note.text ?? ""}|${note.at ?? ""}`}
                note={note}
                locale={locale}
                userId={userId}
                translations={noteT}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
