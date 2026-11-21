"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, PaperSectionHeading, useActionFeedback } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { setSessionReflection } from "@/app/actions/community";
import { PostCloseNoteReadOnly, formatNoteDate } from "@/components/results/PostCloseNote";
import { SESSION_REFLECTION_MAX, type MyReflection } from "@/lib/sessionReflection";

export type ReflectionStrings = {
  title: string;
  /** Who reads it, in a group cupping. */
  who: string;
  /** Who reads it when nobody else does. */
  whoSolo: string;
  placeholder: string;
  hint: string;
  save: string;
  saving: string;
  cancel: string;
  edit: string;
  remove: string;
  /** The confirmation before a reflection is deleted. */
  removeTitle: string;
  removeBody: string;
  /** RAW with "{date}". */
  written: string;
  /** The title over the notes per coffee of a tasting from before the reflection. */
  oldTitle: string;
};

/** A note per coffee the reader wrote before the reflection existed. */
export type OldCoffeeNote = { id: string; label: string; name: string | null; text: string; at: string | null };

/**
 * The reflection: ONE text per tasting and person, written after the close
 * (`setSessionReflection`; read by that person and the organizer only). `mine`
 * is null when the reader may not write one (they sent no evaluation, or the
 * tasting has notes per coffee from before this existed): then the reader's own
 * old notes, if any, are shown as they are, read-only. Never both.
 */
export function Reflection({
  sessionId,
  mine,
  oldNotes,
  oldDated,
  onlyReader,
  locale,
  userId,
  closeLabel,
  t,
}: {
  sessionId: string;
  mine: MyReflection | null;
  oldNotes: readonly OldCoffeeNote[];
  /** RAW with "{date}": the date line of a note per coffee. */
  oldDated: string;
  /** Nobody else reads it: a solo cupping, or the reader is the organizer. */
  onlyReader: boolean;
  locale: string;
  /** The user the page was rendered for (the shared-device guard). */
  userId: string;
  /** The close button of the delete confirmation. */
  closeLabel: string;
  t: ReflectionStrings;
}) {
  const titleId = useId();
  if (mine) {
    return (
      <section className="flex flex-col gap-3 font-sans md:gap-4" aria-labelledby={titleId} data-reflection="">
        <PaperSectionHeading id={titleId} title={t.title} flush />
        <ReflectionEditor
          sessionId={sessionId}
          mine={mine}
          labelledBy={titleId}
          who={onlyReader ? t.whoSolo : t.who}
          locale={locale}
          userId={userId}
          closeLabel={closeLabel}
          t={t}
        />
      </section>
    );
  }
  if (oldNotes.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 font-sans md:gap-4" aria-labelledby={titleId} data-reflection="">
      <PaperSectionHeading id={titleId} title={t.oldTitle} flush />
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 md:gap-4">
        {oldNotes.map((n) => (
          <li key={n.id} className="flex min-w-0 flex-col gap-2">
            <PaperSectionHeading
              level={3}
              flush
              title={
                <>
                  {n.label}
                  {n.name ? (
                    <span className="font-sans text-body font-normal text-on-surface-variant"> {n.name}</span>
                  ) : null}
                </>
              }
            />
            <PostCloseNoteReadOnly text={n.text} at={n.at} locale={locale} dated={oldDated} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReflectionEditor({
  sessionId,
  mine,
  labelledBy,
  who,
  locale,
  userId,
  closeLabel,
  t,
}: {
  sessionId: string;
  mine: MyReflection;
  labelledBy: string;
  who: string;
  locale: string;
  userId: string;
  closeLabel: string;
  t: ReflectionStrings;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const hintId = useId();
  // The saved value shown right away; the server render catches up after refresh().
  const [saved, setSaved] = useState<MyReflection>(mine);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mine.text ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Edit, Save, Cancel and Delete each replace the control that had focus: say
  // where focus goes next, and move it once the new control is on the page.
  const textRef = useRef<HTMLTextAreaElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const focusNext = useRef<"text" | "edit" | null>(null);
  useEffect(() => {
    const next = focusNext.current;
    focusNext.current = null;
    if (next === "text") textRef.current?.focus();
    else if (next === "edit") actionsRef.current?.querySelector("button")?.focus();
  });

  const save = async (text: string) => {
    setSaving(true);
    await feedback.run(setSessionReflection(sessionId, text, userId), (data) => {
      focusNext.current = data.text === null ? "text" : "edit";
      setSaved(data);
      setDraft(data.text ?? "");
      setEditing(false);
      router.refresh();
    });
    setSaving(false);
  };

  if (saved.text !== null && !editing) {
    return (
      <Card tone="quiet" padding="compact">
        <div className="flex flex-col gap-2">
          <p className="font-sans text-caption text-on-surface-variant" suppressHydrationWarning>
            {t.written.replace("{date}", formatNoteDate(saved.at, locale))}
          </p>
          <p className="whitespace-pre-wrap font-sans text-body text-on-surface">{saved.text}</p>
          <p className="font-sans text-caption text-on-surface-variant">{who}</p>
          <div ref={actionsRef} className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                focusNext.current = "text";
                setEditing(true);
              }}
            >
              {t.edit}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setConfirmRemove(true)}>
              {t.remove}
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmRemove}
          onOpenChange={setConfirmRemove}
          title={t.removeTitle}
          body={t.removeBody}
          confirmLabel={t.remove}
          cancelLabel={t.cancel}
          closeLabel={closeLabel}
          onConfirm={() => save("")}
        />
      </Card>
    );
  }

  return (
    <Card tone="quiet" padding="compact">
      <div className="flex flex-col gap-2">
        <textarea
          ref={textRef}
          value={draft}
          maxLength={SESSION_REFLECTION_MAX}
          rows={4}
          placeholder={t.placeholder}
          aria-labelledby={labelledBy}
          aria-describedby={hintId}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-input border border-outline-variant bg-surface px-3 py-2 font-sans text-body text-on-surface"
        />
        <p id={hintId} className="font-sans text-caption text-on-surface-variant">
          {t.hint} {who}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" disabled={saving || draft.trim() === ""} onClick={() => void save(draft)}>
            {saving ? t.saving : t.save}
          </Button>
          {saved.text !== null ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                focusNext.current = "edit";
                setDraft(saved.text ?? "");
                setEditing(false);
              }}
            >
              {t.cancel}
            </Button>
          ) : null}
          <span className="ml-auto font-mono text-caption text-on-surface-variant">
            {draft.length}/{SESSION_REFLECTION_MAX}
          </span>
        </div>
      </div>
    </Card>
  );
}
