/**
 * Read-only, compact display of whatever extrinsic (origin/process/trade)
 * data any participant filled in for a sample. Extrinsic data is per-sample
 * (one ExtrinsicData row per SessionSample), not per-cupper — so "any
 * participant filled it" just means the row has data.
 *
 * Field keys and Spanish labels mirror components/cupping/ExtrinsicForm.tsx
 * so the two surfaces stay in sync. Visibility only — no editing here.
 */

type Data = Record<string, unknown>;

// Ordered list of (checkbox key -> value key, label) pairs, grouped the same
// way as ExtrinsicForm's sections. Notes fields are included as their own
// rows when present.
const FIELD_ROWS: { key: string; label: string }[] = [
  // Cultivo
  { key: "ext_pais_val", label: "País" },
  { key: "ext_region_val", label: "Región" },
  { key: "ext_finca_val", label: "Finca/cooperativa" },
  { key: "ext_productor_val", label: "Productor(es)" },
  { key: "ext_especie_val", label: "Especie" },
  { key: "ext_variedad_val", label: "Variedad(es)" },
  { key: "ext_cosecha_val", label: "Fecha/Año de cosecha" },
  { key: "ext_cultivo_notas", label: "Notas de cultivo" },
  // Procesamiento
  { key: "ext_beneficiador_val", label: "Beneficiador(es)" },
  { key: "ext_proceso_tipo", label: "Tipo de proceso" },
  { key: "ext_proceso_notas", label: "Descripción del proceso" },
  // Comercio
  { key: "ext_clasificacion_val", label: "Clasificación local/regional" },
  { key: "ext_oic_val", label: "Número OIC" },
  { key: "ext_importador_val", label: "Importador" },
  { key: "ext_exportador_val", label: "Exportador" },
  { key: "ext_precio_val", label: "Precio al productor" },
  { key: "ext_lote_val", label: "Tamaño del lote" },
  { key: "ext_comercio_otro_val", label: "Otro (comercio)" },
  { key: "ext_comercio_notas", label: "Notas comerciales" },
  // Certificaciones
  { key: "ext_certs", label: "Certificaciones" },
  { key: "ext_certs_notas", label: "Notas sobre certificaciones" },
  // Otro
  { key: "ext_otro_notas", label: "Otra información" },
];

const BOOL_ONLY_LABELS: Record<string, string> = {
  ext_descafeinado: "Descafeinado",
};

function formatValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (Array.isArray(v)) {
    const items = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    return items.length > 0 ? items.join(", ") : null;
  }
  if (typeof v === "boolean") return v ? "Sí" : null;
  if (typeof v === "number") return String(v);
  return null;
}

export function extrinsicRows(data: Data): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  for (const { key, label } of FIELD_ROWS) {
    const value = formatValue(data[key]);
    if (value) rows.push({ label, value });
  }
  for (const [key, label] of Object.entries(BOOL_ONLY_LABELS)) {
    if (data[key] === true) rows.push({ label, value: "Sí" });
  }
  return rows;
}

export function ExtrinsicSummary({ data }: { data: Data }) {
  const rows = extrinsicRows(data);
  if (rows.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 10,
        background: "#FDFBF7",
        border: "1px solid #E8E0D0",
        borderRadius: 9,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#3D5A3E",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
          }}
        >
          Datos de la muestra (extrínseco)
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid #9d4326",
            color: "#9d4326",
            background: "#f6ece8",
            borderRadius: 999,
            padding: "1px 7px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "monospace",
          }}
        >
          Beta
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{ display: "flex", gap: 6, fontSize: 11.5, lineHeight: 1.4 }}
          >
            <span style={{ color: "#8B7355", fontWeight: 600, flexShrink: 0 }}>
              {row.label}:
            </span>
            <span style={{ color: "#5C4A32", minWidth: 0 }}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
