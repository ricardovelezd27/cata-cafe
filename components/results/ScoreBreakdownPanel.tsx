"use client";

import { Calculator } from "lucide-react";
import { cupDeduction, type IndividualBreakdown } from "@/lib/scoring";
import type { ScoreRule } from "@/lib/scoreRule";
import { buildScoreLine, groupScopeLine, type ScoreLineLabels } from "@/lib/scoreLine";

/* ============================================================
   Score transparency: the arithmetic of a score, and "¿Cómo se calculó?"

   ONE disclosure per coffee's sheet (RESULTS-DESIGN.md section 3: "'¿Cómo se
   calculó?' once"). It can hold two parts, each under its own name:
   - `individual`: one cupper's score for one sample (IndividualBreakdown, the
     single source of truth shared with the displayed score);
   - `group`: the group's score for one sample (numbers read verbatim from
     AggregateScoreData: authoritative, never recomputed here).
   The arithmetic line of the individual score and the pooled-cups line of the
   group's are printed above the disclosure, always visible.

   All strings arrive via the `t` prop (results.breakdown.* in the message
   files): this component holds no private bilingual dictionary.
   ============================================================ */

/** The group's stored numbers for one sample, as the panel reads them. */
export type GroupBreakdownData = {
  communityScore: number | null;
  avgRawScore: number | null;
  participantCount: number;
  submittedCount: number;
  totalSubmitted?: number;
  totalCups: number;
  totalNonUniform: number;
  totalDefective: number;
  uniformityPenalty: number;
  defectPenalty: number;
  /** "v1" = computed under the rule before 2026-11 (past results render unchanged). */
  rule?: ScoreRule;
  attrAverages: Record<string, number>;
};

export type ScoreSetup = {
  cupsPerSample: number;
  uniformityTracked: boolean; // the evaluation has 2+ cups
  roundingEnforced: boolean; // now: always true
  mode?: "professional" | "academic" | "free"; // N6 — undefined for now
};

/** Every string ScoreBreakdownPanel renders — sourced from `results.breakdown.*`
 * in the message files. Never a private bilingual dictionary. */
export type ScoreBreakdownTranslations = {
  how: string;
  formula: string;
  sigma: string;
  u: string;
  d: string;
  values: string;
  base: string;
  uniformity: string;
  defects: string;
  raw: string;
  rounded: string;
  finalScore: string;
  setupStamp: string;
  cups: string;
  uniformityOn: string;
  uniformityOff: string;
  rounding025: string;
  roundingOff: string;
  mode: string;
  modeProfessional: string;
  modeAcademic: string;
  modeFree: string;
  notTrackedNote: string;
  /** Neutral line shown instead of the current-rule explanation for a past (v1) result. */
  previousRule: string;
  groupTitle: string;
  groupAvgRaw: string;
  groupUniformity: string;
  groupDefects: string;
  communityScore: string;
  includedNote: string;
  groupExplain: string;
  perCup: string;
  /** Nouns for the always-visible arithmetic line (`results.breakdown.line.*`). */
  line: ScoreLineLabels & {
    /** "Entre todos se cataron {cups} tazas…" (client-side `{cups}` replace). */
    groupScope: string;
  };
};

type Props = {
  /** One cupper's score. `label` names whose it is ("Tu puntaje"). */
  individual?: {
    breakdown: IndividualBreakdown;
    /** The evaluation's module JSON: lets the arithmetic line name the defect types. */
    data?: Record<string, unknown>;
    label: string;
  } | null;
  /** The group's score. `label` names it ("El puntaje del grupo"). */
  group?: { group: GroupBreakdownData; cupsPerSample: number; label: string } | null;
  setup: ScoreSetup;
  t: ScoreBreakdownTranslations;
};

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

/* Horizontally scrollable formula so it never overflows on mobile. */
function FormulaLine() {
  return (
    <div className="mb-1 overflow-x-auto rounded-input border border-primary-fixed-dim/50 bg-primary-fixed/15 px-2.5 py-2">
      <code className="whitespace-nowrap font-mono text-[13px] font-bold tabular-nums text-on-surface">
        S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
      </code>
    </div>
  );
}

