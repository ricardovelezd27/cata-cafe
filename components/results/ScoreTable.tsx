"use client";

import { Check, ChevronRight, Eye } from "lucide-react";
import { calcIndividualScore, hasAffectiveData, scoreBand } from "@/lib/scoring";
import { deltasVsReference, formatSignedDelta, pickDisplayedScore } from "@/lib/referenceDelta";
import { AFFECTIVE_ATTRIBUTES, type SessionFormat } from "@/lib/constants";
import { DESCRIPTOR_STAGES, PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import { Badge, ScorePill } from "@/components/ui/Badge";
import type { SampleResult } from "@/app/[locale]/app/sessions/[id]/results/types";

export type ScoreTableTranslations = {
  sample: string;
  descriptiveSection: string;
  affectiveSection: string;
  cvaScore: string;
  communityShort: string;
  legendMine: string;
  legendCommunity: string;
  viewDetail: string;
  reveal: string;
  revealed: string;
  // Reference (control) sample labels — ResultsClient merges these in from
  // the top-level `results.*` translations (not part of page.tsx's `table`
  // sub-object), so they stay optional here.
  referenceBadge?: string;
  deltaVsReference?: string;
  deltaVsReferenceAria?: string;
  referenceLegend?: string;
};

/**
 * Descriptive column set derived from DESCRIPTOR_STAGES (lib/descriptors.ts) —
 * the single source of stage id/order shared with the server aggregation and
 * the descriptor subtabs — instead of a private copy living in this file.
 * Labels are pulled from PERCEPTUAL_BLOCKS.attrs, the other half of that same
 * single-source table, so id/order/label stay byte-identical to the pre-rewrite
 * DESCRIPTIVE_ATTRS constant (Fragancia, Aroma, Sabor, Regusto, Acidez, Dulzor,
 * Sensación — verified against lib/descriptors.ts).
 */
const ATTR_LABELS_ES: Record<string, string> = Object.fromEntries(
  PERCEPTUAL_BLOCKS.flatMap((block) => (block.attrs ?? []).map((attr) => [attr.id, attr.label.es] as const))
);

const DESCRIPTIVE_COLUMNS = DESCRIPTOR_STAGES.map((stage) => ({
  id: stage.id,
  label: ATTR_LABELS_ES[stage.id] ?? stage.id,
}));

function rowBgClass(rowIdx: number): string {
  return rowIdx % 2 === 0 ? "bg-surface-container-lowest" : "bg-surface-container-low";
}

function CvaCell({
  myScore,
  communityScore,
  showCommunity,
  u,
  d,
  delta,
  t,
}: {
  myScore: number | "—" | null;
  communityScore: number | null;
  showCommunity: boolean;
  u: number;
  d: number;
  // Δ vs. the reference sample, using the same displayed-score basis as this
  // cell — null for the reference row itself, unscored rows, or when there
  // is no reference sample at all.
  delta?: number | null;
  t: ScoreTableTranslations;
}) {
  const scoreNum = myScore !== null && myScore !== "—" ? myScore : null;
  const band = scoreNum !== null ? scoreBand(scoreNum) : null;
  const bandBorderClass =
    band === "green"
      ? "border-primary-container"
      : band === "amber"
        ? "border-secondary"
        : band === "red"
          ? "border-error"
          : "border-transparent";

  return (
    <td
      className={`border-l-[3px] ${bandBorderClass} border-b border-outline-variant/40 bg-surface-container px-2.5 py-2 text-center align-middle`}
    >
      <div className="flex flex-col items-center gap-0.5">
        <ScorePill score={scoreNum} />
        {scoreNum !== null && showCommunity && communityScore !== null && (
          <span className="text-[10px] font-medium text-secondary tabular-nums">
            {t.communityShort} {communityScore.toFixed(2)}
          </span>
        )}
        {typeof delta === "number" && (
          <span
            className="text-[10px] font-medium text-on-surface-variant tabular-nums"
            title={t.deltaVsReferenceAria}
            aria-label={t.deltaVsReferenceAria}
          >
            Δ {formatSignedDelta(delta)}
          </span>
        )}
        {scoreNum !== null && (u > 0 || d > 0) && (
          <span className="text-[9px] font-medium text-error tabular-nums">
            u:{u} d:{d}
          </span>
        )}
      </div>
    </td>
  );
}

export function ScoreTable({
  samples,
  cupsPerSample,
  format,
  showCommunity,
  isOwner,
  onReveal,
  onOpenDetail,
  referenceId = null,
  referenceScore = null,
  t,
}: {
  samples: SampleResult[];
  cupsPerSample: number;
  format: SessionFormat;
  showCommunity: boolean;
  isOwner: boolean;
  onReveal: (sampleId: string) => void;
  onOpenDetail: (sampleId: string) => void;
  // Id of the owner-marked "Referencia" (control) sample, or null when none
  // is set. referenceScore is the pre-derived displayed score for that
  // sample (see ResultsClient) — kept alongside referenceId so the legend
  // can gate on "a reference exists" without recomputing anything.
  referenceId?: string | null;
  referenceScore?: number | null;
  t: ScoreTableTranslations;
}) {
  const showDescriptive = format !== "affective";
  const showAffective = format !== "descriptive";
  const showCVA = showAffective;

  // Per-row displayed score (community when visible, else mine) → one Δ map
  // for the whole table, keyed by sample id. Mirrors CvaCell's own myScore
  // derivation below so the Δ and the score pill it sits under always agree.
  const refDeltas = deltasVsReference(
    samples.map((sample) => {
      const affData =
        format === "affective" ? sample.affective : format === "combined" ? sample.combined : null;
      const myScore =
        affData && hasAffectiveData(affData) ? calcIndividualScore(affData, cupsPerSample) : null;
      const myScoreNum = typeof myScore === "number" ? myScore : null;
      const communityScore = sample.aggregateScore?.communityScore ?? null;
      return {
        id: sample.id,
        score: pickDisplayedScore(myScoreNum, communityScore, showCommunity),
      };
    }),
    referenceId,
  );

  const thBase =
    "border-b border-outline-variant/40 px-2 py-1.5 text-center text-[10px] font-bold tracking-wide whitespace-nowrap align-middle";
  const tdBase =
    "border-b border-outline-variant/40 px-2 py-1.5 text-center text-sm text-on-surface whitespace-nowrap align-middle tabular-nums";

  return (
    <div className="overflow-x-auto rounded-card border border-outline-variant">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th
              rowSpan={2}
              scope="col"
              className={`${thBase} sticky top-0 left-0 z-[2] min-w-[160px] bg-surface-container text-left text-on-surface pl-3`}
            >
              {t.sample}
            </th>

            {showDescriptive && (
              <th
                colSpan={DESCRIPTIVE_COLUMNS.length}
                scope="colgroup"
                className={`${thBase} sticky top-0 z-[2] bg-primary-fixed-dim text-primary-container uppercase`}
              >
                {t.descriptiveSection}
              </th>
            )}

            {showAffective && (
              <th
                colSpan={AFFECTIVE_ATTRIBUTES.length}
                scope="colgroup"
                className={`${thBase} sticky top-0 z-[2] bg-secondary-fixed-dim text-secondary uppercase`}
              >
                {t.affectiveSection}
              </th>
            )}

            {showCVA && (
              <th
                rowSpan={2}
                scope="col"
                className={`${thBase} sticky top-0 z-[2] min-w-[90px] bg-primary-container text-on-primary uppercase`}
              >
                {t.cvaScore}
              </th>
            )}
          </tr>

          <tr>
            {showDescriptive &&
              DESCRIPTIVE_COLUMNS.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className={`${thBase} sticky top-0 z-[2] min-w-[52px] bg-primary-fixed text-primary-container`}
                >
                  {col.label}
                </th>
              ))}

            {showAffective &&
              AFFECTIVE_ATTRIBUTES.map((attr) =>
                showCommunity ? (
                  <th
                    key={attr.id}
                    scope="col"
                    className={`${thBase} sticky top-0 z-[2] min-w-[68px] bg-secondary-fixed text-secondary`}
                  >
                    {attr.label}
                  </th>
                ) : (
                  <th
                    key={attr.id}
                    scope="col"
                    className={`${thBase} sticky top-0 z-[2] min-w-[52px] bg-secondary-fixed text-secondary`}
                  >
                    {attr.label}
                  </th>
                )
              )}
          </tr>
        </thead>

        <tbody>
          {samples.map((sample, rowIdx) => {
            const affData =
              format === "affective" ? sample.affective : format === "combined" ? sample.combined : null;

            const descData =
              format === "descriptive" ? sample.descriptive : format === "combined" ? sample.combined : null;

            const score =
              affData && hasAffectiveData(affData) ? calcIndividualScore(affData, cupsPerSample) : null;
            const nonUniform = (affData?.tazas_no_uniformes as boolean[] | undefined) ?? [];
            const defective = (affData?.tazas_defectuosas as boolean[] | undefined) ?? [];
            const u = nonUniform.filter(Boolean).length;
            const d = defective.filter(Boolean).length;
            const rowBg = rowBgClass(rowIdx);

            return (
              <tr key={sample.id}>
                {/* Sample cell — button opens the drill-down detail view */}
                <td className={`sticky left-0 z-[1] ${rowBg} border-b border-outline-variant/40 p-0 text-left align-top`}>
                  <button
                    type="button"
                    onClick={() => onOpenDetail(sample.id)}
                    aria-label={`${t.viewDetail}: ${sample.label}`}
                    className="flex min-h-[44px] w-full min-w-[160px] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-container-high/60 focus-visible:outline-2 focus-visible:outline-primary-container focus-visible:-outline-offset-2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-display text-base font-semibold leading-tight text-primary-container">
                          {sample.label}
                        </span>
                        {sample.isReference && (
                          <Badge tone="accent" size="xs">
                            {t.referenceBadge}
                          </Badge>
                        )}
                      </span>
                      {sample.revealed && sample.coffee && (
                        <span className="truncate text-[11px] text-on-surface-variant">{sample.coffee.name}</span>
                      )}
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-on-surface-variant" aria-hidden />
                  </button>

                  {isOwner && (
                    <div className="px-3 pb-2">
                      {sample.revealed ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary-container">
                          <Check size={11} aria-hidden />
                          {t.revealed}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReveal(sample.id);
                          }}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-pill border border-primary-container px-2.5 text-[10px] font-semibold text-primary-container transition-colors hover:bg-primary-fixed"
                        >
                          <Eye size={11} aria-hidden />
                          {t.reveal}
                        </button>
                      )}
                    </div>
                  )}
                </td>

                {/* Descriptive intensity cells */}
                {showDescriptive &&
                  DESCRIPTIVE_COLUMNS.map((col) => {
                    const raw = descData ? (descData[`${col.id}_int`] as number | undefined) : undefined;
                    const rated = raw !== undefined && raw > 0;
                    return (
                      <td key={col.id} className={`${tdBase} ${rowBg}`}>
                        {rated ? (
                          <span>{raw}</span>
                        ) : (
                          // Never print a literal "1" for an unrated attribute — it
                          // reads as a real intensity. Matches the "—" the affective
                          // cells in this same row already use.
                          <span className="text-on-surface-variant">—</span>
                        )}
                      </td>
                    );
                  })}

                {/* Affective score cells */}
                {showAffective &&
                  AFFECTIVE_ATTRIBUTES.map((attr) => {
                    const myVal = affData
                      ? ((affData[`${attr.id}_final`] as number | undefined) ?? (affData[attr.id] as number | undefined))
                      : undefined;
                    const comVal = showCommunity ? sample.aggregateScore?.attrAverages[attr.label] : undefined;

                    return (
                      <td key={attr.id} className={`${tdBase} ${rowBg}`}>
                        {showCommunity ? (
                          <div className="flex flex-col leading-tight">
                            <span className="text-[13px] font-bold text-primary-container">
                              {myVal ?? <span className="text-on-surface-variant">—</span>}
                            </span>
                            <span className="text-secondary text-[10px]">
                              {comVal !== undefined ? comVal.toFixed(1) : <span className="text-on-surface-variant">—</span>}
                            </span>
                          </div>
                        ) : (
                          <span className="font-semibold text-primary-container">
                            {myVal ?? <span className="text-on-surface-variant">—</span>}
                          </span>
                        )}
                      </td>
                    );
                  })}

                {/* CVA score cell */}
                {showCVA && (
                  <CvaCell
                    myScore={score}
                    communityScore={sample.aggregateScore?.communityScore ?? null}
                    showCommunity={showCommunity}
                    u={u}
                    d={d}
                    delta={refDeltas.get(sample.id) ?? null}
                    t={t}
                  />
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend */}
      {showCommunity && showAffective && (
        <div className="flex gap-4 border-t border-outline-variant/40 px-3 py-2 text-[10px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-primary-container" aria-hidden />
            {t.legendMine}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-secondary" aria-hidden />
            {t.legendCommunity}
          </span>
        </div>
      )}
      {/* Only worth explaining once the reference itself carries a real
          score — an unscored reference never produces a Δ in any row. */}
      {referenceScore !== null && (
        <p
          className={`px-3 text-[10px] text-on-surface-variant ${
            showCommunity && showAffective ? "pb-2" : "border-t border-outline-variant/40 py-2"
          }`}
        >
          {t.referenceLegend}
        </p>
      )}
    </div>
  );
}
