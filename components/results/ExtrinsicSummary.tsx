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
    <div className="mt-2.5 rounded-input border border-outline-variant bg-surface-container-low px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="font-display text-[11px] font-bold text-primary-container">
          Datos de la muestra (extrínseco)
        </span>
        <span className="inline-flex items-center rounded-pill border border-secondary bg-surface-container px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest text-secondary">
          Beta
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-1.5 text-[11.5px] leading-snug">
            <span className="shrink-0 font-semibold text-on-surface-variant">{row.label}:</span>
            <span className="min-w-0 text-on-surface">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
