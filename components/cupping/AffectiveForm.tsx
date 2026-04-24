"use client";

import { AFFECTIVE_ATTRIBUTES, DEFECT_TYPES } from "@/lib/constants";
import { calcIndividualScore } from "@/lib/scoring";
import { Section } from "./Section";
import { AffectiveScale } from "./AffectiveScale";
import { NotesInput } from "./NotesInput";
import { CupCheckboxes } from "./CupCheckboxes";

type Data = Record<string, unknown>;

export function AffectiveForm({
  sampleData,
  onChange,
  cupsPerSample,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
  cupsPerSample: number;
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const getNum = (k: string): number | null => (d[k] as number | undefined) ?? null;
  const getStr = (k: string): string => (d[k] as string | undefined) ?? "";
  const getBools = (k: string): boolean[] =>
    (d[k] as boolean[] | undefined) ?? Array(cupsPerSample).fill(false);
  const getArr = (k: string): string[] => (d[k] as string[] | undefined) ?? [];

  const showUniformity = cupsPerSample >= 2;
  const uniformityInScore = cupsPerSample >= 5;

  return (
    <div>
      <div className="text-[11px] text-brown-mid mb-3 p-2 bg-cream rounded-lg text-center">
        ① Extremadamente baja → ⑨ Extremadamente alta
      </div>

      {AFFECTIVE_ATTRIBUTES.map((attr) => (
        <Section key={attr.id} title={attr.label}>
          <AffectiveScale
            value={getNum(attr.id)}
            onChange={(v) => set(attr.id, v)}
            showFinal
            finalValue={getNum(`${attr.id}_final`)}
            onFinalChange={(v) => set(`${attr.id}_final`, v)}
          />
          <div className="mt-1.5">
            <NotesInput value={getStr(`${attr.id}_notas`)} onChange={(v) => set(`${attr.id}_notas`, v)} />
          </div>
        </Section>
      ))}

      {showUniformity && (
        <Section title="Tazas">
          <CupCheckboxes
            count={cupsPerSample}
            label="TAZAS NO UNIFORMES"
            checked={getBools("tazas_no_uniformes")}
            onChange={(v) => {
              // unchecking non-uniform must also uncheck defective
              const curDef = getBools("tazas_defectuosas");
              const newDef = curDef.map((def, i) => def && v[i]);
              onChange({ ...d, tazas_no_uniformes: v, tazas_defectuosas: newDef });
            }}
            color="#C17817"
          />
          <CupCheckboxes
            count={cupsPerSample}
            label="TAZAS DEFECTUOSAS"
            checked={getBools("tazas_defectuosas")}
            onChange={(v) => {
              // checking defective auto-checks non-uniform
              const curNU = getBools("tazas_no_uniformes");
              const newNU = curNU.map((nu, i) => nu || v[i]);
              onChange({ ...d, tazas_defectuosas: v, tazas_no_uniformes: newNU });
            }}
            color="#A83232"
          />
          {!uniformityInScore && (
            <div className="text-[10px] text-amber-warm italic mt-1">
              ⓘ Se registra pero no se incluye en el puntaje (requiere ≥5 tazas por catador)
            </div>
          )}

          <div className="mt-2">
            <div className="text-[11px] font-bold text-brown-mid mb-1">DEFECTO (DE HABERLO)</div>
            <div className="flex gap-1.5">
              {DEFECT_TYPES.map((dt) => {
                const active = getArr("defecto_tipo").includes(dt);
                return (
                  <button
                    key={dt}
                    onClick={() => {
                      const cur = getArr("defecto_tipo");
                      set("defecto_tipo", active ? cur.filter((x) => x !== dt) : [...cur, dt]);
                    }}
                    className={`px-3 py-[5px] rounded-lg border text-xs cursor-pointer ${
                      active
                        ? "bg-red-defect text-white border-red-defect"
                        : "bg-transparent text-brown-dark border-[#D4C5A9]"
                    }`}
                  >
                    {dt}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      <Section title="Puntaje Calculado">
        <div className="text-center text-3xl font-bold text-green-dark font-serif">
          {calcIndividualScore(d, cupsPerSample)}
        </div>
        {cupsPerSample < 5 && (
          <div className="text-center text-[10px] text-brown-mid">
            Sin penalización por uniformidad/defectos ({cupsPerSample} tazas)
          </div>
        )}
      </Section>
    </div>
  );
}
