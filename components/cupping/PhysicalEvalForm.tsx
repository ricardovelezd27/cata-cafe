"use client";

import {
  CAT1_DEFECTS,
  CAT2_DEFECTS,
  GREEN_COLORS,
  SCREEN_SIZES,
  getRatio,
  type DefectRow,
} from "@/lib/constants";
import { FormSection } from "@/components/ui";

type Data = Record<string, unknown>;

function calcFullDefects(count: number, ratioStr: string): number {
  if (!count || count <= 0) return 0;
  const ratio = getRatio(ratioStr);
  return Math.round((count / ratio) * 100) / 100;
}

interface DefectRowViewProps {
  defect: DefectRow;
  prefix: string;
  count: number;
  onChange: (next: number) => void;
}

function DefectRowView({ defect, count, onChange }: DefectRowViewProps) {
  const full = calcFullDefects(count, defect.ratio);
  return (
    <div className="flex items-center gap-2 mb-1.5 px-3 py-1.5 bg-cream rounded-sm">
      <div className="flex-1 text-xs text-brown-dark">
        {defect.name}{" "}
        <span className="text-brown-mid text-[10px]">({defect.ratio})</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, count - 1))}
          className="w-7 h-7 rounded-sm border border-brown-light bg-white text-brown-dark text-sm font-mono tabular-nums hover:bg-cream transition-colors"
          aria-label="Decrease"
        >
          −
        </button>
        <span className="w-9 text-center text-sm font-semibold text-green-dark font-mono tabular-nums">
          {count}
        </span>
        <button
          type="button"
          onClick={() => onChange(count + 1)}
          className="w-7 h-7 rounded-sm border border-brown-light bg-white text-brown-dark text-sm font-mono tabular-nums hover:bg-cream transition-colors"
          aria-label="Increase"
        >
          +
        </button>
      </div>
      <div
        className={`w-12 text-right text-[13px] font-semibold font-mono tabular-nums ${
          full > 0 ? "text-red-defect" : "text-brown-mid"
        }`}
      >
        {full.toFixed(1)}
      </div>
    </div>
  );
}

export function PhysicalEvalForm({
  sampleData,
  onChange,
}: {
  sampleData: Data;
  onChange: (d: Data) => void;
}) {
  const d = sampleData;
  const set = (key: string, val: unknown) => onChange({ ...d, [key]: val });
  const getNum = (k: string): number => (d[k] as number | undefined) ?? 0;
  const getStr = (k: string): string => (d[k] as string | undefined) ?? "";

  const totalCat1 = CAT1_DEFECTS.reduce(
    (sum, def) => sum + calcFullDefects(getNum(`phys_cat1_${def.name}_count`), def.ratio),
    0,
  );
  const totalCat2 = CAT2_DEFECTS.reduce(
    (sum, def) => sum + calcFullDefects(getNum(`phys_cat2_${def.name}_count`), def.ratio),
    0,
  );

  const totalG = SCREEN_SIZES.reduce((sum, s) => sum + getNum(`phys_screen_${s}_g`), 0);

  return (
    <div>
      <div className="text-[11px] text-brown-mid mb-4 p-3 bg-cream rounded-sm text-center italic">
        Con base en una muestra de 350g
      </div>

      <FormSection title="Color" accent>
        <div className="flex flex-wrap gap-1.5">
          {GREEN_COLORS.map((c) => {
            const active = getStr("phys_color") === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => set("phys_color", active ? null : c)}
                className={`px-3 py-1.5 rounded-pill border text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-green-dark text-white border-green-dark"
                    : "bg-transparent text-brown-dark border-brown-light hover:bg-cream"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </FormSection>

      <FormSection title="Humedad" accent>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={getStr("phys_humedad")}
            onChange={(e) => set("phys_humedad", e.target.value)}
            placeholder="%"
            step={0.1}
            min={0}
            max={100}
            className="w-24 px-3 py-2 border border-brown-light rounded-sm text-sm bg-cream text-brown-dark text-center font-mono tabular-nums focus:outline-none focus:border-green-dark focus:ring-2 focus:ring-green-light/40"
          />
          <span className="text-sm text-brown-mid">%</span>
        </div>
      </FormSection>

      <FormSection title="Tamaño (Zaranda)" accent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="text-left py-2 px-2 text-brown-mid border-b border-brown-light font-mono text-[10px] uppercase tracking-wider font-semibold">
                  Zaranda
                </th>
                <th className="text-center py-2 px-2 text-brown-mid border-b border-brown-light font-mono text-[10px] uppercase tracking-wider font-semibold">
                  Gramos
                </th>
                <th className="text-right py-2 px-2 text-brown-mid border-b border-brown-light font-mono text-[10px] uppercase tracking-wider font-semibold">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {SCREEN_SIZES.map((s) => {
                const gKey = `phys_screen_${s}_g`;
                const g = getNum(gKey);
                const pct = totalG > 0 ? ((g / totalG) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={s}>
                    <td className="py-1.5 px-2 text-brown-dark font-mono tabular-nums">#{s}</td>
                    <td className="py-1.5 px-2 text-center">
                      <input
                        type="number"
                        value={getStr(gKey)}
                        onChange={(e) => set(gKey, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        step={0.1}
                        min={0}
                        className="w-16 py-1 px-2 border border-brown-light rounded-sm text-xs text-center bg-cream text-brown-dark font-mono tabular-nums focus:outline-none focus:border-green-dark"
                      />
                    </td>
                    <td className="py-1.5 px-2 text-right text-brown-mid font-mono tabular-nums">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FormSection>

      <FormSection title="Defectos — Categoría 1" accent>
        {CAT1_DEFECTS.map((def) => (
          <DefectRowView
            key={def.name}
            defect={def}
            prefix="phys_cat1"
            count={getNum(`phys_cat1_${def.name}_count`)}
            onChange={(n) => set(`phys_cat1_${def.name}_count`, n)}
          />
        ))}
        <div className="flex justify-end py-2 border-t-2 border-green-dark mt-3">
          <span className="text-[13px] font-bold text-green-dark font-mono tabular-nums">
            Total Cat. 1: {totalCat1.toFixed(1)}
          </span>
        </div>
      </FormSection>

      <FormSection title="Defectos — Categoría 2" accent>
        {CAT2_DEFECTS.map((def) => (
          <DefectRowView
            key={def.name}
            defect={def}
            prefix="phys_cat2"
            count={getNum(`phys_cat2_${def.name}_count`)}
            onChange={(n) => set(`phys_cat2_${def.name}_count`, n)}
          />
        ))}
        <div className="flex justify-end py-2 border-t-2 border-green-dark mt-3">
          <span className="text-[13px] font-bold text-green-dark font-mono tabular-nums">
            Total Cat. 2: {totalCat2.toFixed(1)}
          </span>
        </div>
      </FormSection>

      <FormSection title="Total de Defectos en Verde" accent>
        <div className="text-center py-4">
          <div
            className={`text-5xl font-display font-medium tabular-nums ${
              totalCat1 + totalCat2 > 0 ? "text-red-defect" : "text-green-dark"
            }`}
          >
            {(totalCat1 + totalCat2).toFixed(1)}
          </div>
          <div className="text-[11px] text-brown-mid mt-2 font-mono tabular-nums">
            Cat. 1: {totalCat1.toFixed(1)} · Cat. 2: {totalCat2.toFixed(1)}
          </div>
        </div>
      </FormSection>
    </div>
  );
}
