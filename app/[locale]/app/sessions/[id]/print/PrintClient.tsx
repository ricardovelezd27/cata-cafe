"use client";

import {
  AFFECTIVE_ATTRIBUTES,
  FLAVOR_FAMILIES,
  MOUTHFEEL_OPTIONS,
  MAIN_TASTES,
  SENSORY_DEFECT_LABELS,
  type SensoryDefect,
} from "@/lib/constants";
import { calcIndividualScore, calcAffectiveSum } from "@/lib/scoring";

// ─── Colour palette ────────────────────────────────────────────────────────────
const C = {
  green: "#3D5A3E",
  greenLight: "#E8F0E8",
  brown: "#3B2F20",
  brownMid: "#6B5A42",
  brownLight: "#D4C5A9",
  cream: "#F0EBE0",
  creamPage: "#FDFBF7",
  red: "#A83232",
  white: "#FFFFFF",
};

// ─── Global print CSS ───────────────────────────────────────────────────────────
const PRINT_STYLE = `
  @media print {
    .no-print { display: none !important; }
    .mobile-print-overlay { display: none !important; }
    body { background: white !important; margin: 0 !important; padding: 0 !important; }
    .print-area { padding: 0 !important; }
    .print-topbar-pad { padding-top: 0 !important; }
    .print-document { display: block !important; }
  }
  @page { size: A4; margin: 12mm 14mm; }
  @media screen and (max-width: 767px) {
    .mobile-print-overlay { display: flex !important; }
    .print-document { display: none !important; }
    .no-print { display: none !important; }
  }
  @media screen and (min-width: 768px) {
    .mobile-print-overlay { display: none !important; }
  }
`;

// ─── Types ──────────────────────────────────────────────────────────────────────
type D = Record<string, unknown>;

type SampleData = {
  id: string;
  label: string;
  coffeeName: string | null;
  descriptive: D;
  affective: D;
  combined: D;
  physical: D;
  extrinsic: D;
};

// ─── Sub-components ─────────────────────────────────────────────────────────────

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${C.brownLight}`,
        borderRadius: 4,
        marginBottom: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: C.cream,
          borderBottom: `1px solid ${C.brownLight}`,
          padding: "3px 8px",
          fontSize: 8,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: "uppercase" as const,
          color: C.brown,
        }}
      >
        {title}
      </div>
      <div style={{ padding: "6px 8px" }}>{children}</div>
    </div>
  );
}

function IntensityBar({ value }: { value: number | null }) {
  const pct = value !== null ? Math.min(100, (value / 15) * 100) : 0;
  return (
    <div style={{ marginBottom: 2 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 7,
          color: C.brownMid,
          marginBottom: 1,
        }}
      >
        <span>0</span>
        <span>5</span>
        <span>10</span>
        <span>15</span>
      </div>
      <div
        style={{
          height: 7,
          background: C.cream,
          borderRadius: 3,
          position: "relative" as const,
          border: `1px solid ${C.brownLight}`,
        }}
      >
        {value !== null && (
          <div
            style={{
              width: `${pct}%`,
              background: C.green,
              height: "100%",
              borderRadius: "2px 0 0 2px",
            }}
          />
        )}
        {[5, 10].map((m) => (
          <div
            key={m}
            style={{
              position: "absolute" as const,
              left: `${(m / 15) * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: C.brownLight,
            }}
          />
        ))}
      </div>
      <div style={{ textAlign: "right", fontSize: 8, fontWeight: 700, color: C.green, marginTop: 1 }}>
        {value !== null ? `${value.toFixed(1)} / 15` : "— / 15"}
      </div>
    </div>
  );
}

function CheckBox({ checked, color = C.green }: { checked: boolean; color?: string }) {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        border: `1.5px solid ${color}`,
        background: checked ? color : C.white,
        borderRadius: 1,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {checked && (
        <span style={{ color: C.white, fontSize: 7, lineHeight: 1, fontWeight: 700 }}>✓</span>
      )}
    </div>
  );
}

