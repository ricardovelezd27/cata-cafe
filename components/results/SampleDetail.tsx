"use client";

/**
 * Personal per-sample drill-down: the six N15 perceptual blocks (Nariz, Boca,
 * Gusto predominante, Acidez, Dulzura, Sensación), each collapsible, plus the
 * Global row, extrinsic data, and the CVA score box with its transparency
 * panel. Ported from `MyResultsSummary`'s per-sample card body — same visual
 * hierarchy (uppercase 11px block headers, chevron disclosure, pill
 * descriptors) — but driven by the shared `PERCEPTUAL_BLOCKS` table (with its
 * `.attrs`) instead of a private copy, and fully tokenized (MD3 classes, no
 * hex) instead of inline styles.
 *
 * Host-agnostic: renders its own sample-label header, so it can be dropped
 * into a dialog body (see `SampleDetailDialog`) or embedded standalone.
 */

import { useState } from "react";
import { ChevronDown, Pencil } from "lucide-react";
import { calcIndividualBreakdown, calcIndividualScore } from "@/lib/scoring";
import {
  resolveDescriptor,
  resolveMainTaste,
  collectDescriptors,
  PERCEPTUAL_BLOCKS,
  type PerceptualBlockId,
} from "@/lib/descriptors";
import { ScoreBreakdownPanel, type ScoreBreakdownTranslations } from "@/components/results/ScoreBreakdownPanel";
import { ExtrinsicSummary } from "@/components/results/ExtrinsicSummary";
import { ScorePill, Button } from "@/components/ui";
import type { SessionFormat } from "@/lib/constants";

type Lang = "es" | "en";
type PerceptualBlock = (typeof PERCEPTUAL_BLOCKS)[number];

/** Every string SampleDetail renders — sourced from `results.detail.*` in the
 * message files. Never a private bilingual dictionary. */
export type SampleDetailTranslations = {
  fragrance: string;
  aroma: string;
  flavor: string;
  aftertaste: string;
  acidity: string;
  sweetness: string;
  mouthfeel: string;
  overall: string;
  intensity: string;
  quality: string;
  notes: string;
  cvaScore: string;
  edit: string;
  noData: string;
  nariz: string;
  boca: string;
  gusto: string;
  acidezBlock: string;
  dulzura: string;
  sensacionBlock: string;
  descriptorSingular: string;
  descriptorPlural: string;
  avgQuality: string;
  noBlockData: string;
  breakdown: ScoreBreakdownTranslations;
};

// Keys of SampleDetailTranslations whose value is a plain string — excludes
// `breakdown` (a nested ScoreBreakdownTranslations object), so block/row
// label lookups can never resolve to a non-string value.
type StringTKey = {
  [K in keyof SampleDetailTranslations]: SampleDetailTranslations[K] extends string ? K : never;
}[keyof SampleDetailTranslations];

// Perceptual-block id -> the translation key for its collapsible header. Not
// the same key set as the attribute-row labels below (e.g. "acidez" the
// block heading is "Acidez" while its row label "Acidez" reuses a distinct
// key too — kept separate so the block heading and the attribute name can
// diverge, as they already do for "dulzura"/"Dulzor" and
// "sensacionBlock"/"mouthfeel").
const BLOCK_HEADER_KEY: Record<PerceptualBlockId, StringTKey> = {
  nariz: "nariz",
  boca: "boca",
  gusto: "gusto",
  acidez: "acidezBlock",
  dulzura: "dulzura",
  sensacion: "sensacionBlock",
};

// Attribute id (from PERCEPTUAL_BLOCKS[].attrs) -> the translation key for
// its row label.
const ROW_LABEL_KEY: Record<string, StringTKey> = {
  fragancia: "fragrance",
  aroma: "aroma",
  sabor: "flavor",
  sabor_residual: "aftertaste",
  acidez: "acidity",
  dulzor: "sweetness",
  sensacion: "mouthfeel",
};

function num(data: Record<string, unknown>, key: string): number | null {
  const v = data[key];
  return typeof v === "number" && v > 0 ? v : null;
}

