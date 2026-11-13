"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { lw, warmupById } from "@/lib/warmup/exercises";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useActionFeedback } from "@/components/ui/Toast";
import { deleteWarmupReflection, saveWarmupReflection } from "@/app/actions/warmup";
import type { WarmupReflectionRow } from "@/lib/warmup/reflectionsData";

export interface ReflectionStrings {
  title: string;
  private: string;
  empty: string;
  delete: string;
  deleteTitle: string;
  deleteBody: string;
  deleteConfirm: string;
  deleteCancel: string;
  deleteFailed: string;
}

/** Library route body: back link + the player inline (full-screen below md) +
 *  the person's own saved reflections for this exercise (S10 WP7, Kim F2). */
export function WarmupExerciseRoute({
  exerciseId,
  locale,
  strings,
  backLabel,
  listHref,
  canSaveReflections,
  reflections,
  reflectionStrings,
}: {
  exerciseId: string;
  locale: string;
  strings: WarmupPlayerStrings;
  backLabel: string;
  listHref: string;
  canSaveReflections: boolean;
  reflections: WarmupReflectionRow[];
  reflectionStrings: ReflectionStrings;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [toDelete, setToDelete] = useState<string | null>(null);
  const exercise = warmupById(exerciseId);
  if (!exercise) return null;
  const leave = () => router.push(listHref);

  // The player calls this from the reflect phase; a failure toasts the
  // localized reason (errors.codes) and keeps the text on screen.
  const save = canSaveReflections
    ? async (answers: { feel: string; discovery: string }) => {
        const r = await feedback.run(saveWarmupReflection({ exerciseId: exercise.id, ...answers }), () => {
          router.refresh();
        });
        return r.ok;
      }
    : undefined;

  const dateFmt = new Intl.DateTimeFormat(locale === "en" ? "en" : "es", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-4 max-w-5xl">
      <Link
        href={listHref}
        className="inline-flex w-fit items-center gap-1 text-sm text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <ChevronLeft size={16} aria-hidden />
        {backLabel}
      </Link>
      <WarmupPlayer
        exercise={exercise}
        locale={locale}
        t={strings}
        inline
        mode="library"
        lengthChoice
        onSaveReflection={save}
        onFinish={leave}
        onExit={leave}
      />

      {canSaveReflections && (
        <section aria-labelledby="warmup-reflections" className="space-y-3 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="warmup-reflections" className="font-display text-xl text-on-surface">
              {reflectionStrings.title}
            </h2>
            <p className="text-sm text-on-surface-variant">{reflectionStrings.private}</p>
          </div>
          {reflections.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{reflectionStrings.empty}</p>
          ) : (
            <ul className="divide-y divide-outline-variant border-y border-outline-variant">
              {reflections.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs text-on-surface-variant">{dateFmt.format(new Date(r.createdAt))}</p>
                    {([r.feel, r.discovery] as const).map((answer, i) =>
                      answer ? (
                        <div key={i}>
                          <p className="text-xs font-medium text-on-surface-variant">{lw(exercise.closing[i], locale)}</p>
                          <p className="whitespace-pre-wrap break-words text-sm text-on-surface">{answer}</p>
                        </div>
                      ) : null,
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setToDelete(r.id)}
                    aria-label={reflectionStrings.delete}
                    className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-pill text-on-surface-variant transition-colors hover:bg-surface-container hover:text-error"
                  >
                    <Trash2 size={18} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => {
          if (!o) setToDelete(null);
        }}
        title={reflectionStrings.deleteTitle}
        body={reflectionStrings.deleteBody}
        confirmLabel={reflectionStrings.deleteConfirm}
        cancelLabel={reflectionStrings.deleteCancel}
        closeLabel={reflectionStrings.deleteCancel}
        error={reflectionStrings.deleteFailed}
        errorMessages={{ unknown: reflectionStrings.deleteFailed }}
        onConfirm={async () => {
          if (!toDelete) return;
          const r = await deleteWarmupReflection(toDelete);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </div>
  );
}
