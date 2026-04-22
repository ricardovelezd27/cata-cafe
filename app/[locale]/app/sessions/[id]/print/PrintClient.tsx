"use client";

import {
  AFFECTIVE_ATTRIBUTES,
  FLAVOR_TREE,
  ACIDITY_DESCRIPTORS,
  SWEETNESS_DESCRIPTORS,
  MOUTHFEEL_DESCRIPTORS,
} from "@/lib/constants";
import { calcIndividualScore } from "@/lib/scoring";

function resolveLabel(id: string): string {
  for (const cat of FLAVOR_TREE) {
    if (cat.id === id) return cat.label;
    for (const sub of cat.subs) {
      if (sub.id === id) return sub.label;
    }
  }
  for (const d of [...ACIDITY_DESCRIPTORS, ...SWEETNESS_DESCRIPTORS]) {
    if (d.id === id) return d.label;
  }
  for (const d of MOUTHFEEL_DESCRIPTORS) {
    if (d.id === id) return d.label;
  }
  return id;
}

type SampleResult = {
  id: string;
  label: string;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
  physical: Record<string, unknown>;
  extrinsic: Record<string, unknown>;
};

const PRINT_STYLE = `
  @media print {
    .no-print { display: none !important; }
    body { margin: 0; padding: 0; }
  }
  @page { size: A4; margin: 12mm; }
`;

