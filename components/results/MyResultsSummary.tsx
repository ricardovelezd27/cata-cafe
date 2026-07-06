"use client";

import { calcIndividualBreakdown, calcIndividualScore } from "@/lib/scoring";
import { resolveDescriptor } from "@/lib/descriptors";
import { ScoreBreakdownPanel } from "@/components/results/ScoreBreakdownPanel";
import { ExtrinsicSummary } from "@/components/results/ExtrinsicSummary";

type SampleResult = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: { name: string } | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  extrinsic?: Record<string, unknown>;
};


/* Attribute rows in SCA CVA order. */
const ATTR_ROWS = [
  { descId: "fragancia", affId: "fragancia_af", key: "fragrance" },
  { descId: "aroma", affId: "aroma_af", key: "aroma" },
  { descId: "sabor", affId: "sabor_af", key: "flavor" },
  { descId: "sabor_residual", affId: "sabor_residual_af", key: "aftertaste" },
  { descId: "acidez", affId: "acidez_af", key: "acidity" },
  { descId: "dulzor", affId: "dulzor_af", key: "sweetness" },
  { descId: "sensacion", affId: "sensacion_af", key: "mouthfeel" },
] as const;

type LabelKey =
  | "fragrance" | "aroma" | "flavor" | "aftertaste"
  | "acidity" | "sweetness" | "mouthfeel" | "overall"
  | "intensity" | "quality" | "notes" | "cvaScore"
  | "edit" | "noData";

const LABELS: Record<"es" | "en", Record<LabelKey, string>> = {
  es: {
    fragrance: "Fragancia", aroma: "Aroma", flavor: "Sabor", aftertaste: "Regusto",
    acidity: "Acidez", sweetness: "Dulzor", mouthfeel: "Sensación", overall: "Global",
    intensity: "Intensidad", quality: "Calidad", notes: "Notas", cvaScore: "Puntaje CVA",
    edit: "Editar", noData: "Sin evaluación registrada",
  },
  en: {
    fragrance: "Fragrance", aroma: "Aroma", flavor: "Flavor", aftertaste: "Aftertaste",
    acidity: "Acidity", sweetness: "Sweetness", mouthfeel: "Mouthfeel", overall: "Overall",
    intensity: "Intensity", quality: "Quality", notes: "Notes", cvaScore: "CVA Score",
    edit: "Edit", noData: "No evaluation recorded",
  },
};

function num(data: Record<string, unknown>, key: string): number | null {
  const v = data[key];
  return typeof v === "number" && v > 0 ? v : null;
}

