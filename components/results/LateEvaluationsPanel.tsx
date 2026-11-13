"use client";

// S10 WP4b (Kim C1, `TODO(kim-validar:C1)`): "Evaluaciones recibidas tarde". The
// session OWNER sees every complete draft the close left out and decides, one by
// one, whether to include it. The rows come from `buildOwnerLateRows`
// (lib/lateContributions.ts), which only produces them for the owner lens, so a
// participant's page never carries another cupper's name or count.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { acceptLateEvaluation } from "@/app/actions/community";
import type { OwnerLateRow } from "@/lib/lateContributions";

export type LateEvaluationsTranslations = {
  title: string;
  intro: string;
  /** RAW with "{date}". */
  savedAt: string;
  receivedAfterClose: string;
  accept: string;
  confirmTitle: string;
  /** RAW with "{name}" and "{sample}". */
  confirmBody: string;
  confirm: string;
  cancel: string;
  close: string;
  error: string;
};

export function LateEvaluationsPanel({
  rows,
  locale,
  translations: t,
}: {
  rows: OwnerLateRow[];
  locale: string;
  translations: LateEvaluationsTranslations;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<OwnerLateRow | null>(null);
  const dateFmt = new Intl.DateTimeFormat(locale === "es" ? "es-CO" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="mx-4 mt-4 flex flex-col gap-3 rounded-card border border-secondary/30 bg-secondary-container/20 p-4 lg:mx-6">
      <h2 className="font-display text-xl text-primary-container">{t.title}</h2>
      <p className="font-sans text-sm text-on-surface-variant">{t.intro}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.evaluationId}
            className="flex flex-wrap items-center gap-2 rounded-card border border-outline-variant bg-surface px-3 py-2"
          >
            <div className="min-w-[180px] flex-1">
              <p className="font-sans text-sm font-semibold text-on-surface">
                {r.cupperName} · {r.sampleLabel}
              </p>
              <p className="font-sans text-xs text-on-surface-variant" suppressHydrationWarning>
                {t.savedAt.replace("{date}", dateFmt.format(new Date(r.savedAt)))}
              </p>
            </div>
            {r.receivedAfterClose && <Badge tone="accent">{t.receivedAfterClose}</Badge>}
            <Button size="sm" variant="secondary" onClick={() => setTarget(r)}>
              {t.accept}
            </Button>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => {
          if (!o) setTarget(null);
        }}
        title={t.confirmTitle}
        body={
          target
            ? t.confirmBody.replace("{name}", target.cupperName).replace("{sample}", target.sampleLabel)
            : ""
        }
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        destructive={false}
        error={t.error}
        onConfirm={async () => {
          if (!target) return;
          const r = await acceptLateEvaluation(target.evaluationId);
          if (r.ok) router.refresh();
          return r;
        }}
      />
    </section>
  );
}
