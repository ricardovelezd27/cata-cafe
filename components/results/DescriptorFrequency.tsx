"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { DESCRIPTOR_STAGES } from "@/lib/descriptors";

export type RankedDescriptor = {
  id: string;
  label: string;
  color: string;
  count: number;
};

export type SampleStageFreq = {
  sampleId: string;
  label: string;
  totalEvaluators: number;
  stages: Record<string, RankedDescriptor[]>;
};

export type DescriptorTranslations = {
  viewAll: string;
  of: string;
  participants: string;
  emptyStage: string;
  emptyAll: string;
};

const TOP_N = 5;

function Bars({
  descriptors,
  total,
  ofLabel,
}: {
  descriptors: RankedDescriptor[];
  total: number;
  ofLabel: string;
}) {
  const maxCount = descriptors.length > 0 ? descriptors[0].count : 0;
  return (
    <div className="flex flex-col gap-2.5">
      {descriptors.map((d) => {
        const pct = maxCount > 0 ? Math.max(6, (d.count / maxCount) * 100) : 0;
        return (
          <div key={d.id}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-medium text-on-surface truncate">
                {d.label}
              </span>
              <span className="font-mono text-xs text-on-surface-variant tabular-nums shrink-0">
                {d.count} {ofLabel} {total}
              </span>
            </div>
            <div className="h-2.5 rounded-pill bg-surface-container-high overflow-hidden">
              <div
                className="h-full rounded-pill"
                style={{
                  width: `${pct}%`,
                  background: d.color,
                  transition: "width 0.3s cubic-bezier(0.2,0.8,0.2,1)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DescriptorFrequency({
  samples,
  stageLabels,
  t,
}: {
  samples: SampleStageFreq[];
  stageLabels: Record<string, string>;
  t: DescriptorTranslations;
}) {
  // Only show stages where at least one sample has a qualifying descriptor.
  const visibleStages = DESCRIPTOR_STAGES.filter((stage) =>
    samples.some((s) => (s.stages[stage.id]?.length ?? 0) > 0)
  );

  const [stageId, setStageId] = useState<string>(visibleStages[0]?.id ?? "");
  const [openSampleId, setOpenSampleId] = useState<string | null>(null);

  if (visibleStages.length === 0) {
    return (
      <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-6 text-sm text-on-surface-variant italic">
        {t.emptyAll}
      </div>
    );
  }

  // Guard against a stale selection if the visible set changed.
  const activeStage = visibleStages.some((s) => s.id === stageId)
    ? stageId
    : visibleStages[0].id;

  const openSample = samples.find((s) => s.sampleId === openSampleId) ?? null;
  const modalDescriptors = openSample?.stages[activeStage] ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Stage subtabs */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        role="tablist"
        aria-label="Etapas"
      >
        {visibleStages.map((stage) => {
          const active = stage.id === activeStage;
          return (
            <button
              key={stage.id}
              role="tab"
              aria-selected={active}
              onClick={() => setStageId(stage.id)}
              className={`shrink-0 whitespace-nowrap rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-container text-on-primary"
                  : "border border-outline-variant text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {stageLabels[stage.id] ?? stage.id}
            </button>
          );
        })}
      </div>

      {/* Per-sample grid for the active stage */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {samples.map((sample) => {
          const all = sample.stages[activeStage] ?? [];
          const top = all.slice(0, TOP_N);
          const hasMore = all.length > TOP_N;

          return (
            <div
              key={sample.sampleId}
              className="rounded-card border border-outline-variant bg-surface-container-lowest p-4 flex flex-col"
            >
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h3 className="font-display text-lg font-medium text-primary-container truncate">
                  {sample.label}
                </h3>
                {sample.totalEvaluators > 0 && (
                  <span className="font-mono text-xs text-on-surface-variant tabular-nums shrink-0">
                    {sample.totalEvaluators} {t.participants}
                  </span>
                )}
              </div>

              {top.length === 0 ? (
                <p className="text-sm text-on-surface-variant italic py-1">
                  {t.emptyStage}
                </p>
              ) : (
                <>
                  <Bars
                    descriptors={top}
                    total={sample.totalEvaluators}
                    ofLabel={t.of}
                  />
                  {hasMore && (
                    <button
                      onClick={() => setOpenSampleId(sample.sampleId)}
                      className="mt-3 inline-flex items-center gap-1 self-start text-sm font-medium text-primary-container hover:underline"
                    >
                      {t.viewAll} ({all.length})
                      <ChevronRight size={15} aria-hidden />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <ResponsiveDialog
        open={openSample !== null}
        onOpenChange={(o) => !o && setOpenSampleId(null)}
        title={openSample?.label ?? ""}
        subtitle={stageLabels[activeStage]}
      >
        {openSample && (
          <Bars
            descriptors={modalDescriptors}
            total={openSample.totalEvaluators}
            ofLabel={t.of}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
