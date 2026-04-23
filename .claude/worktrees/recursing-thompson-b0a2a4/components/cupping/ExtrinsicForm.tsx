"use client";

import { CERTIFICATIONS, PROCESS_TYPES } from "@/lib/constants";
import { Section } from "./Section";
import { NotesInput } from "./NotesInput";

type Data = Record<string, unknown>;

export function ExtrinsicForm({
  sampleData,
  onChange,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const bool = (k: string) => (d[k] as boolean | undefined) ?? false;
  const str = (k: string) => (d[k] as string | undefined) ?? "";
  const arr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];

  const CheckField = ({ id, label }: { id: string; label: string }) => (
    <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "pointer" }}>
      <input
        type="checkbox"
        checked={bool(id)}
        onChange={(e) => set(id, e.target.checked)}
        style={{ accentColor: "#3D5A3E" }}
      />
      <span style={{ fontSize: 13, color: "#5C4A32" }}>{label}</span>
    </label>
  );

  const TextField = ({ id, placeholder }: { id: string; placeholder: string }) => (
    <input
      type="text"
      value={str(id)}
      onChange={(e) => set(id, e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "6px 10px",
        border: "1px solid #D4C5A9",
        borderRadius: 6,
        fontSize: 13,
        background: "#FEFCF8",
        color: "#5C4A32",
        boxSizing: "border-box",
        marginBottom: 6,
        fontFamily: "inherit",
      }}
    />
  );

  return (
    <div>
      <div
        style={{
          fontSize: 11,
          color: "#8B7355",
          marginBottom: 12,
          padding: 8,
          background: "#F5F0E6",
          borderRadius: 8,
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        Fase POST-CATA — Rellenar después de revelar la identidad de las muestras
      </div>

      <Section title="Cultivo">
        <CheckField id="ext_pais" label="País" />
        {bool("ext_pais") && <TextField id="ext_pais_val" placeholder="País..." />}
        <CheckField id="ext_region" label="Región" />
        {bool("ext_region") && <TextField id="ext_region_val" placeholder="Región..." />}
        <CheckField id="ext_finca" label="Nombre de la finca/cooperativa" />
        {bool("ext_finca") && <TextField id="ext_finca_val" placeholder="Finca..." />}
        <CheckField id="ext_productor" label="Productor(es)" />
        {bool("ext_productor") && <TextField id="ext_productor_val" placeholder="Productor..." />}
        <CheckField id="ext_especie" label="Especie" />
        {bool("ext_especie") && <TextField id="ext_especie_val" placeholder="Arabica..." />}
        <CheckField id="ext_variedad" label="Variedad(es)" />
        {bool("ext_variedad") && <TextField id="ext_variedad_val" placeholder="Gesha, Caturra..." />}
        <CheckField id="ext_cosecha" label="Fecha/Año de cosecha" />
        {bool("ext_cosecha") && <TextField id="ext_cosecha_val" placeholder="2024/2025..." />}
        <div style={{ marginTop: 6 }}>
          <NotesInput
            value={str("ext_cultivo_notas")}
            onChange={(v) => set("ext_cultivo_notas", v)}
            placeholder="Información sobre el cultivo..."
          />
        </div>
      </Section>

      <Section title="Procesamiento">
        <CheckField id="ext_beneficiador" label="Beneficiador(es)" />
        {bool("ext_beneficiador") && (
          <TextField id="ext_beneficiador_val" placeholder="Beneficiador..." />
        )}
        <CheckField id="ext_descafeinado" label="Descafeinado" />

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#8B7355", marginBottom: 4 }}>
            Tipo de proceso
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {PROCESS_TYPES.map((pt) => {
              const active = str("ext_proceso_tipo") === pt;
              return (
                <button
                  key={pt}
                  onClick={() => set("ext_proceso_tipo", active ? null : pt)}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 12,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    border: active ? "1px solid #3D5A3E" : "1px solid #D4C5A9",
                    background: active ? "#3D5A3E" : "transparent",
                    color: active ? "#FFF" : "#8B7355",
                  }}
                >
                  {pt}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
          <NotesInput
            value={str("ext_proceso_notas")}
            onChange={(v) => set("ext_proceso_notas", v)}
            placeholder="Descripción del proceso..."
          />
        </div>
      </Section>

      <Section title="Comercio">
        <CheckField id="ext_clasificacion" label="Clasificación local/regional" />
        {bool("ext_clasificacion") && (
          <TextField id="ext_clasificacion_val" placeholder="Clasificación..." />
        )}
        <CheckField id="ext_oic" label="Número OIC" />
        {bool("ext_oic") && <TextField id="ext_oic_val" placeholder="OIC..." />}
        <CheckField id="ext_importador" label="Nombre del importador" />
        {bool("ext_importador") && (
          <TextField id="ext_importador_val" placeholder="Importador..." />
        )}
        <CheckField id="ext_exportador" label="Nombre del exportador" />
        {bool("ext_exportador") && (
          <TextField id="ext_exportador_val" placeholder="Exportador..." />
        )}
        <CheckField id="ext_precio" label="Precio al productor" />
        {bool("ext_precio") && <TextField id="ext_precio_val" placeholder="USD/lb..." />}
        <CheckField id="ext_lote" label="Tamaño del lote" />
        {bool("ext_lote") && <TextField id="ext_lote_val" placeholder="kg o sacos..." />}
        <CheckField id="ext_comercio_otro" label="Otro" />
        {bool("ext_comercio_otro") && (
          <TextField id="ext_comercio_otro_val" placeholder="Otro dato comercial..." />
        )}
        <div style={{ marginTop: 6 }}>
          <NotesInput
            value={str("ext_comercio_notas")}
            onChange={(v) => set("ext_comercio_notas", v)}
            placeholder="Notas comerciales..."
          />
        </div>
      </Section>

      <Section title="Certificaciones">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {CERTIFICATIONS.map((cert) => {
            const active = arr("ext_certs").includes(cert);
            return (
              <button
                key={cert}
                onClick={() => {
                  const cur = arr("ext_certs");
                  set("ext_certs", active ? cur.filter((x) => x !== cert) : [...cur, cert]);
                }}
                style={{
                  padding: "4px 12px",
                  borderRadius: 12,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: active ? "1px solid #3D5A3E" : "1px solid #D4C5A9",
                  background: active ? "#3D5A3E" : "transparent",
                  color: active ? "#FFF" : "#8B7355",
                }}
              >
                {cert}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 6 }}>
          <NotesInput
            value={str("ext_certs_notas")}
            onChange={(v) => set("ext_certs_notas", v)}
            placeholder="Notas sobre certificaciones..."
          />
        </div>
      </Section>

      <Section title="Otro">
        <NotesInput
          value={str("ext_otro_notas")}
          onChange={(v) => set("ext_otro_notas", v)}
          placeholder="Otra información relevante..."
        />
      </Section>
    </div>
  );
}