function idsAt(data: Record<string, unknown>, key: string): string[] {
  const v = data[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Collapsed-row summary for a perceptual block: distinct descriptor count
 * (descriptive/combined formats, or the taste block) via the same
 * `collectDescriptors` union the rest of the app uses, otherwise an average
 * quality summary (affective-only format has no descriptor arrays at all).
 */
function blockSummaryText(
  data: Record<string, unknown>,
  block: PerceptualBlock,
  showDescriptive: boolean,
  showAffective: boolean,
  t: SampleDetailTranslations,
): string {
  if (block.kind === "taste") {
    const count = collectDescriptors(data, block.descKeys).length;
    if (count === 0) return t.noBlockData;
    return `${count} ${count === 1 ? t.descriptorSingular : t.descriptorPlural}`;
  }
  if (showDescriptive) {
    const ids = collectDescriptors(data, block.descKeys);
    if (ids.length === 0) return t.noBlockData;
    return `${ids.length} ${ids.length === 1 ? t.descriptorSingular : t.descriptorPlural}`;
  }
  if (showAffective) {
    const values = (block.attrs ?? [])
      .map((attr) => (attr.affKey ? num(data, `${attr.affKey}_final`) : null))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return t.noBlockData;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    return `${t.avgQuality}: ${avg.toFixed(1)}`;
  }
  return t.noBlockData;
}

// Descriptor pills for one attribute row. Child-wins dedup: drop a parent
// flavor-wheel family pill when any of its sub-items are also selected (e.g.
// hide "Nueces/Cacao" once "Nueces" and "Cacao" are both present), so the
// same descriptor never renders twice at two levels of specificity.
function DescriptorPills({ ids, locale }: { ids: string[]; locale: Lang }) {
  const parentsWithChildren = new Set(
    ids.filter((id) => id.includes(":")).map((id) => id.split(":")[0]),
  );
  const visible = ids.filter((id) => id.includes(":") || !parentsWithChildren.has(id));

  if (visible.length === 0) {
    return <span className="text-xs text-on-surface-variant">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {visible.map((id) => {
        const info = resolveDescriptor(id, locale);
        if (!info) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: info.color }}
          >
            {info.label}
          </span>
        );
      })}
    </span>
  );
}

function TastePills({ ids, locale }: { ids: string[]; locale: Lang }) {
  if (ids.length === 0) {
    return <span className="text-xs text-on-surface-variant">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {ids.map((id) => {
        const info = resolveMainTaste(id, locale);
        if (!info) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: info.color }}
          >
            {info.label}
          </span>
        );
      })}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      <span
        className={`text-[13px] font-bold tabular-nums ${
          value !== null ? "text-on-surface" : "text-on-surface-variant"
        }`}
      >
        {value !== null ? value : "—"}
      </span>
    </span>
  );
}

const rowClass =
  "grid grid-cols-[92px_1fr_auto] items-center gap-2.5 border-t border-outline-variant py-2";

