"use client";

// S10 WP4b (Kim C1, `TODO(kim-validar:C1)`): "Evaluaciones recibidas tarde". The
// session OWNER sees every complete draft the close left out and decides, one by
// one, whether to include it, INFORMED: the evaluation's own total, the difference
// from the group, the 8 ratings on demand, and a label decided by the server
// (saved before the close, or received after it: it may have been written after
// seeing the results). The rows come from `buildOwnerLateRows`
// (lib/lateContributions.ts), which only produces them for the owner lens, so a
// participant's page never carries another cupper's name, score or count.
// Accepting sends the `updatedAt` the page rendered: a changed row answers
// `conflict` and nothing is flipped.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button, Badge, Card, PaperSectionHeading, TextAction } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { acceptLateEvaluation } from "@/app/actions/community";
import type { OwnerLateRow } from "@/lib/lateContributions";

export type LateEvaluationsTranslations = {
  title: string;
  intro: string;
  /** RAW with "{date}". */
  savedAt: string;
  savedBeforeClose: string;
  receivedLate: string;
  /** RAW with "{score}". */
  score: string;
  scorePartial: string;
  /** RAW with "{diff}". */
  diff: string;
  showRatings: string;
  hideRatings: string;
  oldRule: string;
  stale: string;
  /** attribute id -> localized label. */
  attributeLabels: Record<string, string>;
  accept: string;
  confirmTitle: string;
  /** RAW with "{name}" and "{sample}". */
  confirmBody: string;
  confirm: string;
  cancel: string;
  close: string;
  error: string;
};

const num = (n: number) => n.toFixed(2);
const signed = (n: number) => `${n > 0 ? "+" : ""}${num(n)}`;

function Label({ row, t }: { row: OwnerLateRow; t: LateEvaluationsTranslations }) {
  return row.receivedLate ? (
    <p className="flex items-start gap-1.5 font-sans text-caption font-medium text-warning">
      <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" />
      <span>{t.receivedLate}</span>
    </p>
  ) : (
    // in its own box: a badge is as wide as its words, not as the row
    <div>
      <Badge tone="neutral">{t.savedBeforeClose}</Badge>
    </div>
  );
}

function Numbers({ row, t }: { row: OwnerLateRow; t: LateEvaluationsTranslations }) {
  return (
    <>
      <p className="font-sans text-caption text-on-surface">
        {row.individualScore === null ? t.scorePartial : t.score.replace("{score}", num(row.individualScore))}
      </p>
      {row.diff !== null && (
        <p className="font-sans text-caption text-on-surface-variant">{t.diff.replace("{diff}", signed(row.diff))}</p>
      )}
    </>
  );
}

export function LateEvaluationsPanel({
  rows,
  locale,
  translations: t,
  embedded = false,
}: {
  rows: OwnerLateRow[];
  locale: string;
  translations: LateEvaluationsTranslations;
  /** Inside the organizer's Panel (R5): a card of the Panel, with no margins of its own. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<OwnerLateRow | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const dateFmt = new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    // P2d: a section heading, then the rows in ONE card, divided by hairlines (cards
    // do not nest); the fallback above the tabs is no longer a terracotta banner.
    <section className={embedded ? "flex flex-col gap-3" : "mx-4 mt-4 flex flex-col gap-3 lg:mx-6"} data-panel-section="late">
      <div>
        <PaperSectionHeading title={t.title} flush />
        <p className="mt-1 font-sans text-caption text-on-surface-variant">{t.intro}</p>
      </div>
      <Card padding="compact">
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li
            key={r.evaluationId}
            className="flex flex-col gap-2 border-t border-outline-variant py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[180px] flex-1">
                <p className="font-sans text-caption font-semibold text-on-surface">
                  {r.cupperName} · {r.sampleLabel}
                </p>
                <p className="font-sans text-caption text-on-surface-variant" suppressHydrationWarning>
                  {t.savedAt.replace("{date}", dateFmt.format(new Date(r.savedAt)))}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setTarget(r)}>
                {t.accept}
              </Button>
            </div>
            <Label row={r} t={t} />
            <Numbers row={r} t={t} />
            <TextAction
              aria-expanded={open === r.evaluationId}
              onClick={() => setOpen(open === r.evaluationId ? null : r.evaluationId)}
              className="w-fit justify-start"
            >
              {open === r.evaluationId ? t.hideRatings : t.showRatings}
            </TextAction>
            {open === r.evaluationId && (
              <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {r.ratings.map((a) => (
                  <li key={a.id} className="flex justify-between font-sans text-caption text-on-surface">
                    <span>{t.attributeLabels[a.id] ?? a.id}</span>
                    <span className="tabular-nums">{a.value ?? "–"}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      </Card>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        title={t.confirmTitle}
        body={
          target ? (
            <div className="space-y-2">
              <p>{t.confirmBody.replace("{name}", target.cupperName).replace("{sample}", target.sampleLabel)}</p>
              <Numbers row={target} t={t} />
              <Label row={target} t={t} />
              {target.oldRule && <p className="text-on-surface-variant">{t.oldRule}</p>}
            </div>
          ) : (
            ""
          )
        }
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        destructive={false}
        error={t.error}
        errorMessages={{ conflict: t.stale }}
        onConfirm={async () => {
          if (!target) return;
          const r = await acceptLateEvaluation(target.evaluationId, target.updatedAt);
          // Accepted, or the row changed under us: either way show the current page.
          if (r.ok || r.error === "conflict") router.refresh();
          return r;
        }}
      />
    </section>
  );
}
