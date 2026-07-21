"use client";

import type { CSSProperties } from "react";
import type { PivotResult } from "@/lib/analytics/types";

export interface PivotTableTranslations {
  total: string;
  grandTotal: string;
  /** ICU-style template with a `{count}` placeholder, interpolated locally
   *  (see next-intl placeholder gotcha in project memory / ChatPanel.tsx). */
  countHint: string;
  empty: string;
}

interface PivotTableProps {
  result: PivotResult;
  heatmap: boolean;
  /** Translated label for the active measure — used as the sole column
   *  header when there is no column axis (colKeys === ["__total__"]). */
  measureLabel: string;
  t: PivotTableTranslations;
}

const BORDER = "#E8E0D0";
const BG_LOW = "#FDFBF7";
const BG_HIGH = "#3D5A3E";
const TOTAL_COL = "__total__";

function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

function formatValue(v: number | null): string {
  if (v === null) return "—";
  return String(Math.round(v * 100) / 100);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const LOW_RGB = hexToRgb(BG_LOW);
const HIGH_RGB = hexToRgb(BG_HIGH);

/** Heatmap ramp: BG_LOW -> BG_HIGH over [min, max] of the finalized (kept,
 *  post-trim) cell values. Never applied to totals. */
function heatStyle(value: number | null, min: number, max: number): CSSProperties {
  if (value === null || !Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return {};
  }
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const r = Math.round(LOW_RGB[0] + (HIGH_RGB[0] - LOW_RGB[0]) * t);
  const g = Math.round(LOW_RGB[1] + (HIGH_RGB[1] - LOW_RGB[1]) * t);
  const b = Math.round(LOW_RGB[2] + (HIGH_RGB[2] - LOW_RGB[2]) * t);
  return { backgroundColor: `rgb(${r}, ${g}, ${b})`, color: t > 0.5 ? "#FFFFFF" : undefined };
}

/**
 * Row x column cross-tab. Sticky header row + first column (corner cell
 * highest z-index) so both axes stay legible while scrolling a large grid.
 * When the config has no column dimension, colKeys collapses to a single
 * synthetic "__total__" entry — rendered as one value column labeled with
 * the measure, with no redundant totals column next to it.
 */
export function PivotTable({ result, heatmap, measureLabel, t }: PivotTableProps) {
  const { rowKeys, colKeys, cells, rowTotals, colTotals, grandTotal } = result;

  if (rowKeys.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-brown-mid">{t.empty}</div>
    );
  }

  const totalOnly = colKeys.length === 1 && colKeys[0].key === TOTAL_COL;

  let min = Infinity;
  let max = -Infinity;
  if (heatmap) {
    for (const rowKey of Object.keys(cells)) {
      for (const colKey of Object.keys(cells[rowKey])) {
        const v = cells[rowKey][colKey].value;
        if (v !== null) {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
  }

  return (
    <div className="overflow-auto max-h-[70vh] rounded-input border" style={{ borderColor: BORDER }}>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th
              className="sticky top-0 left-0 z-20 bg-white px-3 py-2 text-left border-b"
              style={{ borderColor: BORDER }}
              aria-hidden
            />
            {totalOnly ? (
              <th
                className="sticky top-0 z-10 bg-white px-3 py-2 text-right text-xs font-semibold text-brown-mid uppercase tracking-wide border-b whitespace-nowrap"
                style={{ borderColor: BORDER }}
              >
                {measureLabel}
              </th>
            ) : (
              <>
                {colKeys.map((c) => (
                  <th
                    key={c.key}
                    className="sticky top-0 z-10 bg-white px-3 py-2 text-right text-xs font-semibold text-brown-mid uppercase tracking-wide border-b whitespace-nowrap"
                    style={{ borderColor: BORDER }}
                  >
                    {c.label}
                  </th>
                ))}
                <th
                  className="sticky top-0 z-10 bg-white px-3 py-2 text-right text-xs font-semibold text-brown-dark uppercase tracking-wide border-b border-l whitespace-nowrap"
                  style={{ borderColor: BORDER }}
                >
                  {t.total}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((r) => {
            const rowCells = cells[r.key] ?? {};
            return (
              <tr key={r.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-brown-dark border-b whitespace-nowrap"
                  style={{ borderColor: BORDER }}
                >
                  {r.label}
                </th>
                {totalOnly ? (
                  (() => {
                    const cell = rowCells[TOTAL_COL] ?? { value: null, count: 0 };
                    return (
                      <td
                        className="px-3 py-2 text-right tabular-nums text-brown-dark border-b"
                        style={{ borderColor: BORDER, ...(heatmap ? heatStyle(cell.value, min, max) : {}) }}
                        title={formatTemplate(t.countHint, { count: cell.count })}
                      >
                        {formatValue(cell.value)}
                      </td>
                    );
                  })()
                ) : (
                  <>
                    {colKeys.map((c) => {
                      const cell = rowCells[c.key] ?? { value: null, count: 0 };
                      return (
                        <td
                          key={c.key}
                          className="px-3 py-2 text-right tabular-nums text-brown-dark border-b"
                          style={{
                            borderColor: BORDER,
                            ...(heatmap ? heatStyle(cell.value, min, max) : {}),
                          }}
                          title={formatTemplate(t.countHint, { count: cell.count })}
                        >
                          {formatValue(cell.value)}
                        </td>
                      );
                    })}
                    <td
                      className="px-3 py-2 text-right tabular-nums font-semibold text-brown-dark border-b border-l"
                      style={{ borderColor: BORDER }}
                      title={formatTemplate(t.countHint, { count: rowTotals[r.key]?.count ?? 0 })}
                    >
                      {formatValue(rowTotals[r.key]?.value ?? null)}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th
              scope="row"
              className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-brown-dark border-t whitespace-nowrap"
              style={{ borderColor: BORDER }}
            >
              {t.grandTotal}
            </th>
            {totalOnly ? (
              <td
                className="px-3 py-2 text-right tabular-nums font-semibold text-brown-dark border-t"
                style={{ borderColor: BORDER }}
              >
                {formatValue(grandTotal.value)}
              </td>
            ) : (
              <>
                {colKeys.map((c) => (
                  <td
                    key={c.key}
                    className="px-3 py-2 text-right tabular-nums font-semibold text-brown-dark border-t"
                    style={{ borderColor: BORDER }}
                  >
                    {formatValue(colTotals[c.key]?.value ?? null)}
                  </td>
                ))}
                <td
                  className="px-3 py-2 text-right tabular-nums font-semibold text-brown-dark border-t border-l"
                  style={{ borderColor: BORDER }}
                >
                  {formatValue(grandTotal.value)}
                </td>
              </>
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
