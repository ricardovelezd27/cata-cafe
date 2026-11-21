"use client";

import { useId } from "react";
import { PaperSectionHeading } from "@/components/ui";
import { PostCloseNoteEditor, type PostCloseNoteTranslations } from "@/components/results/PostCloseNote";
import type { MyPostCloseNote } from "@/lib/lateContributions";

type NamedSample = { id: string; label: string; revealed: boolean; coffee: { name: string } | null };

export type ReflectionStrings = {
  title: string;
  lead: string;
  /** Who reads it, in a group cupping. */
  who: string;
  /** Who reads it when nobody else does. */
  whoSolo: string;
};

/**
 * The reflection: the note after the close, one per coffee. It is the EXISTING
 * note (`setPostCloseNote`: the cupper's own submitted evaluation of a closed
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
  t: ReflectionStrings;
}) {
  const titleId = useId();
  const rows = samples.filter((s) => notes[s.id]);
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 font-sans md:gap-4" aria-labelledby={titleId} data-reflection="">
      <div className="flex flex-col gap-0.5">
        <PaperSectionHeading id={titleId} title={t.title} flush />
        <p className="m-0 text-caption leading-snug text-on-surface-variant">
          {t.lead} {onlyReader ? t.whoSolo : t.who}
        </p>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4">
        {rows.map((s) => {
          const note = notes[s.id];
          return (
            <li key={s.id} className="flex min-w-0 flex-col gap-2">
              <PaperSectionHeading
                level={3}
                flush
                title={
                  <>
                    {s.label}
                    {s.revealed && s.coffee && s.coffee.name.trim() ? (
                      <span className="font-sans text-body font-normal text-on-surface-variant"> {s.coffee.name.trim()}</span>
                    ) : null}
                  </>
                }
              />
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