const DESCRIPTIVE_ATTRS = [
  { id: "fragancia", label: "Fragancia" },
  { id: "aroma", label: "Aroma" },
  { id: "sabor", label: "Sabor" },
  { id: "residual", label: "Sabor Residual" },
  { id: "acidez", label: "Acidez" },
  { id: "dulzor", label: "Dulzor" },
  { id: "sensacion", label: "Sensación en Boca" },
];

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
    samples: SampleResult[];
  };
}) {
  const isAffective = session.format === "affective";
  const isCombined = session.format === "combined";
  const isDescriptive = session.format === "descriptive";
  const showAffective = isAffective || isCombined;
  const showDescriptive = isDescriptive || isCombined;

  const baseStyle: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    color: "#3B2F20",
    fontSize: 11,
    lineHeight: 1.4,
  };

  const thStyle: React.CSSProperties = {
    background: "#F0EBE0",
    padding: "4px 6px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 10,
    borderBottom: "1px solid #D4C5A9",
  };

  const tdStyle: React.CSSProperties = {
    padding: "4px 6px",
    borderBottom: "1px solid #F0EBE0",
    verticalAlign: "top",
  };

  return (
    <div style={baseStyle}>
      <style>{PRINT_STYLE}</style>

      {/* No-print controls */}
      <div
        className="no-print"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          background: "#3D5A3E",
          color: "#FFF",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 100,
        }}
      >
        <button
          onClick={() => window.history.back()}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.4)",
            color: "#FFF",
            padding: "6px 12px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ← Volver
        </button>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", flex: 1 }}>
          Pulsa el botón o usa Ctrl+P / Cmd+P → selecciona &quot;Guardar como PDF&quot;
        </span>
        <button
          onClick={() => window.print()}
          style={{
            background: "#FFF",
            color: "#3D5A3E",
            border: "none",
            padding: "8px 16px",
            borderRadius: 6,
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          🖨 Imprimir / PDF
        </button>
      </div>

      {/* Print area */}
      <div style={{ paddingTop: 56 }}>
        {/* Print header */}
        <div
          style={{
            textAlign: "center",
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: "2px solid #3B2F20",
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: 3,
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            CATA CAFÉ SENSIBLE
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {session.name}
          </div>
          <div style={{ fontSize: 10, color: "#6B5A42" }}>
            {session.date} &nbsp;·&nbsp;{" "}
            {session.format.charAt(0).toUpperCase() + session.format.slice(1)} &nbsp;·&nbsp;{" "}
            {session.cupsPerSample} tazas/muestra
          </div>
          {session.objective && (
            <div style={{ fontSize: 10, color: "#6B5A42", marginTop: 4, fontStyle: "italic" }}>
              {session.objective}
            </div>
          )}
        </div>

        {/* Per-sample sections */}
        {session.samples.map((sample) => {
          const affData = isAffective
            ? sample.affective
            : isCombined
              ? sample.combined
              : null;
          const descData = isDescriptive
            ? sample.descriptive
            : isCombined
              ? sample.combined
              : null;
          const score = affData ? calcIndividualScore(affData, session.cupsPerSample) : null;
          const nonUniform = (affData?.tazas_no_uniformes as boolean[] | undefined) ?? [];
          const defective = (affData?.tazas_defectuosas as boolean[] | undefined) ?? [];
          const uCount = nonUniform.filter(Boolean).length;
          const dCount = defective.filter(Boolean).length;
          const defectTypes = (affData?.defecto_tipo as string[] | undefined) ?? [];

          const hasExtrinsic = Object.values(sample.extrinsic).some(
            (v) => v && v !== false && v !== "" && (Array.isArray(v) ? v.length > 0 : true)
          );

          return (
            <div
              key={sample.id}
              style={{ pageBreakInside: "avoid", marginBottom: 24 }}
            >
              {/* Sample header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  borderBottom: "1px solid #3B2F20",
                  paddingBottom: 4,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>{sample.label}</div>
                {score !== null && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, letterSpacing: 1 }}>PUNTAJE CVA</div>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{score}</div>
                  </div>
                )}
              </div>

              {/* Descriptive table */}
              {showDescriptive && descData && (
                <div style={{ marginBottom: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: "22%" }}>Atributo</th>
                        <th style={{ ...thStyle, width: "12%" }}>Intensidad</th>
                        <th style={{ ...thStyle, width: "36%" }}>Descriptores</th>
                        <th style={{ ...thStyle, width: "30%" }}>Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DESCRIPTIVE_ATTRS.map((attr) => {
                        const val = descData[`${attr.id}_int`] as number | undefined;
                        const descs =
                          (descData[`${attr.id}_desc`] as string[] | undefined) ?? [];
                        const notes = (descData[`${attr.id}_notas`] as string | undefined) ?? "";
                        return (
                          <tr key={attr.id}>
                            <td style={tdStyle}>{attr.label}</td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              {val !== undefined ? val.toFixed(1) : "—"}
                            </td>
                            <td style={tdStyle}>
                              {descs.map(resolveLabel).join(", ") || "—"}
                            </td>
                            <td style={tdStyle}>{notes || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Affective table */}
              {showAffective && affData && (
                <div style={{ marginBottom: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: "35%" }}>Atributo</th>
                        <th style={{ ...thStyle, width: "25%" }}>1ª Impresión</th>
                        <th style={{ ...thStyle, width: "20%" }}>FINAL</th>
                        <th style={{ ...thStyle, width: "20%" }}>Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {AFFECTIVE_ATTRIBUTES.map((attr) => {
                        const first = affData[attr.id] as number | undefined;
                        const final =
                          (affData[`${attr.id}_final`] as number | undefined) || first;
                        const notes =
                          (affData[`${attr.id}_notas`] as string | undefined) ?? "";
                        return (
                          <tr key={attr.id}>
                            <td style={tdStyle}>{attr.label}</td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              {first ?? "—"}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center", fontWeight: 700 }}>
                              {final ?? "—"}
                            </td>
                            <td style={tdStyle}>{notes || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Cups penalty row */}
              {(uCount > 0 || dCount > 0) && (
                <div style={{ fontSize: 10, color: "#A83232", marginBottom: 6 }}>
                  {uCount > 0 && (
                    <span style={{ marginRight: 12 }}>
                      No uniformes: {uCount} taza{uCount > 1 ? "s" : ""} (−{2 * uCount} pts)
                    </span>
                  )}
                  {dCount > 0 && (
                    <span>
                      Defectuosas: {dCount} taza{dCount > 1 ? "s" : ""} (−{4 * dCount} pts)
                      {defectTypes.length > 0 && ` [${defectTypes.join(", ")}]`}
                    </span>
                  )}
                </div>
              )}

              {/* Extrinsic table */}
              {hasExtrinsic && (
                <div style={{ marginBottom: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: "30%" }}>Datos extrínsecos</th>
                        <th style={{ ...thStyle, width: "70%" }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: "País", valKey: "ext_pais_val", check: "ext_pais" },
                        { label: "Región", valKey: "ext_region_val", check: "ext_region" },
                        { label: "Finca", valKey: "ext_finca_val", check: "ext_finca" },
                        { label: "Productor", valKey: "ext_productor_val", check: "ext_productor" },
                        { label: "Variedad", valKey: "ext_variedad_val", check: "ext_variedad" },
                        { label: "Cosecha", valKey: "ext_cosecha_val", check: "ext_cosecha" },
                        { label: "Proceso", valKey: "ext_proceso_tipo" },
                        { label: "Importador", valKey: "ext_importador_val", check: "ext_importador" },
                        { label: "Exportador", valKey: "ext_exportador_val", check: "ext_exportador" },
                        { label: "Precio", valKey: "ext_precio_val", check: "ext_precio" },
                        { label: "Lote", valKey: "ext_lote_val", check: "ext_lote" },
                      ].map(({ label, valKey, check }) => {
                        if (check && !sample.extrinsic[check]) return null;
                        const val = sample.extrinsic[valKey] as string | undefined;
                        if (!val) return null;
                        return (
                          <tr key={valKey}>
                            <td style={tdStyle}>{label}</td>
                            <td style={tdStyle}>{val}</td>
                          </tr>
                        );
                      })}
                      {(() => {
                        const certs = (sample.extrinsic.ext_certs as string[] | undefined) ?? [];
                        if (!certs.length) return null;
                        return (
                          <tr key="certs">
                            <td style={tdStyle}>Certificaciones</td>
                            <td style={tdStyle}>{certs.join(", ")}</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}

        {/* Print footer */}
        <div
          style={{
            marginTop: 24,
            paddingTop: 8,
            borderTop: "1px solid #D4C5A9",
            fontSize: 9,
            color: "#8B7355",
            textAlign: "center",
          }}
        >
          Cata Café Sensible · Sistema de Evaluación del Café SCA · Coffee Value Assessment v2
        </div>
      </div>
    </div>
  );
}