function CupBox({ checked, color = C.green }: { checked: boolean; color?: string }) {
  return (
    <div
      style={{
        width: 14,
        height: 14,
        border: `1.5px solid ${color}`,
        background: checked ? color : C.white,
        borderRadius: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {checked && (
        <span style={{ color: C.white, fontSize: 9, lineHeight: 1, fontWeight: 700 }}>✓</span>
      )}
    </div>
  );
}

// Flat list of all CATA options for a flavor attribute (families + sub-items)
const FLAVOR_CATA_FLAT: { id: string; label: string; indent: boolean }[] = [];
for (const fam of FLAVOR_FAMILIES) {
  FLAVOR_CATA_FLAT.push({ id: fam.id, label: fam.label, indent: false });
  for (const sub of fam.subItems) {
    FLAVOR_CATA_FLAT.push({ id: sub.id, label: sub.label, indent: true });
  }
}

function FlavorCATAGrid({ selected }: { selected: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "2px 6px",
        fontSize: 7.5,
        color: C.brown,
      }}
    >
      {FLAVOR_CATA_FLAT.map((opt) => {
        const isSelected = selected.includes(opt.id);
        return (
          <div
            key={opt.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              paddingLeft: opt.indent ? 10 : 0,
              fontWeight: isSelected ? 700 : 400,
              color: isSelected ? C.green : C.brownMid,
            }}
          >
            <CheckBox checked={isSelected} />
            <span style={{ lineHeight: 1.2 }}>{opt.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MouthfeelGrid({ selected }: { selected: string[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "3px 12px", fontSize: 7.5 }}>
      {MOUTHFEEL_OPTIONS.map((opt) => {
        const isSelected = selected.includes(opt.id);
        return (
          <div
            key={opt.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontWeight: isSelected ? 700 : 400,
              color: isSelected ? C.green : C.brownMid,
            }}
          >
            <CheckBox checked={isSelected} />
            <span>{opt.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MainTastesRow({ selected }: { selected: string[] }) {
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 7.5 }}>
      {MAIN_TASTES.map((t) => {
        const isSelected = selected.includes(t.id);
        return (
          <div
            key={t.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontWeight: isSelected ? 700 : 400,
              color: isSelected ? C.green : C.brownMid,
            }}
          >
            <CheckBox checked={isSelected} />
            <span>{t.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AffectiveBubbleRow({
  firstValue,
  finalValue,
}: {
  firstValue: number | null;
  finalValue: number | null;
}) {
  const displayed = finalValue ?? firstValue;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const isDisplayed = n === displayed;
        const isFirst = n === firstValue && firstValue !== finalValue && finalValue !== null;
        return (
          <div
            key={n}
            style={{
              width: 17,
              height: 17,
              borderRadius: "50%",
              border: `1.5px solid ${C.green}`,
              background: isDisplayed ? C.green : isFirst ? C.greenLight : C.white,
              color: isDisplayed ? C.white : C.green,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 7.5,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {n}
          </div>
        );
      })}
      <div
        style={{
          border: `2px solid ${C.green}`,
          padding: "1px 5px",
          fontSize: 10,
          fontWeight: 700,
          minWidth: 22,
          textAlign: "center" as const,
          background: displayed ? C.greenLight : C.white,
          color: displayed ? C.green : C.brownMid,
        }}
      >
        {displayed ?? "—"}
      </div>
    </div>
  );
}

// ─── Descriptive section ────────────────────────────────────────────────────────

const DESCRIPTIVE_ATTRS = [
  { id: "fragancia", label: "Fragancia", cataType: "flavor" as const },
  { id: "aroma", label: "Aroma", cataType: "flavor" as const },
  { id: "sabor", label: "Sabor", cataType: "flavor" as const },
  { id: "sabor_residual", label: "Sabor Residual", cataType: "flavor" as const },
  { id: "acidez", label: "Acidez", cataType: "free" as const },
  { id: "dulzor", label: "Dulzor", cataType: "free" as const },
  { id: "sensacion", label: "Sensación en Boca", cataType: "mouthfeel" as const },
];

function DescriptiveSection({ data }: { data: D }) {
  const num = (k: string) => (data[k] as number | undefined) ?? null;
  const arr = (k: string): string[] => (data[k] as string[] | undefined) ?? [];
  const str = (k: string): string => (data[k] as string | undefined) ?? "";

  return (
    <SectionBox title="Parte 1 — Evaluación Descriptiva">
      {DESCRIPTIVE_ATTRS.map((attr) => {
        const intensity = num(`${attr.id}_int`);
        const descs = arr(`${attr.id}_desc`);
        const freeDesc = str(`${attr.id}_desc_libre`);
        const notes = str(`${attr.id}_notas`);

        return (
          <div
            key={attr.id}
            style={{
              marginBottom: 6,
              paddingBottom: 6,
              borderBottom: `1px solid ${C.cream}`,
            }}
          >
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                textTransform: "uppercase" as const,
                letterSpacing: 0.8,
                color: C.brown,
                marginBottom: 3,
              }}
            >
              {attr.label}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 7, color: C.brownMid, marginBottom: 1 }}>Intensidad (0–15)</div>
                <IntensityBar value={intensity} />
              </div>
              <div>
                <div style={{ fontSize: 7, color: C.brownMid, marginBottom: 2 }}>
                  {attr.cataType === "free" ? "Descriptores" : "CATA — selecciona hasta 5"}
                </div>
                {attr.cataType === "flavor" && <FlavorCATAGrid selected={descs} />}
                {attr.cataType === "mouthfeel" && <MouthfeelGrid selected={descs} />}
                {attr.cataType === "free" && (
                  <div
                    style={{
                      fontSize: 8,
                      color: freeDesc ? C.brown : C.brownMid,
                      minHeight: 16,
                      fontStyle: freeDesc ? "normal" : "italic",
                    }}
                  >
                    {freeDesc || "—"}
                  </div>
                )}
                {notes && (
                  <div style={{ fontSize: 7.5, color: C.brownMid, marginTop: 3, fontStyle: "italic" }}>
                    Notas: {notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Main tastes */}
      <div style={{ marginTop: 2 }}>
        <div style={{ fontSize: 7, fontWeight: 700, color: C.brownMid, textTransform: "uppercase" as const, letterSpacing: 0.8, marginBottom: 3 }}>
          Gustos Predominantes (máx. 2)
        </div>
        <MainTastesRow selected={arr("gustos")} />
      </div>
    </SectionBox>
  );
}

// ─── Affective section ──────────────────────────────────────────────────────────

function AffectiveSection({ data }: { data: D }) {
  const num = (k: string): number | null => (data[k] as number | undefined) ?? null;
  const str = (k: string): string => (data[k] as string | undefined) ?? "";

  return (
    <SectionBox title="Parte 2 — Evaluación Afectiva (Impresión de Calidad 1–9)">
      <div style={{ display: "flex", gap: 6, marginBottom: 4, fontSize: 7, color: C.brownMid }}>
        <span style={{ width: 110 }}>Atributo</span>
        <span>① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨</span>
        <span style={{ marginLeft: 8 }}>FINAL</span>
      </div>
      {AFFECTIVE_ATTRIBUTES.map((attr) => {
        const first = num(attr.id);
        const final = num(`${attr.id}_final`);
        const notes = str(`${attr.id}_notas`);

        return (
          <div
            key={attr.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              marginBottom: 5,
              paddingBottom: 5,
              borderBottom: `1px solid ${C.cream}`,
            }}
          >
            <div
              style={{
                width: 110,
                fontSize: 8,
                fontWeight: 600,
                color: C.brown,
                paddingTop: 2,
                flexShrink: 0,
              }}
            >
              {attr.label}
            </div>
            <div style={{ flex: 1 }}>
              <AffectiveBubbleRow firstValue={first} finalValue={final} />
              {notes && (
                <div style={{ fontSize: 7.5, color: C.brownMid, marginTop: 2, fontStyle: "italic" }}>
                  {notes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </SectionBox>
  );
}

// ─── Cups & defects section ─────────────────────────────────────────────────────

function DefectsSection({ data, cupsPerSample }: { data: D; cupsPerSample: number }) {
  const cups = Math.max(cupsPerSample, 1);
  const nonUniform = (data.tazas_no_uniformes as boolean[] | undefined) ?? Array(cups).fill(false);
  const defective = (data.tazas_defectuosas as boolean[] | undefined) ?? Array(cups).fill(false);
  const defectTypes = (data.defecto_tipo as string[] | undefined) ?? [];

  const uCount = nonUniform.filter(Boolean).length;
  const dCount = defective.filter(Boolean).length;

  return (
    <div
      style={{
        border: `1px solid ${C.brownLight}`,
        borderRadius: 4,
        padding: "6px 8px",
        marginBottom: 8,
        fontSize: 8,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 8,
          alignItems: "center",
        }}
      >
        {/* Non-uniform */}
        <div>
          <div style={{ fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.8, fontSize: 7, color: C.brownMid, marginBottom: 3 }}>
            Tazas No Uniformes {uCount > 0 && <span style={{ color: C.red }}>({uCount})</span>}
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: cups }, (_, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 6.5, color: C.brownMid }}>{i + 1}</span>
                <CupBox checked={nonUniform[i] === true} />
              </div>
            ))}
          </div>
        </div>

        {/* Defective */}
        <div>
          <div style={{ fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.8, fontSize: 7, color: C.brownMid, marginBottom: 3 }}>
            Tazas Defectuosas {dCount > 0 && <span style={{ color: C.red }}>({dCount})</span>}
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: cups }, (_, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2 }}>
                <span style={{ fontSize: 6.5, color: C.brownMid }}>{i + 1}</span>
                <CupBox checked={defective[i] === true} color={C.red} />
              </div>
            ))}
          </div>
        </div>

        {/* Defect types */}
        <div>
          <div style={{ fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.8, fontSize: 7, color: C.brownMid, marginBottom: 3 }}>
            Tipo de Defecto
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["potato", "moldy", "phenolic"] as SensoryDefect[]).map((k) => {
              const isSelected = defectTypes.includes(k);
              return (
                <div
                  key={k}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    fontWeight: isSelected ? 700 : 400,
                    color: isSelected ? C.red : C.brownMid,
                    fontSize: 7.5,
                  }}
                >
                  <CheckBox checked={isSelected} color={C.red} />
                  <span>{SENSORY_DEFECT_LABELS[k]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Score box ──────────────────────────────────────────────────────────────────

function ScoreBox({ data, cupsPerSample }: { data: D; cupsPerSample: number }) {
  const { sum } = calcAffectiveSum(data);
  const nonUniform = (data.tazas_no_uniformes as boolean[] | undefined) ?? [];
  const defective = (data.tazas_defectuosas as boolean[] | undefined) ?? [];
  const u = cupsPerSample >= 5 ? nonUniform.filter(Boolean).length : 0;
  const d = cupsPerSample >= 5 ? defective.filter(Boolean).length : 0;
  const score = calcIndividualScore(data, cupsPerSample);

  return (
    <div
      style={{
        border: `2px solid ${C.green}`,
        borderRadius: 6,
        padding: "10px 14px",
        width: 180,
        marginLeft: "auto",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          fontSize: 7,
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          color: C.brownMid,
          marginBottom: 2,
        }}
      >
        Puntaje CVA
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: C.green,
          lineHeight: 1.1,
          marginBottom: 4,
        }}
      >
        {score}
      </div>
      <div
        style={{
          fontSize: 7,
          color: C.brownMid,
          fontStyle: "italic",
          marginBottom: 4,
        }}
      >
        0.65625 × Σhᵢ + 52.75 − 2u − 4d
      </div>
      <div
        style={{
          borderTop: `1px solid ${C.brownLight}`,
          paddingTop: 4,
          fontSize: 8,
          color: C.brown,
          display: "flex",
          gap: 8,
        }}
      >
        <span>Σhᵢ = {sum}</span>
        <span>u = {u}</span>
        <span>d = {d}</span>
      </div>
    </div>
  );
}

// ─── Extrinsic info strip ───────────────────────────────────────────────────────

function ExtrinsicStrip({ data, coffeeName }: { data: D; coffeeName: string | null }) {
  const fields = [
    coffeeName ? { label: "Café", value: coffeeName } : null,
    data.ext_pais && data.ext_pais_val ? { label: "País", value: String(data.ext_pais_val) } : null,
    data.ext_region && data.ext_region_val ? { label: "Región", value: String(data.ext_region_val) } : null,
    data.ext_finca && data.ext_finca_val ? { label: "Finca", value: String(data.ext_finca_val) } : null,
    data.ext_productor && data.ext_productor_val ? { label: "Productor", value: String(data.ext_productor_val) } : null,
    data.ext_variedad && data.ext_variedad_val ? { label: "Variedad", value: String(data.ext_variedad_val) } : null,
    data.ext_proceso_tipo ? { label: "Proceso", value: String(data.ext_proceso_tipo) } : null,
    data.ext_cosecha && data.ext_cosecha_val ? { label: "Cosecha", value: String(data.ext_cosecha_val) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  if (!fields.length) return null;

  return (
    <div
      style={{
        background: C.greenLight,
        border: `1px solid ${C.green}`,
        borderRadius: 4,
        padding: "4px 8px",
        display: "flex",
        flexWrap: "wrap" as const,
        gap: "3px 16px",
        fontSize: 8,
        marginBottom: 8,
      }}
    >
      {fields.map((f) => (
        <span key={f.label}>
          <span style={{ color: C.brownMid }}>{f.label}:</span>{" "}
          <span style={{ fontWeight: 700, color: C.brown }}>{f.value}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Per-sample section ─────────────────────────────────────────────────────────

function SampleSection({
  sample,
  session,
}: {
  sample: SampleData;
  session: { format: string; cupsPerSample: number };
}) {
  const isAffective = session.format === "affective";
  const isCombined = session.format === "combined";
  const isDescriptive = session.format === "descriptive";

  const descData = isDescriptive ? sample.descriptive : isCombined ? sample.combined : null;
  const affData = isAffective ? sample.affective : isCombined ? sample.combined : null;
  const hasScore = !!affData && Object.keys(affData).length > 0;

  return (
    <div style={{ marginBottom: 20, pageBreakInside: "avoid" }}>
      {/* Sample header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: `2px solid ${C.green}`,
          paddingBottom: 6,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: C.green,
            color: C.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {sample.label}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.brown }}>
            Muestra {sample.label}
            {sample.coffeeName && (
              <span style={{ fontSize: 11, fontWeight: 400, color: C.brownMid, marginLeft: 8 }}>
                — {sample.coffeeName}
              </span>
            )}
          </div>
          <div style={{ fontSize: 8, color: C.brownMid, textTransform: "uppercase" as const, letterSpacing: 1 }}>
            {session.format === "descriptive"
              ? "Evaluación Descriptiva"
              : session.format === "affective"
                ? "Evaluación Afectiva"
                : "Evaluación Combinada"}
          </div>
        </div>
      </div>

      {/* Extrinsic info */}
      <ExtrinsicStrip data={sample.extrinsic} coffeeName={sample.coffeeName} />

      {/* Descriptive */}
      {descData && Object.keys(descData).length > 0 && (
        <DescriptiveSection data={descData} />
      )}

      {/* Affective */}
      {affData && Object.keys(affData).length > 0 && (
        <AffectiveSection data={affData} />
      )}

      {/* Defects row */}
      {affData && (
        <DefectsSection data={affData} cupsPerSample={session.cupsPerSample} />
      )}

      {/* Score */}
      {hasScore && (
        <ScoreBox data={affData!} cupsPerSample={session.cupsPerSample} />
      )}

      {/* Cupper signature line */}
      <div
        style={{
          display: "flex",
          gap: 32,
          marginTop: 8,
          fontSize: 8,
          color: C.brownMid,
          borderTop: `1px dashed ${C.brownLight}`,
          paddingTop: 6,
        }}
      >
        <span>Catador: ______________________________________</span>
        <span>Firma: ______________________</span>
        <span>Fecha: ____________________</span>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function PrintClient({
  session,
}: {
  session: {
    id: string;
    name: string;
    format: string;
    cupsPerSample: number;
    date: string;
    objective?: string | null;
    cupperName: string;
    samples: SampleData[];
  };
}) {
  const formatLabel =
    session.format === "descriptive"
      ? "Descriptivo"
      : session.format === "affective"
        ? "Afectivo"
        : "Combinado";

  return (
    <div
      style={{
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: C.brown,
        fontSize: 11,
        lineHeight: 1.4,
        background: C.creamPage,
        minHeight: "100vh",
      }}
    >
      <style>{PRINT_STYLE}</style>

      {/* Mobile-only overlay — clean print/share screen */}
      <div
        className="mobile-print-overlay"
        style={{
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "40px 28px",
          background: C.creamPage,
          gap: 28,
          textAlign: "center" as const,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: 22,
              fontWeight: 700,
              color: C.green,
              lineHeight: 1.2,
              marginBottom: 10,
            }}
          >
            {session.name}
          </div>
          <div
            style={{
              display: "inline-block",
              background: C.green,
              color: C.white,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "1.5px",
              textTransform: "uppercase" as const,
              padding: "3px 10px",
              borderRadius: 3,
            }}
          >
            SCA CVA · {formatLabel}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 16,
              color: C.brown,
              fontWeight: 600,
              marginBottom: 10,
              lineHeight: 1.4,
            }}
          >
            Tu evaluación está lista para exportar como PDF.
          </div>
          <div style={{ fontSize: 13, color: C.brownMid, lineHeight: 1.7 }}>
            Toca el botón para abrir el diálogo de impresión.{" "}
            Elige &quot;Guardar como PDF&quot; y comparte el archivo.
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 12, width: "100%", maxWidth: 320 }}>
          <button
            onClick={() => window.print()}
            style={{
              background: C.green,
              color: C.white,
              border: "none",
              padding: "15px 0",
              borderRadius: 9,
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
              width: "100%",
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            🖨 Guardar como PDF
          </button>
          <button
            onClick={() => window.history.back()}
            style={{
              background: "transparent",
              border: `1px solid ${C.brownLight}`,
              color: C.brownMid,
              padding: "12px 0",
              borderRadius: 9,
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
            }}
          >
            ← Volver
          </button>
        </div>
      </div>

      {/* Screen-only top bar */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: C.green,
          color: C.white,
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 100,
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        <button
          onClick={() => window.history.back()}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.4)",
            color: C.white,
            padding: "5px 12px",
            borderRadius: 5,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ← Volver
        </button>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", flex: 1 }}>
          Ctrl+P / Cmd+P → &quot;Guardar como PDF&quot; para exportar en A4
        </span>
        <button
          onClick={() => window.print()}
          style={{
            background: C.white,
            color: C.green,
            border: "none",
            padding: "7px 18px",
            borderRadius: 5,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          🖨 Imprimir / PDF
        </button>
      </div>

      {/* Printable area */}
      <div className="print-document">
      <div
        className="print-topbar-pad"
        style={{ paddingTop: 52, maxWidth: 760, margin: "0 auto", padding: "64px 24px 24px" }}
      >
        {/* Document header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            borderBottom: `3px solid ${C.green}`,
            paddingBottom: 10,
            marginBottom: 16,
          }}
        >
          {/* Left: branding */}
          <div>
            <div
              style={{
                fontSize: 8,
                letterSpacing: 3,
                textTransform: "uppercase" as const,
                color: C.brownMid,
                marginBottom: 2,
              }}
            >
              Cata Café Sensible
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.brown, lineHeight: 1.1 }}>
              {session.name}
            </div>
            <div style={{ fontSize: 9, color: C.brownMid, marginTop: 3 }}>
              {session.date}
              {session.objective && (
                <span style={{ marginLeft: 8, fontStyle: "italic" }}>{session.objective}</span>
              )}
            </div>
            {session.cupperName && (
              <div style={{ fontSize: 9, color: C.brownMid, marginTop: 1 }}>
                Catador: <strong>{session.cupperName}</strong>
              </div>
            )}
          </div>

          {/* Right: format badge */}
          <div
            style={{
              border: `2px solid ${C.green}`,
              borderRadius: 6,
              padding: "6px 12px",
              textAlign: "center" as const,
            }}
          >
            <div style={{ fontSize: 7, letterSpacing: 2, textTransform: "uppercase" as const, color: C.green }}>
              SCA CVA 2024
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{formatLabel}</div>
            <div style={{ fontSize: 7.5, color: C.brownMid, marginTop: 2 }}>
              {session.cupsPerSample} tazas / muestra
            </div>
          </div>
        </div>

        {/* Per-sample sections */}
        {session.samples.map((sample) => (
          <SampleSection key={sample.id} sample={sample} session={session} />
        ))}

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${C.brownLight}`,
            paddingTop: 8,
            marginTop: 16,
            fontSize: 8,
            color: C.brownMid,
            textAlign: "center" as const,
          }}
        >
          Cata Café Sensible · Evaluación CVA SCA · Coffee Value Assessment v2 · {session.date}
        </div>
      </div>
      </div>{/* /print-document */}
    </div>
  );
}
