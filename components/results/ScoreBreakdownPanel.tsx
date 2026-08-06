"use client";

import { Calculator } from "lucide-react";
import type { IndividualBreakdown } from "@/lib/scoring";

/* ============================================================
   N5 — Score transparency panel ("¿Cómo se calculó?")

   A collapsed-by-default disclosure that explains how a CVA score was
   calculated AND under what session setup. Two variants:
   - "individual": one cupper's score for one sample (uses IndividualBreakdown,
     the single source of truth shared with the displayed score).
   - "group": the community aggregate for one sample (reads numbers verbatim
     from AggregateScoreData — authoritative, never recomputed here).

   All strings arrive via the `t` prop (results.breakdown.* in the message
   files) — this component holds no private bilingual dictionary.
   ============================================================ */

type AggregateScoreData = {
  communityScore: number | null;
  avgRawScore: number | null;
  participantCount: number;
  submittedCount: number;
  totalCups: number;
  totalNonUniform: number;
  totalDefective: number;
  uniformityPenalty: number;
  defectPenalty: number;
  attrAverages: Record<string, number>;
};

export type ScoreSetup = {
  cupsPerSample: number;
  uniformityTracked: boolean; // now: cupsPerSample >= 5
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
  recorded: string;
  groupTitle: string;
  groupAvgRaw: string;
  groupUniformity: string;
  groupDefects: string;
  communityScore: string;
  includedNote: string;
  groupExplain: string;
  perCup: string;
};

type Props =
  | {
      variant: "individual";
      breakdown: IndividualBreakdown;
      setup: ScoreSetup;
      t: ScoreBreakdownTranslations;
    }
  | {
      variant: "group";
      group: AggregateScoreData;
      cupsPerSample: number;
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
      <code className="whitespace-nowrap font-mono text-[13px] font-bold tabular-nums text-primary-container">
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
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-outline-variant pt-2 text-[10px] text-on-surface-variant">
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
  tone?: "error" | "secondary";
}) {
  const base = strong ? "text-primary-container" : "text-on-surface-variant";
  const valueClass = tone === "error" ? "text-error" : tone === "secondary" ? "text-secondary" : base;
  return (
    <div className="flex justify-between gap-3 border-t border-outline-variant/60 py-0.5">
      <span className={`${base} ${strong ? "font-bold" : ""}`}>{label}</span>
      <span className={`whitespace-nowrap font-bold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

const sectionLabel = "mb-1 mt-2.5 text-[9px] font-bold uppercase tracking-widest text-on-surface-variant first:mt-0";

export function ScoreBreakdownPanel(props: Props) {
  const { t } = props;
  return (
    <details className="mt-2 overflow-hidden rounded-input border border-outline-variant bg-surface-container-lowest">
      <summary className="flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[11px] font-bold text-primary-container select-none [&::-webkit-details-marker]:hidden [&::marker]:content-none">
        <Calculator size={13} aria-hidden />
        {t.how}
      </summary>
      <div className="px-3 pb-3 pt-1 text-xs text-on-surface-variant">
        {props.variant === "individual"
          ? renderIndividual(props.breakdown, props.setup, t)
          : renderGroup(props.group, props.cupsPerSample, props.setup, t)}
      </div>
    </details>
  );
}

function renderIndividual(
  b: IndividualBreakdown,
  setup: ScoreSetup,
  t: ScoreBreakdownTranslations,
) {
  return (
    <>
      <div className={sectionLabel}>{t.formula}</div>
      <FormulaLine />
      <div className="text-[10px] leading-relaxed text-on-surface-variant">
        {t.sigma}
        <br />
        {t.u} · {t.d}
      </div>

      <div className={sectionLabel}>{t.values}</div>
      <div className="text-[11px] leading-relaxed text-on-surface">
        Σhᵢ = <strong>{b.affectiveSum}</strong> &nbsp;·&nbsp; u = <strong>{b.u}</strong>{" "}
        &nbsp;·&nbsp; d = <strong>{b.d}</strong>{" "}
        {!b.uniformityTracked && (
          <span className="text-on-surface-variant">({t.recorded})</span>
        )}
      </div>

      <div className={sectionLabel}>{t.finalScore}</div>
      <div>
        <TallyRow
          label={`${t.base} (0.65625 × ${b.affectiveSum} + 52.75)`}
          value={fmt(b.base)}
        />
        <TallyRow
          label={`− ${t.uniformity} (2 × ${b.u})`}
          value={`−${fmt(b.uniformityPenalty)}`}
          tone={b.uniformityPenalty > 0 ? "error" : undefined}
        />
        <TallyRow
          label={`− ${t.defects} (4 × ${b.d})`}
          value={`−${fmt(b.defectPenalty)}`}
          tone={b.defectPenalty > 0 ? "error" : undefined}
        />
        <TallyRow label={t.raw} value={fmt(b.raw)} />
        <TallyRow label={t.rounded} value={fmt(b.score)} strong />
      </div>

      {!b.uniformityTracked && (
        <div className="mt-2 text-[10px] italic leading-relaxed text-on-surface-variant">
          {t.notTrackedNote}
        </div>
      )}

      <SetupStamp setup={setup} t={t} />
    </>
  );
}

function renderGroup(
  g: AggregateScoreData,
  cupsPerSample: number,
  setup: ScoreSetup,
  t: ScoreBreakdownTranslations,
) {
  const avgRaw = g.avgRawScore ?? 0;
  const community = g.communityScore ?? 0;
  return (
    <>
      <div className={sectionLabel}>{t.groupTitle}</div>
      {/* N6: when remote sessions switch to mean-of-individual-rounded scores,
          revisit this explanatory copy — the data still arrives via the
          aggregate, so only the wording changes. */}
      <div className="mb-1 text-[11px] leading-relaxed text-on-surface-variant">
        {t.groupExplain}
      </div>

      <div className={sectionLabel}>{t.finalScore}</div>
      <div>
        <TallyRow label={t.groupAvgRaw} value={fmt(avgRaw)} />
        <TallyRow
          label={`− ${t.groupUniformity} (${g.totalNonUniform} × 10 / ${g.totalCups || cupsPerSample})`}
          value={`−${fmt(g.uniformityPenalty)}`}
          tone={g.uniformityPenalty > 0 ? "error" : undefined}
        />
        <TallyRow
          label={`− ${t.groupDefects} (${g.totalDefective} × 30 / ${g.totalCups || cupsPerSample})`}
          value={`−${fmt(g.defectPenalty)}`}
          tone={g.defectPenalty > 0 ? "error" : undefined}
        />
        <TallyRow label={t.communityScore} value={fmt(community)} strong tone="secondary" />
      </div>

      <div className="mt-2 text-[10px] leading-relaxed text-on-surface-variant">
        {t.includedNote
          .replace("{n}", String(g.participantCount))
          .replace("{total}", String(g.submittedCount))}
      </div>

      <SetupStamp setup={setup} t={t} />
    </>
  );
}