export function SampleDetail({
  sampleLabel,
  coffeeName,
  descriptive,
  affective,
  combined,
  extrinsic,
  format,
  cupsPerSample,
  locale,
  onEdit,
  t,
}: {
  sampleLabel: string;
  coffeeName?: string | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  extrinsic: Record<string, unknown>;
  format: SessionFormat;
  cupsPerSample: number;
  locale: string;
  onEdit?: () => void;
  t: SampleDetailTranslations;
}) {
  const lang: Lang = locale === "en" ? "en" : "es";
  const showDescriptive = format !== "affective";
  const showAffective = format !== "descriptive";
  const showCVA = showAffective;

  // Per-block disclosure state, keyed by block id — this component always
  // covers exactly one sample, so no sample-id prefix is needed. Tracked as
  // the closed set so every block renders expanded by default.
  const [closedBlocks, setClosedBlocks] = useState<Set<string>>(new Set());
  const toggleBlock = (id: string) => {
    setClosedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const data =
    format === "affective" ? affective : format === "descriptive" ? descriptive : combined;

  const filled = Object.values(data).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "" && v !== 0,
  );

  const cva = showCVA && filled ? calcIndividualScore(data, cupsPerSample) : null;
  const cvaNum = typeof cva === "number" ? cva : null;
  const overallScore = num(data, "impresion_global_final");
  const overallNotes = (data["impresion_global_notas"] as string | undefined)?.trim() ?? "";

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0 flex-1 font-display text-lg font-medium leading-tight text-primary-container">
          {sampleLabel}
          {coffeeName && (
            <span className="font-sans text-sm font-normal text-on-surface-variant">
              {" "}
              · {coffeeName}
            </span>
          )}
        </div>
        {onEdit && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Pencil size={13} aria-hidden />}
            onClick={onEdit}
            className="shrink-0"
          >
            {t.edit}
          </Button>
        )}
      </div>

      {/* Extrinsic data (origin/process/trade) — self-guards when empty */}
      <ExtrinsicSummary data={extrinsic} />

      {!filled ? (
        <div className="py-2 text-xs text-on-surface-variant">{t.noData}</div>
      ) : (
        <>
          <div>
            {PERCEPTUAL_BLOCKS.map((block) => {
              // Gusto predominante is descriptive-only; hide it for affective.
              if (block.kind === "taste" && !showDescriptive) return null;
              const isOpen = !closedBlocks.has(block.id);
              const summaryText = blockSummaryText(data, block, showDescriptive, showAffective, t);

              return (
                <div key={block.id}>
                  <button
                    type="button"
                    onClick={() => toggleBlock(block.id)}
                    aria-expanded={isOpen}
                    className="mt-3 flex min-h-[36px] w-full items-center justify-between gap-2 py-1 text-left"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      {t[BLOCK_HEADER_KEY[block.id]]}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-on-surface-variant">
                        {summaryText}
                      </span>
                      <ChevronDown
                        size={14}
                        aria-hidden
                        className={`text-on-surface-variant transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </button>

                  {!isOpen ? null : block.kind === "taste" ? (
                    <div className={rowClass}>
                      <span className="font-display text-sm font-semibold text-primary-container">
                        {t.gusto}
                      </span>
                      <span className="min-w-0">
                        <TastePills ids={idsAt(data, block.descKeys[0])} locale={lang} />
                      </span>
                      <span />
                    </div>
                  ) : (
                    (block.attrs ?? []).map((attr) => {
                      const rowKey = ROW_LABEL_KEY[attr.id];
                      const intensity = showDescriptive ? num(data, `${attr.id}_int`) : null;
                      const quality =
                        showAffective && attr.affKey ? num(data, `${attr.affKey}_final`) : null;
                      const ids = showDescriptive && attr.descKey ? idsAt(data, attr.descKey) : [];
                      const noteKey = showDescriptive
                        ? `${attr.id}_notas`
                        : attr.affKey
                          ? `${attr.affKey}_notas`
                          : null;
                      const note = noteKey ? ((data[noteKey] as string | undefined)?.trim() ?? "") : "";
                      return (
                        <div key={attr.id}>
                          <div className={rowClass}>
                            <span className="font-display text-sm font-semibold text-primary-container">
                              {rowKey ? t[rowKey] : attr.label[lang]}
                            </span>
                            <span className="min-w-0">
                              {showDescriptive ? (
                                <DescriptorPills ids={ids} locale={lang} />
                              ) : (
                                <span className="text-xs text-on-surface-variant">—</span>
                              )}
                            </span>
                            <span className="flex flex-col items-end gap-0.5">
                              {showDescriptive && <StatChip label={t.intensity} value={intensity} />}
                              {showAffective && <StatChip label={t.quality} value={quality} />}
                            </span>
                          </div>
                          {note && (
                            <div className="pb-2 pl-[102px] text-xs text-on-surface">
                              <span className="mr-1.5 text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant">
                                {t.notes}
                              </span>
                              {note}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}

            {/* Global */}
            {showAffective && (
              <div className={`${rowClass} items-start`}>
                <span className="font-display text-sm font-semibold text-primary-container">
                  {t.overall}
                </span>
                <span className="min-w-0 text-xs text-on-surface">
                  {overallNotes && (
                    <>
                      <span className="mr-1.5 text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant">
                        {t.notes}
                      </span>
                      {overallNotes}
                    </>
                  )}
                </span>
                <span className="flex flex-col items-end gap-0.5">
                  <StatChip label={t.quality} value={overallScore} />
                </span>
              </div>
            )}
          </div>

          {/* CVA total */}
          {showCVA && (
            <>
              <div className="mt-3 flex items-center justify-between rounded-card border border-outline-variant bg-surface-container px-4 py-2.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary-container">
                  {t.cvaScore}
                </span>
                <ScorePill score={cvaNum} />
              </div>
              {cvaNum !== null && (
                <ScoreBreakdownPanel
                  variant="individual"
                  breakdown={calcIndividualBreakdown(data, cupsPerSample)}
                  setup={{
                    cupsPerSample,
                    uniformityTracked: cupsPerSample >= 5,
                    roundingEnforced: true,
                  }}
                  t={t.breakdown}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
