"use client";

import type { IndividualBreakdown } from "@/lib/scoring";

/* ============================================================
   N5 — Score transparency panel ("¿Cómo se calculó?")

   A collapsed-by-default disclosure that explains how a CVA score was
   calculated AND under what session setup. Two variants:
   - "individual": one cupper's score for one sample (uses IndividualBreakdown,
     the single source of truth shared with the displayed score).
   - "group": the community aggregate for one sample (reads numbers verbatim
     from AggregateScoreData — authoritative, never recomputed here).
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

type Props =
  | {
      variant: "individual";
      breakdown: IndividualBreakdown;
      setup: ScoreSetup;
      locale: string;
    }
  | {
      variant: "group";
      group: AggregateScoreData;
      cupsPerSample: number;
      setup: ScoreSetup;
      locale: string;
    };

type Lang = "es" | "en";

const LABELS: Record<Lang, Record<string, string>> = {
  es: {
    how: "¿Cómo se calculó?",
    formula: "Fórmula CVA",
    sigma: "Σhᵢ = suma de las 8 secciones afectivas",
    u: "u = tazas no uniformes",
    d: "d = tazas defectuosas",
    values: "Valores de esta evaluación",
    base: "Base",
    uniformity: "Uniformidad",
    defects: "Defectos",
    raw: "Sin redondear",
    rounded: "Redondeado a 0.25",
    finalScore: "Puntaje final",
    setupStamp: "Configuración",
    cups: "tazas",
    uniformityOn: "uniformidad evaluada",
    uniformityOff: "uniformidad no evaluada",
    rounding025: "redondeo a 0.25",
    roundingOff: "sin redondeo",
    mode: "Modo",
    modeProfessional: "Profesional",
    modeAcademic: "Académico",
    modeFree: "Libre",
    notTrackedNote:
      "Uniformidad no evaluada: se requieren ≥5 tazas. u y d quedan registradas pero no se restan.",
    recorded: "registradas",
    groupTitle: "Cómo se calculó el puntaje de la comunidad",
    groupAvgRaw: "Promedio base (Σ puntajes sin penalizar ÷ catadores)",
    groupUniformity: "Penalización uniformidad",
    groupDefects: "Penalización defectos",
    communityScore: "Puntaje de la comunidad",
    includedNote: "{n} de {total} evaluadores incluidos en el promedio",
    groupExplain:
      "El puntaje de la comunidad es el promedio de los puntajes base, menos penalizaciones normalizadas por taza, redondeado a 0.25.",
    perCup: "por taza",
  },
  en: {
    how: "How was this calculated?",
    formula: "CVA formula",
    sigma: "Σhᵢ = sum of the 8 affective sections",
    u: "u = non-uniform cups",
    d: "d = defective cups",
    values: "Values for this evaluation",
    base: "Base",
    uniformity: "Uniformity",
    defects: "Defects",
    raw: "Unrounded",
    rounded: "Rounded to 0.25",
    finalScore: "Final score",
    setupStamp: "Setup",
    cups: "cups",
    uniformityOn: "uniformity evaluated",
    uniformityOff: "uniformity not evaluated",
    rounding025: "rounding to 0.25",
    roundingOff: "no rounding",
    mode: "Mode",
    modeProfessional: "Professional",
    modeAcademic: "Academic",
    modeFree: "Free",
    notTrackedNote:
      "Uniformity not evaluated: 5+ cups required. u and d are recorded but not subtracted.",
    recorded: "recorded",
    groupTitle: "How the community score was calculated",
    groupAvgRaw: "Base average (Σ unpenalized scores ÷ cuppers)",
    groupUniformity: "Uniformity penalty",
    groupDefects: "Defect penalty",
    communityScore: "Community score",
    includedNote: "{n} of {total} cuppers included in the average",
    groupExplain:
      "The community score is the average of the base scores, minus per-cup normalized penalties, rounded to 0.25.",
    perCup: "per cup",
  },
};

/* — visual tokens (match existing results components) — */
const GREEN = "#3D5A3E";
const AMBER = "#C17817";
const RED = "#A83232";
const MUTED = "#8B7355";
const BORDER = "#E8E0D0";
const TINT = "#F0F5F0";

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits);
}

const detailsStyle: React.CSSProperties = {
  marginTop: 8,
  border: `1px solid ${BORDER}`,
  borderRadius: 9,
  background: "#fff",
  overflow: "hidden",
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  listStyle: "none",
  padding: "8px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: GREEN,
  display: "flex",
  alignItems: "center",
  gap: 6,
  userSelect: "none",
};

const bodyStyle: React.CSSProperties = {
  padding: "4px 12px 12px",
  fontSize: 12,
  color: "#5C4A32",
};

const sectionLabel: React.CSSProperties = {
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: MUTED,
  fontWeight: 700,
  marginTop: 10,
  marginBottom: 4,
};

const tallyRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "3px 0",
  borderTop: `1px solid #F0EBE0`,
};

const monoVal: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

