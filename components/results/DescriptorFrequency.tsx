"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { PERCEPTUAL_BLOCKS } from "@/lib/descriptors";

export type RankedDescriptor = {
  id: string;
  label: string;
  color: string;
  count: number;
};

export type SampleBlockFreq = {
  sampleId: string;
  label: string;
  totalEvaluators: number;
  /** Ranked descriptors per perceptual block id. */
  blocks: Record<string, RankedDescriptor[]>;
  /** Statistical summary sentence per block id (null → render empty state). */
  summary: Record<string, string | null>;
};

export type DescriptorTranslations = {
  viewAll: string;
  of: string;
  participants: string;
  emptyBlock: string;
  emptyAll: string;
  close: string;
};

const TOP_N = 5;
// Bars keep a consensus threshold so the visual isn't noisy, but the block
// itself never disappears (empty state renders instead). The statistical
// summary above the bars uses the FULL data (all counts) via `summary`.
const BAR_MIN_COUNT = 2;

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
  blockLabels,
  t,
}: {
  samples: SampleBlockFreq[];
  blockLabels: Record<string, string>;
  t: DescriptorTranslations;
}) {
  // All perceptual blocks are ALWAYS shown, in fixed order — no block silently
  // disappears just because data is sparse (N15, Step 1). Empty blocks render
  // an explicit "Sin descriptores en común" state instead.
  const blocks = PERCEPTUAL_BLOCKS;

  const [blockId, setBlockId] = useState<string>(blocks[0]?.id ?? "");
  const [openSampleId, setOpenSampleId] = useState<string | null>(null);

  const activeBlock = blocks.some((b) => b.id === blockId) ? blockId : blocks[0].id;

  const openSample = samples.find((s) => s.sampleId === openSampleId) ?? null;
  const modalDescriptors = openSample?.blocks[activeBlock] ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Block subtabs */}
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        role="tablist"
        aria-label="Bloques"
      >
        {blocks.map((block) => {
          const active = block.id === activeBlock;
          return (
            <button
              key={block.id}
              role="tab"
              aria-selected={active}
              onClick={() => setBlockId(block.id)}
              className={`shrink-0 whitespace-nowrap rounded-pill px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-container text-on-primary"
                  : "border border-outline-variant text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {blockLabels[block.id] ?? block.id}
            </button>
          );
        })}
      </div>

      {/* Per-sample grid for the active block */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {samples.map((sample) => {
          const all = sample.blocks[activeBlock] ?? [];
          const bars = all.filter((d) => d.count >= BAR_MIN_COUNT);
          const top = bars.slice(0, TOP_N);
          const hasMore = bars.length > TOP_N;
          const summary = sample.summary[activeBlock] ?? null;

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

              {/* Statistical summary sentence (uses full data, not the bar threshold) */}
              {summary && (
                <p className="text-sm text-on-surface mb-3 leading-snug">{summary}</p>
              )}

              {top.length === 0 ? (
                <p className="text-sm text-on-surface-variant italic py-1">
                  {t.emptyBlock}
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
                      {t.viewAll} ({bars.length})
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
        subtitle={blockLabels[activeBlock]}
        closeLabel={t.close}
      >
        {openSample && (
          <Bars
            descriptors={modalDescriptors.filter((d) => d.count >= BAR_MIN_COUNT)}
            total={openSample.totalEvaluators}
            ofLabel={t.of}
          />
        )}
      </ResponsiveDialog>
    </div>
  );
}