function descriptorIds(data: Record<string, unknown>, descId: string): string[] {
  const v = data[`${descId}_desc`];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function DescriptorPills({ ids, locale }: { ids: string[]; locale: "es" | "en" }) {
  // Keep only the most specific (level-two) descriptors: drop a parent family
  // pill when any of its sub-items are also selected, to avoid redundancy
  // (e.g. "Nueces/Cacao" alongside "Nueces" + "Cacao").
  const parentsWithChildren = new Set(
    ids.filter((id) => id.includes(":")).map((id) => id.split(":")[0])
  );
  const visible = ids.filter(
    (id) => id.includes(":") || !parentsWithChildren.has(id)
  );

  if (visible.length === 0) {
    return <span style={{ color: "#C8C0B0", fontSize: 12 }}>—</span>;
  }
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {visible.map((id) => {
        const info = resolveDescriptor(id, locale);
        if (!info) return null;
        return (
          <span
            key={id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 11px",
              borderRadius: 999,
              backgroundColor: info.color,
              color: "#fff",
              fontSize: 11,
              fontWeight: 500,
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
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
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 4, whiteSpace: "nowrap" }}>
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#8B7355",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: value !== null ? "#5C4A32" : "#C8C0B0" }}>
        {value !== null ? value : "—"}
      </span>
    </span>
  );
}

export function MyResultsSummary({
  samples,
  format,
  cupsPerSample,
  locale,
  onEdit,
  hideEdit = false,
}: {
  samples: SampleResult[];
  format: string;
  cupsPerSample: number;
  locale: string;
  onEdit?: (sampleId: string) => void;
  hideEdit?: boolean;
}) {
  const t = LABELS[locale === "en" ? "en" : "es"];
  const showDescriptive = format !== "affective";
  const showAffective = format !== "descriptive";
  const showCVA = showAffective;

  const dataFor = (s: SampleResult): Record<string, unknown> =>
    format === "affective" ? s.affective : format === "descriptive" ? s.descriptive : s.combined;

  const hasData = (data: Record<string, unknown>): boolean =>
    Object.values(data).some((v) =>
      Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "" && v !== 0
    );

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "92px 1fr auto",
    gap: 10,
    alignItems: "center",
    padding: "8px 0",
    borderTop: "1px solid #F0EBE0",
  };

  const attrLabel: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: "#3D5A3E",
    fontFamily: "'Cormorant Garamond', Georgia, serif",
    letterSpacing: "0.01em",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {samples.map((sample) => {
        const data = dataFor(sample);
        const filled = hasData(data);
        const cva = showCVA && filled ? calcIndividualScore(data, cupsPerSample) : null;
        const cvaNum = typeof cva === "number" ? cva : null;
        const cvaColor =
          cvaNum !== null
            ? cvaNum >= 85 ? "#3D5A3E" : cvaNum >= 75 ? "#C17817" : "#A83232"
            : "#8B7355";
        const overallScore = num(data, "impresion_global_final");
        const overallNotes = (data["impresion_global_notas"] as string | undefined)?.trim() ?? "";

        return (
          <section
            key={sample.id}
            style={{
              background: "#fff",
              borderRadius: 12,
              border: "1px solid #E8E0D0",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Card header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#3D5A3E",
                    lineHeight: 1.1,
                  }}
                >
                  {sample.label}
                  {sample.revealed && sample.coffee && (
                    <span style={{ color: "#8B7355", fontWeight: 500 }}> — {sample.coffee.name}</span>
                  )}
                </div>
              </div>
              {!hideEdit && (
                <button
                  onClick={() => onEdit?.(sample.id)}
                  style={{
                    flexShrink: 0,
                    padding: "5px 12px",
                    borderRadius: 8,
                    border: "1px solid #3D5A3E",
                    background: "#fff",
                    color: "#3D5A3E",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ✎ {t.edit}
                </button>
              )}
            </div>

            {/* Extrinsic data (origin/process/trade), same reveal rule as coffee identity */}
            {sample.revealed && sample.extrinsic && (
              <ExtrinsicSummary data={sample.extrinsic} />
            )}

            {!filled ? (
              <div style={{ fontSize: 12, color: "#C8C0B0", padding: "8px 0" }}>{t.noData}</div>
            ) : (
              <>
                {/* Attribute rows */}
                <div>
                  {ATTR_ROWS.map((row) => {
                    const intensity = showDescriptive ? num(data, `${row.descId}_int`) : null;
                    const quality = showAffective ? num(data, `${row.affId}_final`) : null;
                    const ids = showDescriptive ? descriptorIds(data, row.descId) : [];
                    return (
                      <div key={row.key} style={rowStyle}>
                        <span style={attrLabel}>{t[row.key as LabelKey]}</span>
                        <span style={{ minWidth: 0 }}>
                          {showDescriptive ? (
                            <DescriptorPills ids={ids} locale={locale === "en" ? "en" : "es"} />
                          ) : (
                            <span style={{ color: "#C8C0B0", fontSize: 12 }}>—</span>
                          )}
                        </span>
                        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                          {showDescriptive && <StatChip label={t.intensity} value={intensity} />}
                          {showAffective && <StatChip label={t.quality} value={quality} />}
                        </span>
                      </div>
                    );
                  })}

                  {/* Overall */}
                  {showAffective && (
                    <div style={{ ...rowStyle, alignItems: "start" }}>
                      <span style={attrLabel}>{t.overall}</span>
                      <span style={{ minWidth: 0, fontSize: 12, color: "#5C4A32" }}>
                        {overallNotes && (
                          <>
                            <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8B7355", fontWeight: 600, marginRight: 6 }}>
                              {t.notes}
                            </span>
                            {overallNotes}
                          </>
                        )}
                      </span>
                      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                        <StatChip label={t.quality} value={overallScore} />
                      </span>
                    </div>
                  )}
                </div>

                {/* CVA total */}
                {showCVA && (
                  <>
                    <div
                      style={{
                        marginTop: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#F0F5F0",
                        borderRadius: 9,
                        border: "1px solid #DCE6DC",
                        padding: "8px 14px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          color: "#3D5A3E",
                        }}
                      >
                        {t.cvaScore}
                      </span>
                      <span
                        style={{
                          fontFamily: "'Cormorant Garamond', Georgia, serif",
                          fontSize: 26,
                          fontWeight: 700,
                          lineHeight: 1,
                          color: cvaColor,
                        }}
                      >
                        {cvaNum !== null ? cvaNum.toFixed(2) : "—"}
                      </span>
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
                        locale={locale}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
