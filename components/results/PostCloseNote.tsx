"use client";

// What people wrote after a session closed, READ-ONLY: a reflection about the
// tasting (OR-D, 2026-11-21) or, in a tasting from before that change, a note
// per coffee (S10 WP4b). Text only; it changes no score. The one editor is in
// Reflection.tsx.

import { Card, PaperSectionHeading } from "@/components/ui";

/** The words of the notes per coffee. `added` is RAW with "{date}". */
export type PostCloseNoteTranslations = { added: string; ownerTitle: string; ownerIntro: string };

function formatAt(at: string | null, locale: string): string {
  if (!at) return "";
  return new Date(at).toLocaleDateString(locale === "es" ? "es-CO" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** A text written after the close, labelled with its date. `dated` is RAW with "{date}". */
export function PostCloseNoteReadOnly({
  text,
  at,
  locale,
  dated,
}: {
  text: string;
  at: string | null;
  locale: string;
  dated: string;
}) {
  return (
    <Card tone="quiet" padding="compact">
      <p className="font-sans text-caption text-on-surface-variant" suppressHydrationWarning>
        {dated.replace("{date}", formatAt(at, locale))}
      </p>
      <p className="mt-1 whitespace-pre-wrap font-sans text-body text-on-surface">{text}</p>
    </Card>
  );
}

export type OwnerNoteItem = {
  key: string;
  /** Who wrote it (and, for a note per coffee, which sample). */
  heading: string;
  text: string;
  at: string | null;
};

/** The organizer's ONE notes block: what the other cuppers wrote after the close. */
export function PostCloseNotesOwnerList({
  title,
  intro,
  dated,
  items,
  locale,
}: {
  title: string;
  intro: string;
  /** RAW with "{date}". */
  dated: string;
  items: OwnerNoteItem[];
  locale: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <div>
        <PaperSectionHeading title={title} flush />
        <p className="mt-1 font-sans text-caption text-on-surface-variant">{intro}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.key} className="flex flex-col gap-1">
            <p className="font-sans text-caption font-semibold text-on-surface">{i.heading}</p>
            <PostCloseNoteReadOnly text={i.text} at={i.at} locale={locale} dated={dated} />
          </li>
        ))}
      </ul>
    </section>
  );
}