/* Horizontally scrollable / wrapping formula so it never overflows on mobile. */
function FormulaLine() {
  return (
    <div
      style={{
        overflowX: "auto",
        background: TINT,
        border: `1px solid #DCE6DC`,
        borderRadius: 7,
        padding: "8px 10px",
        marginBottom: 4,
      }}
    >
      <code
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: GREEN,
          whiteSpace: "nowrap",
          fontFamily: "'SFMono-Regular', Menlo, Consolas, monospace",
        }}
      >
        S = 0.65625 × Σhᵢ + 52.75 − 2u − 4d
      </code>
    </div>
  );
}

function SetupStamp({ setup, t }: { setup: ScoreSetup; t: Record<string, string> }) {
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
    <div
      style={{
        marginTop: 12,
        paddingTop: 8,
        borderTop: `1px solid ${BORDER}`,
        fontSize: 10,
        color: MUTED,
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {t.setupStamp}
      </span>
      <span style={{ color: "#A89878" }}>·</span>
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

function TallyRow({
  label,
  value,
  strong,
  color,
}: {
  label: string;
  value: string;
  strong?: boolean;
  color?: string;
}) {
  return (
    <div style={tallyRow}>
      <span style={{ color: strong ? GREEN : "#5C4A32", fontWeight: strong ? 700 : 400 }}>
        {label}
      </span>
      <span style={{ ...monoVal, color: color ?? (strong ? GREEN : "#5C4A32") }}>{value}</span>
    </div>
  );
}

export function ScoreBreakdownPanel(props: Props) {
  const lang: Lang = props.locale === "en" ? "en" : "es";
  const t = LABELS[lang];

  return (
    <details style={detailsStyle}>
      <summary style={summaryStyle}>
        <span aria-hidden style={{ fontSize: 13 }}>🧮</span>
        {t.how}
      </summary>
      <div style={bodyStyle}>
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
  t: Record<string, string>,
) {
  return (
    <>
      <div style={sectionLabel}>{t.formula}</div>
      <FormulaLine />
      <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5 }}>
        {t.sigma}
        <br />
        {t.u} · {t.d}
      </div>

      <div style={sectionLabel}>{t.values}</div>
      <div style={{ fontSize: 11, color: "#5C4A32", lineHeight: 1.6 }}>
        Σhᵢ = <strong>{b.affectiveSum}</strong> &nbsp;·&nbsp; u ={" "}
        <strong>{b.u}</strong> &nbsp;·&nbsp; d = <strong>{b.d}</strong>{" "}
        {!b.uniformityTracked && (
          <span style={{ color: MUTED }}>({t.recorded})</span>
        )}
      </div>

      <div style={sectionLabel}>{t.finalScore}</div>
      <div>
        <TallyRow
          label={`${t.base} (0.65625 × ${b.affectiveSum} + 52.75)`}
          value={fmt(b.base)}
        />
        <TallyRow
          label={`− ${t.uniformity} (2 × ${b.u})`}
          value={`−${fmt(b.uniformityPenalty)}`}
          color={b.uniformityPenalty > 0 ? RED : "#5C4A32"}
        />
        <TallyRow
          label={`− ${t.defects} (4 × ${b.d})`}
          value={`−${fmt(b.defectPenalty)}`}
          color={b.defectPenalty > 0 ? RED : "#5C4A32"}
        />
        <TallyRow label={t.raw} value={fmt(b.raw)} />
        <TallyRow label={t.rounded} value={fmt(b.score)} strong />
      </div>

      {!b.uniformityTracked && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: MUTED,
            fontStyle: "italic",
            lineHeight: 1.5,
          }}
        >
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
  t: Record<string, string>,
) {
  const avgRaw = g.avgRawScore ?? 0;
  const community = g.communityScore ?? 0;
  return (
    <>
      <div style={sectionLabel}>{t.groupTitle}</div>
      {/* N6: when remote sessions switch to mean-of-individual-rounded scores,
          revisit this explanatory copy — the data still arrives via the
          aggregate, so only the wording changes. */}
      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5, marginBottom: 4 }}>
        {t.groupExplain}
      </div>

      <div style={sectionLabel}>{t.finalScore}</div>
      <div>
        <TallyRow label={t.groupAvgRaw} value={fmt(avgRaw)} />
        <TallyRow
          label={`− ${t.groupUniformity} (${g.totalNonUniform} × 10 / ${g.totalCups || cupsPerSample})`}
          value={`−${fmt(g.uniformityPenalty)}`}
          color={g.uniformityPenalty > 0 ? RED : "#5C4A32"}
        />
        <TallyRow
          label={`− ${t.groupDefects} (${g.totalDefective} × 30 / ${g.totalCups || cupsPerSample})`}
          value={`−${fmt(g.defectPenalty)}`}
          color={g.defectPenalty > 0 ? RED : "#5C4A32"}
        />
        <TallyRow label={t.communityScore} value={fmt(community)} strong color={AMBER} />
      </div>

      <div style={{ marginTop: 8, fontSize: 10, color: MUTED, lineHeight: 1.5 }}>
        {t.includedNote
          .replace("{n}", String(g.participantCount))
          .replace("{total}", String(g.submittedCount))}
      </div>

      <SetupStamp setup={setup} t={t} />
    </>
  );
}
