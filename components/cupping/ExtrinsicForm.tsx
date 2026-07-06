"use client";

import { CERTIFICATIONS, PROCESS_TYPES } from "@/lib/constants";
import { FormSection, Notes, BetaBadge } from "@/components/ui";

type Data = Record<string, unknown>;

// ─── Sub-components (extracted to satisfy react-hooks/static-components) ─────

interface CheckFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function CheckField({ id, label, checked, onChange }: CheckFieldProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 mb-1.5 cursor-pointer text-brown-dark text-sm"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-green-dark w-4 h-4"
      />
      <span>{label}</span>
    </label>
  );
}

interface TextFieldProps {
  id: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}

function TextField({ id, value, placeholder, onChange }: TextFieldProps) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full mb-2 px-3 py-1.5 border border-brown-light rounded-sm text-sm bg-cream text-brown-dark focus:outline-none focus:border-green-dark focus:ring-2 focus:ring-green-light/40"
    />
  );
}

interface PillButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function PillButton({ active, onClick, children }: PillButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-pill border text-xs font-medium transition-colors ${
        active
          ? "bg-green-dark text-white border-green-dark"
          : "bg-transparent text-brown-dark border-brown-light hover:bg-cream"
      }`}
    >
      {children}
    </button>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────

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

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-display text-lg text-brown-dark">Extrínseco</h2>
        <BetaBadge />
      </div>
      <div className="text-xs text-brown-mid mb-3">
        No aplica todavía — sección en desarrollo
      </div>
      <div className="text-[11px] text-brown-mid mb-4 p-3 bg-cream rounded-sm text-center italic">
        Fase POST-CATA · Rellenar después de revelar la identidad de las muestras
      </div>

      <FormSection title="Cultivo" accent>
        <CheckField id="ext_pais" label="País" checked={bool("ext_pais")} onChange={(v) => set("ext_pais", v)} />
        {bool("ext_pais") && (
          <TextField id="ext_pais_val" value={str("ext_pais_val")} placeholder="País..." onChange={(v) => set("ext_pais_val", v)} />
        )}
        <CheckField id="ext_region" label="Región" checked={bool("ext_region")} onChange={(v) => set("ext_region", v)} />
        {bool("ext_region") && (
          <TextField id="ext_region_val" value={str("ext_region_val")} placeholder="Región..." onChange={(v) => set("ext_region_val", v)} />
        )}
        <CheckField id="ext_finca" label="Nombre de la finca/cooperativa" checked={bool("ext_finca")} onChange={(v) => set("ext_finca", v)} />
        {bool("ext_finca") && (
          <TextField id="ext_finca_val" value={str("ext_finca_val")} placeholder="Finca..." onChange={(v) => set("ext_finca_val", v)} />
        )}
        <CheckField id="ext_productor" label="Productor(es)" checked={bool("ext_productor")} onChange={(v) => set("ext_productor", v)} />
        {bool("ext_productor") && (
          <TextField id="ext_productor_val" value={str("ext_productor_val")} placeholder="Productor..." onChange={(v) => set("ext_productor_val", v)} />
        )}
        <CheckField id="ext_especie" label="Especie" checked={bool("ext_especie")} onChange={(v) => set("ext_especie", v)} />
        {bool("ext_especie") && (
          <TextField id="ext_especie_val" value={str("ext_especie_val")} placeholder="Arabica..." onChange={(v) => set("ext_especie_val", v)} />
        )}
        <CheckField id="ext_variedad" label="Variedad(es)" checked={bool("ext_variedad")} onChange={(v) => set("ext_variedad", v)} />
        {bool("ext_variedad") && (
          <TextField id="ext_variedad_val" value={str("ext_variedad_val")} placeholder="Gesha, Caturra..." onChange={(v) => set("ext_variedad_val", v)} />
        )}
        <CheckField id="ext_cosecha" label="Fecha/Año de cosecha" checked={bool("ext_cosecha")} onChange={(v) => set("ext_cosecha", v)} />
        {bool("ext_cosecha") && (
          <TextField id="ext_cosecha_val" value={str("ext_cosecha_val")} placeholder="2024/2025..." onChange={(v) => set("ext_cosecha_val", v)} />
        )}
        <div className="mt-3">
          <Notes
            value={str("ext_cultivo_notas")}
            onChange={(v) => set("ext_cultivo_notas", v)}
            placeholder="Información sobre el cultivo..."
          />
        </div>
      </FormSection>

      <FormSection title="Procesamiento" accent>
        <CheckField id="ext_beneficiador" label="Beneficiador(es)" checked={bool("ext_beneficiador")} onChange={(v) => set("ext_beneficiador", v)} />
        {bool("ext_beneficiador") && (
          <TextField id="ext_beneficiador_val" value={str("ext_beneficiador_val")} placeholder="Beneficiador..." onChange={(v) => set("ext_beneficiador_val", v)} />
        )}
        <CheckField id="ext_descafeinado" label="Descafeinado" checked={bool("ext_descafeinado")} onChange={(v) => set("ext_descafeinado", v)} />

        <div className="mt-3">
          <div className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase text-brown-mid mb-2">
            Tipo de proceso
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PROCESS_TYPES.map((pt) => {
              const active = str("ext_proceso_tipo") === pt;
              return (
                <PillButton key={pt} active={active} onClick={() => set("ext_proceso_tipo", active ? null : pt)}>
                  {pt}
                </PillButton>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <Notes
            value={str("ext_proceso_notas")}
            onChange={(v) => set("ext_proceso_notas", v)}
            placeholder="Descripción del proceso..."
          />
        </div>
      </FormSection>

      <FormSection title="Comercio" accent>
        <CheckField id="ext_clasificacion" label="Clasificación local/regional" checked={bool("ext_clasificacion")} onChange={(v) => set("ext_clasificacion", v)} />
        {bool("ext_clasificacion") && (
          <TextField id="ext_clasificacion_val" value={str("ext_clasificacion_val")} placeholder="Clasificación..." onChange={(v) => set("ext_clasificacion_val", v)} />
        )}
        <CheckField id="ext_oic" label="Número OIC" checked={bool("ext_oic")} onChange={(v) => set("ext_oic", v)} />
        {bool("ext_oic") && (
          <TextField id="ext_oic_val" value={str("ext_oic_val")} placeholder="OIC..." onChange={(v) => set("ext_oic_val", v)} />
        )}
        <CheckField id="ext_importador" label="Nombre del importador" checked={bool("ext_importador")} onChange={(v) => set("ext_importador", v)} />
        {bool("ext_importador") && (
          <TextField id="ext_importador_val" value={str("ext_importador_val")} placeholder="Importador..." onChange={(v) => set("ext_importador_val", v)} />
        )}
        <CheckField id="ext_exportador" label="Nombre del exportador" checked={bool("ext_exportador")} onChange={(v) => set("ext_exportador", v)} />
        {bool("ext_exportador") && (
          <TextField id="ext_exportador_val" value={str("ext_exportador_val")} placeholder="Exportador..." onChange={(v) => set("ext_exportador_val", v)} />
        )}
        <CheckField id="ext_precio" label="Precio al productor" checked={bool("ext_precio")} onChange={(v) => set("ext_precio", v)} />
        {bool("ext_precio") && (
          <TextField id="ext_precio_val" value={str("ext_precio_val")} placeholder="USD/lb..." onChange={(v) => set("ext_precio_val", v)} />
        )}
        <CheckField id="ext_lote" label="Tamaño del lote" checked={bool("ext_lote")} onChange={(v) => set("ext_lote", v)} />
        {bool("ext_lote") && (
          <TextField id="ext_lote_val" value={str("ext_lote_val")} placeholder="kg o sacos..." onChange={(v) => set("ext_lote_val", v)} />
        )}
        <CheckField id="ext_comercio_otro" label="Otro" checked={bool("ext_comercio_otro")} onChange={(v) => set("ext_comercio_otro", v)} />
        {bool("ext_comercio_otro") && (
          <TextField id="ext_comercio_otro_val" value={str("ext_comercio_otro_val")} placeholder="Otro dato comercial..." onChange={(v) => set("ext_comercio_otro_val", v)} />
        )}
        <div className="mt-3">
          <Notes
            value={str("ext_comercio_notas")}
            onChange={(v) => set("ext_comercio_notas", v)}
            placeholder="Notas comerciales..."
          />
        </div>
      </FormSection>

      <FormSection title="Certificaciones" accent>
        <div className="flex flex-wrap gap-1.5">
          {CERTIFICATIONS.map((cert) => {
            const active = arr("ext_certs").includes(cert);
            return (
              <PillButton
                key={cert}
                active={active}
                onClick={() => {
                  const cur = arr("ext_certs");
                  set("ext_certs", active ? cur.filter((x) => x !== cert) : [...cur, cert]);
                }}
              >
                {cert}
              </PillButton>
            );
          })}
        </div>
        <div className="mt-3">
          <Notes
            value={str("ext_certs_notas")}
            onChange={(v) => set("ext_certs_notas", v)}
            placeholder="Notas sobre certificaciones..."
          />
        </div>
      </FormSection>

      <FormSection title="Otro" accent>
        <Notes
          value={str("ext_otro_notas")}
          onChange={(v) => set("ext_otro_notas", v)}
          placeholder="Otra información relevante..."
        />
      </FormSection>
    </div>
  );
}
