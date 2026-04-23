"use client";

import {
  CAT1_DEFECTS,
  CAT2_DEFECTS,
  GREEN_COLORS,
  SCREEN_SIZES,
  getRatio,
  type DefectRow,
} from "@/lib/constants";
import { Section } from "./Section";

type Data = Record<string, unknown>;

function calcFullDefects(count: number, ratioStr: string): number {
  if (!count || count <= 0) return 0;
  const ratio = getRatio(ratioStr);
  return Math.round((count / ratio) * 100) / 100;
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

  const DefectRowView = ({ defect, prefix }: { defect: DefectRow; prefix: string }) => {
    const countKey = `${prefix}_${defect.name}_count`;
    const count = getNum(countKey);
    const full = calcFullDefects(count, defect.ratio);
    return (
      <div className="flex items-center gap-2 mb-1.5 px-2 py-1 bg-[#FEFCF8] rounded-md">
        <div className="flex-1 text-xs text-brown-dark">
          {defect.name}{" "}
          <span className="text-brown-mid text-[10px]">({defect.ratio})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => set(countKey, Math.max(0, count - 1))}
            className="w-6 h-6 rounded border border-[#D4C5A9] bg-white text-brown-dark text-sm"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-semibold text-green-dark">{count}</span>
          <button
            onClick={() => set(countKey, count + 1)}
            className="w-6 h-6 rounded border border-[#D4C5A9] bg-white text-brown-dark text-sm"
          >
            +
          </button>
        </div>
        <div
          className="w-[50px] text-right text-[13px] font-semibold"
          style={{ color: full > 0 ? "#A83232" : "#8B7355" }}
        >
          {full.toFixed(1)}
        </div>
      </div>
    );
  };

  const totalG = SCREEN_SIZES.reduce((sum, s) => sum + getNum(`phys_screen_${s}_g`), 0);

  return (
    <div>
      <div className="text-[11px] text-brown-mid mb-3 p-2 bg-cream rounded-lg text-center">
        Con base en una muestra de 350g
      </div>

      <Section title="Color">
        <div className="flex flex-wrap gap-1">
          {GREEN_COLORS.map((c) => {
            const active = getStr("phys_color") === c;
            return (
              <button
                key={c}
                onClick={() => set("phys_color", active ? null : c)}
                className={`px-2.5 py-[5px] rounded-xl border text-[11px] cursor-pointer ${
                  active
                    ? "bg-green-dark text-white border-green-dark"
                    : "bg-transparent text-brown-dark border-[#D4C5A9]"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Humedad">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={getStr("phys_humedad")}
            onChange={(e) => set("phys_humedad", e.target.value)}
            placeholder="%"
            step={0.1}
            min={0}
            max={100}
            className="w-20 px-2.5 py-1.5 border border-[#D4C5A9] rounded-md text-sm bg-[#FEFCF8] text-brown-dark text-center"
          />
          <span className="text-sm text-brown-mid">%</span>
        </div>
      </Section>

      <Section title="Tamaño (Zaranda)">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="text-left py-1 px-2 text-brown-mid border-b border-brown-light">
                  Zaranda
                </th>
                <th className="text-center py-1 px-2 text-brown-mid border-b border-brown-light">
                  Gramos
                </th>
                <th className="text-right py-1 px-2 text-brown-mid border-b border-brown-light">
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
                    <td className="py-[3px] px-2 text-brown-dark">#{s}</td>
                    <td className="py-[3px] px-2 text-center">
                      <input
                        type="number"
                        value={getStr(gKey)}
                        onChange={(e) => set(gKey, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        step={0.1}
                        min={0}
                        className="w-[60px] py-[3px] px-1.5 border border-[#D4C5A9] rounded text-xs text-center bg-[#FEFCF8] text-brown-dark"
                      />
                    </td>
                    <td className="py-[3px] px-2 text-right text-brown-mid">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Defectos — Categoría 1">
        {CAT1_DEFECTS.map((def) => (
          <DefectRowView key={def.name} defect={def} prefix="phys_cat1" />
        ))}
        <div className="flex justify-end py-2 border-t-2 border-green-dark mt-2">
          <span className="text-[13px] font-bold text-green-dark">
            Total Cat. 1: {totalCat1.toFixed(1)}
          </span>
        </div>
      </Section>

      <Section title="Defectos — Categoría 2">
        {CAT2_DEFECTS.map((def) => (
          <DefectRowView key={def.name} defect={def} prefix="phys_cat2" />
        ))}
        <div className="flex justify-end py-2 border-t-2 border-green-dark mt-2">
          <span className="text-[13px] font-bold text-green-dark">
            Total Cat. 2: {totalCat2.toFixed(1)}
          </span>
        </div>
      </Section>

      <Section title="Total de Defectos en Verde">
        <div className="text-center py-3">
          <div
            className="text-3xl font-bold font-serif"
            style={{ color: totalCat1 + totalCat2 > 0 ? "#A83232" : "#3D5A3E" }}
          >
            {(totalCat1 + totalCat2).toFixed(1)}
          </div>
          <div className="text-[11px] text-brown-mid mt-1">
            Cat. 1: {totalCat1.toFixed(1)} · Cat. 2: {totalCat2.toFixed(1)}
          </div>
        </div>
      </Section>
    </div>
  );
}