function SetupStamp({ setup, t }: { setup: ScoreSetup; t: ScoreBreakdownTranslations }) {
  const parts: string[] = [];
  if (setup.mode) {
    const modeLabel =
      setup.mode === "professional"
        ? t.modeProfessional
        : setup.mode === "academic"
          ? t.modeAcademic
          : t.modeFree;
    parts.push(`${t.mode}: ${modeLabel}`);
  }
  parts.push(`${setup.cupsPerSample} ${t.cups}`);
  parts.push(setup.uniformityTracked ? t.uniformityOn : t.uniformityOff);
  parts.push(setup.roundingEnforced ? t.rounding025 : t.roundingOff);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-outline-variant pt-2 text-[11px] text-on-surface-variant">
      <span className="font-bold uppercase tracking-wide">{t.setupStamp}</span>
      <span aria-hidden>·</span>
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

function TallyRow({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "error";
}) {
  const base = strong ? "text-on-surface" : "text-on-surface-variant";
  const valueClass = tone === "error" ? "text-error" : base;
  return (
    <div className="flex justify-between gap-3 border-t border-outline-variant/60 py-0.5">
      <span className={`${base} ${strong ? "font-bold" : ""}`}>{label}</span>
      <span className={`whitespace-nowrap font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

const sectionLabel = "mb-1 mt-2.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant first:mt-0";
const partLabel = "mb-1 mt-3 text-[12.25px] font-semibold text-on-surface first:mt-0";

export function ScoreBreakdownPanel({ individual, group, setup, t }: Props) {
  if (!individual && !group) return null;
  // The arithmetic of the total, visible without expanding anything. Only a line
  // that adds up to the stored number is ever built (lib/scoreLine.ts).
  const line = individual?.data ? buildScoreLine(individual.breakdown, individual.data, t.line) : null;
  const scope = group ? groupScopeLine(group.group.totalCups, group.group.rule, t.line.groupScope) : null;
  return (
    <>
      {line && (
        <p className="m-0 text-[12.25px] tabular-nums leading-relaxed text-on-surface" data-score-line>
          {line}
        </p>
      )}
      {scope && (
        <p className="m-0 text-[12.25px] leading-relaxed text-on-surface-variant" data-score-scope>
          {scope}
        </p>
      )}
      <details className="overflow-hidden rounded-input border border-outline-variant bg-surface-container-lowest">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[12.25px] font-semibold text-on-surface select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none">
          <Calculator size={14} aria-hidden />
          {t.how}
        </summary>
        <div className="px-3 pb-3 pt-1 text-[12.25px] text-on-surface-variant">
          {individual ? (
            <>
              {group ? <div className={partLabel}>{individual.label}</div> : null}
              {renderIndividual(individual.breakdown, setup, t)}
            </>
          ) : null}
          {group ? (
            <>
              {individual ? <div className={`${partLabel} border-t border-outline-variant pt-3`}>{group.label}</div> : null}
              {renderGroup(group.group, group.cupsPerSample, setup, t)}
            </>
          ) : null}
        </div>
      </details>
    </>
  );
}

function renderIndividual(
  b: IndividualBreakdown,
  setup: ScoreSetup,
  t: ScoreBreakdownTranslations,
) {
  // One cupper never has more than five cups, so the factor is 1 and is not
  // printed; a longer sample (not offered today) prints it so the line stays true.
  const factorSuffix = b.factor < 1 ? ` × ${fmt(b.factor)}` : "";
  return (
    <>
      <div className={sectionLabel}>{t.formula}</div>
      <FormulaLine />
      <div className="text-[11px] leading-relaxed text-on-surface-variant">
        {t.sigma}
        <br />
        {t.u} · {t.d}
      </div>

      <div className={sectionLabel}>{t.values}</div>
      <div className="text-[11px] leading-relaxed text-on-surface">
        Σhᵢ = <strong>{b.affectiveSum}</strong> &nbsp;·&nbsp; u = <strong>{b.u}</strong>{" "}
        &nbsp;·&nbsp; d = <strong>{b.d}</strong>
      </div>

      <div className={sectionLabel}>{t.finalScore}</div>
      <div>
        <TallyRow
          label={`${t.base} (0.65625 × ${b.affectiveSum} + 52.75)`}
          value={fmt(b.base)}
        />
        <TallyRow
          label={`− ${t.uniformity} (2 × ${b.u}${factorSuffix})`}
          value={`−${fmt(b.uniformityPenalty)}`}
          tone={b.uniformityPenalty > 0 ? "error" : undefined}
        />
        <TallyRow
          label={`− ${t.defects} (4 × ${b.d}${factorSuffix})`}
          value={`−${fmt(b.defectPenalty)}`}
          tone={b.defectPenalty > 0 ? "error" : undefined}
        />
        <TallyRow label={t.raw} value={fmt(b.raw)} />
        <TallyRow label={t.rounded} value={fmt(b.score)} strong />
      </div>

      {b.rule === "v1" ? (
        <div className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">
          {t.previousRule}
        </div>
      ) : (
        !b.uniformityTracked && (
          <div className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">
            {t.notTrackedNote}
          </div>
        )
      )}

      <SetupStamp setup={{ ...setup, uniformityTracked: b.uniformityTracked }} t={t} />
    </>
  );
}

function renderGroup(
  g: GroupBreakdownData,
  cupsPerSample: number,
  setup: ScoreSetup,
  t: ScoreBreakdownTranslations,
) {
  const avgRaw = g.avgRawScore ?? 0;
  const community = g.communityScore ?? 0;
  // The penalties printed are the ones the page's data carries: the TypeScript
  // recompute (results page), or the stored row when the page recomputed nothing.
  // A sample scored under an older rule (g.rule === "v1") is never shown as the
  // current formula, and the formula is shown only when it reproduces the
  // penalties carried; otherwise the line carries just its name.
  const cups = g.totalCups || cupsPerSample;
  const expected = cupDeduction({ cups, nonUniform: g.totalNonUniform, defective: g.totalDefective });
  const previous = g.rule === "v1";
  const matches =
    !previous &&
    Math.abs(expected.uniformityPenalty - g.uniformityPenalty) < 0.005 &&
    Math.abs(expected.defectPenalty - g.defectPenalty) < 0.005;
  const uniformityLabel = matches
    ? `− ${t.groupUniformity} (2 × ${g.totalNonUniform} × 5 ÷ max(5, ${cups}))`
    : `− ${t.groupUniformity}`;
  const defectsLabel = matches
    ? `− ${t.groupDefects} (4 × ${g.totalDefective} × 5 ÷ max(5, ${cups}))`
    : `− ${t.groupDefects}`;
  return (
    <>
      <div className={sectionLabel}>{t.groupTitle}</div>
      {/* N6: when remote sessions switch to mean-of-individual-rounded scores,
          revisit this explanatory copy — the data still arrives via the
          aggregate, so only the wording changes. */}
      <div className="mb-1 text-[11px] leading-relaxed text-on-surface-variant">
        {previous ? t.previousRule : t.groupExplain}
      </div>

      <div className={sectionLabel}>{t.finalScore}</div>
      <div>
        <TallyRow label={t.groupAvgRaw} value={fmt(avgRaw)} />
        <TallyRow
          label={uniformityLabel}
          value={`−${fmt(g.uniformityPenalty)}`}
          tone={g.uniformityPenalty > 0 ? "error" : undefined}
        />
        <TallyRow
          label={defectsLabel}
          value={`−${fmt(g.defectPenalty)}`}
          tone={g.defectPenalty > 0 ? "error" : undefined}
        />
        <TallyRow label={t.communityScore} value={fmt(community)} strong />
      </div>

      <div className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">
        {t.includedNote
          .replace("{n}", String(g.participantCount))
          .replace("{total}", String(g.totalSubmitted ?? g.submittedCount))}
      </div>

      <SetupStamp
        setup={{ ...setup, uniformityTracked: previous ? cupsPerSample >= 5 : setup.uniformityTracked }}
        t={t}
      />
    </>
  );
}
