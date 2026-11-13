"use client";

// S10 WP4b (Kim C2, `TODO(kim-validar:C2)`): a text note a cupper adds to their OWN
// submitted evaluation after the session closed. Text only, never a rating; it
// changes no score. Mounted under the personal drill-down (kept out of
// SampleDetail's score area). Also exports the read-only line the owner sees for
// another cupper's note.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useActionFeedback } from "@/components/ui";
import { setPostCloseNote } from "@/app/actions/community";
import {
  POST_CLOSE_NOTE_MAX,
  type CupperPostCloseNote,
  type MyPostCloseNote,
} from "@/lib/lateContributions";

export type PostCloseNoteTranslations = {
  add: string;
  edit: string;
  remove: string;
  placeholder: string;
  hint: string;
  save: string;
  saving: string;
  cancel: string;
  /** RAW with "{date}". */
  added: string;
  ownerTitle: string;
  ownerIntro: string;
};

function formatAt(at: string | null, locale: string): string {
  if (!at) return "";
  return new Date(at).toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The cupper's own note on one sample (their own submitted evaluation). */
export function PostCloseNoteEditor({
  note,
  locale,
  userId,
  translations: t,
}: {
  note: MyPostCloseNote;
  locale: string;
  /** The user the page was rendered for (shared-device guard). */
  userId: string;
  translations: PostCloseNoteTranslations;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text ?? "");
  const [saving, setSaving] = useState(false);
  // The saved value shown right away; the server render catches up after refresh().
  const [saved, setSaved] = useState<{ text: string | null; at: string | null }>({
    text: note.text,
    at: note.at,
  });

  const save = async (text: string) => {
    setSaving(true);
    const r = await feedback.run(setPostCloseNote(note.evaluationId, text, userId), (data) => {
      setSaved({ text: data.text, at: data.at });
      setEditing(false);
      router.refresh();
    });
    setSaving(false);
    return r.ok;
  };

  if (!editing) {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-outline-variant bg-surface-container-low p-3">
        {saved.text ? (
          <>
            <p className="font-sans text-xs text-on-surface-variant" suppressHydrationWarning>
              {t.added.replace("{date}", formatAt(saved.at, locale))}
            </p>
            <p className="whitespace-pre-wrap font-sans text-sm text-on-surface">{saved.text}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setDraft(saved.text ?? ""); setEditing(true); }}>
                {t.edit}
              </Button>
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => void save("")}>
                {t.remove}
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" variant="secondary" className="w-fit" onClick={() => { setDraft(""); setEditing(true); }}>
            {t.add}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-outline-variant bg-surface-container-low p-3">
      <label className="flex flex-col gap-1">
        <span className="font-sans text-xs text-on-surface-variant">{t.hint}</span>
        <textarea
          value={draft}
          maxLength={POST_CLOSE_NOTE_MAX}
          rows={4}
          placeholder={t.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-input border border-outline-variant bg-surface px-3 py-2 font-sans text-sm text-on-surface"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={saving} onClick={() => void save(draft)}>
          {saving ? t.saving : t.save}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
          {t.cancel}
        </Button>
        <span className="ml-auto font-mono text-[10px] text-on-surface-variant">
          {draft.length}/{POST_CLOSE_NOTE_MAX}
        </span>
      </div>
    </div>
  );
}

/** Owner only: every note other cuppers added after the close, under the per-cupper section. */
export function PostCloseNotesOwnerList({
  byCupper,
  cupperNames,
  sampleLabels,
  locale,
  translations: t,
}: {
  byCupper: Record<string, Record<string, CupperPostCloseNote>>;
  cupperNames: Record<string, string>;
  sampleLabels: Record<string, string>;
  locale: string;
  translations: PostCloseNoteTranslations;
}) {
  const items = Object.entries(byCupper).flatMap(([cupperId, bySample]) =>
    Object.entries(bySample).map(([sampleId, note]) => ({
      key: `${cupperId}:${sampleId}`,
      who: cupperNames[cupperId] ?? "",
      sample: sampleLabels[sampleId] ?? "",
      note,
    })),
  );
  if (items.length === 0) return null;
  items.sort((a, b) => a.who.localeCompare(b.who) || a.sample.localeCompare(b.sample));
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl text-primary-container">{t.ownerTitle}</h2>
      <p className="font-sans text-sm text-on-surface-variant">{t.ownerIntro}</p>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.key} className="flex flex-col gap-1">
            <p className="font-sans text-sm font-semibold text-on-surface">
              {i.who} · {i.sample}
            </p>
            <PostCloseNoteReadOnly text={i.note.text} at={i.note.at} locale={locale} translations={t} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the owner reads of ANOTHER cupper's note (read-only, labelled with its date). */
export function PostCloseNoteReadOnly({
  text,
  at,
  locale,
  translations: t,
}: {
  text: string;
  at: string | null;
  locale: string;
  translations: PostCloseNoteTranslations;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-outline-variant bg-surface-container-low p-3">
      <p className="font-sans text-xs text-on-surface-variant" suppressHydrationWarning>
        {t.added.replace("{date}", formatAt(at, locale))}
      </p>
      <p className="whitespace-pre-wrap font-sans text-sm text-on-surface">{text}</p>
    </div>
  );
}
