"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PillTabs } from "@/components/ui";
import { fillPattern } from "@/lib/fillPattern";
import { referenceBadgeText } from "@/lib/referenceRules";
import type { PanelCell, PanelCoffee, PanelDistance, PanelMatrix as PanelMatrixModel } from "@/lib/reports/panel";

export type PanelMatrixStrings = {
  /** The table's hidden caption. */
  caption: string;
  /** The label of the scroll region around the table. */
  region: string;
  group: string;
  /** "Dispersión (DE)": a row header. */
  spread: string;
  /** "DE": a column header. */
  spreadShort: string;
  noScore: string;
  partial: string;
  excludedTag: string;
  /** Legend: what each tone and mark says. */
  markWithin: string;
  markOver1: string;
  markOver2: string;
  /** RAW "{cupper}, {coffee}: {value}": a cell's accessible name. */
  cell: string;
  /** Appended to a cell's name. */
  distOver1: string;
  distOver2: string;
  noTotal: string;
  /** Shown under the table only while it is wider than its box. */
  scrollHint: string;
  /** The label of the phone's coffee picker. */
  pickCoffee: string;
  /** RAW "Grupo {score}" / "DE {sd}": the phone list's header. */
  phoneGroup: string;
  phoneSpread: string;
};

const score = (v: number) => v.toFixed(2);

/** The mark of a cell's distance: a shape, so colour is never alone (H-09). */
function Mark({ distance }: { distance: PanelDistance }) {
  if (distance !== "over1" && distance !== "over2") return null;
  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true" focusable="false" className="shrink-0 fill-current" data-mark={distance}>
      {distance === "over1" ? <path d="M5 1 9.5 9h-9Z" /> : <path d="M5 .5 9.5 5 5 9.5.5 5Z" />}
    </svg>
  );
}

/** The distance tones DESIGN.md sanctions for this matrix ("How far from the
 *  group"): within 1 SD, 1 SD or more, 2 SD or more. Far is the warning token
 *  ("far from the group", not an error: never the error red), and both far
 *  tones also carry a mark. */
function tone(cell: PanelCell, excluded: boolean): string {
  if (excluded) return "bg-surface-container-high text-on-surface-variant";
  if (cell.distance === "over2") return "bg-warning font-bold text-on-warning";
  if (cell.distance === "over1") return "bg-warning-container font-semibold text-on-warning-container";
  if (cell.distance === "within") return "bg-primary-fixed text-on-primary-fixed";
  return "text-on-surface";
}

const head = "border-b border-outline-variant px-2 py-2 text-center text-caption font-semibold text-on-surface-variant";
const stick = "sticky left-0 z-[1] bg-surface-container-lowest";
const lineCell = "border-b border-outline-variant/60 px-2 py-2 text-center text-body tabular-nums";

/**
 * The organizer's matrix: every cupper's total for every coffee, the group's
 * score and the spread beside them, and a mark in the cells that sit 1 SD or
 * 2 SD from the mean of their coffee. Every cell opens that cupper's
 * evaluation of that coffee.
 *
 * It draws; it does not decide: the numbers and the distances are
 * `buildPanelMatrix` (lib/reports/panel.ts), over rows that exist only in the
 * organizer's payload. Under 768 px it is one coffee at a time, as a list of
 * cuppers (no sideways scroll); from 768 px a table laid out as `rows` says.
 */
export function PanelMatrix({
  matrix,
  rows,
  onOpen,
  referenceBadge,
  t,
}: {
  matrix: PanelMatrixModel;
  rows: "cuppers" | "coffees";
  onOpen: (coffeeId: string, cupperId: string) => void;
  referenceBadge?: string;
  t: PanelMatrixStrings;
}) {
  const { coffees, cuppers, cells } = matrix;
  const [picked, setPicked] = useState<string | null>(null);
  const pickedIndex = Math.max(0, coffees.findIndex((c) => c.id === picked));

  // The hint under the table exists only while the table is wider than its box.
  const box = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth - el.clientWidth > 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [rows, coffees.length, cuppers.length]);

  const cellName = (ci: number, pi: number) => {
    const cell = cells[ci][pi];
    const base = fillPattern(t.cell, {
      cupper: cuppers[pi].name,
      coffee: coffees[ci].label,
      value: cell.value !== null ? score(cell.value) : cell.partial ? t.partial : t.noTotal,
    });
    const more = cuppers[pi].excluded
      ? t.excludedTag
      : cell.distance === "over2"
        ? t.distOver2
        : cell.distance === "over1"
          ? t.distOver1
          : null;
    return more ? `${base}, ${more}` : base;
  };

  const cellButton = (ci: number, pi: number, extra = "") => {
    const cell = cells[ci][pi];
    return (
      <button
        type="button"
        onClick={() => onOpen(coffees[ci].id, cuppers[pi].id)}
        aria-label={cellName(ci, pi)}
        data-distance={cuppers[pi].excluded ? "none" : cell.distance}
        className={`inline-flex min-h-[44px] w-full items-center justify-center gap-1 px-2 py-2 text-body tabular-nums transition-colors hover:brightness-95 ${tone(cell, cuppers[pi].excluded)} ${extra}`}
      >
        <Mark distance={cuppers[pi].excluded ? "none" : cell.distance} />
        {cell.value !== null ? score(cell.value) : cell.partial ? t.partial : t.noScore}
      </button>
    );
  };

  const coffeeHead = (coffee: PanelCoffee): ReactNode => (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className="whitespace-nowrap text-on-surface">{coffee.label}</span>
      {coffee.isReference && referenceBadge ? (
        <span className="whitespace-nowrap font-normal text-on-surface-variant">
          {referenceBadgeText(referenceBadge, coffee.referenceRank, matrix.references)}
        </span>
      ) : null}
    </span>
  );

  const cupperButton = (pi: number, extra = "") => (
    <button
      type="button"
      onClick={() => {
        if (coffees[0]) onOpen(coffees[0].id, cuppers[pi].id);
      }}
      className={`min-h-[44px] w-full rounded-input px-1.5 text-body font-semibold transition-colors hover:bg-surface-container-high ${
        cuppers[pi].excluded ? "text-on-surface-variant" : "text-on-surface"
      } ${extra}`}
    >
      <span className={cuppers[pi].excluded ? "line-through" : ""}>{cuppers[pi].name}</span>
      {cuppers[pi].excluded ? (
        <span className="block text-caption font-normal text-on-surface-variant">{t.excludedTag}</span>
      ) : null}
    </button>
  );

  const group = (coffee: PanelCoffee) => (coffee.group !== null ? score(coffee.group) : t.noScore);
  const spread = (coffee: PanelCoffee) => (coffee.sd !== null ? coffee.sd.toFixed(1) : t.noScore);

  const table =
    rows === "cuppers" ? (
      <table className="w-full border-collapse" data-matrix-rows="cuppers">
        <caption className="sr-only">{t.caption}</caption>
        <thead>
          <tr>
            <td className={`${stick} border-b border-outline-variant`} />
            {coffees.map((coffee) => (
              <th key={coffee.id} scope="col" className={head}>
                {coffeeHead(coffee)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.scored ? (
            <>
              <tr data-line="group">
                <th scope="row" className={`${stick} ${lineCell} text-left font-semibold text-on-surface`}>
                  {t.group}
                </th>
                {coffees.map((coffee) => (
                  <td key={coffee.id} className={`${lineCell} font-semibold text-on-surface`}>
                    {group(coffee)}
                  </td>
                ))}
              </tr>
              <tr data-line="spread">
                <th scope="row" className={`${stick} ${lineCell} text-left font-normal text-on-surface-variant`}>
                  {t.spread}
                </th>
                {coffees.map((coffee) => (
                  <td key={coffee.id} className={`${lineCell} text-on-surface-variant`}>
                    {spread(coffee)}
                  </td>
                ))}
              </tr>
            </>
          ) : null}
          {cuppers.map((cupper, pi) => (
            <tr key={cupper.id}>
              <th scope="row" className={`${stick} border-b border-outline-variant/60 p-0 text-left`}>
                {cupperButton(pi, "text-left")}
              </th>
              {coffees.map((coffee, ci) => (
                <td key={coffee.id} className="border-b border-outline-variant/60 p-0 text-center">
                  {cellButton(ci, pi)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <table className="w-full border-collapse" data-matrix-rows="coffees">
        <caption className="sr-only">{t.caption}</caption>
        <thead>
          <tr>
            <td className={`${stick} border-b border-outline-variant`} />
            {matrix.scored ? (
              <>
                <th scope="col" className={`${head} text-on-surface`}>
                  {t.group}
                </th>
                <th scope="col" className={head}>
                  {t.spreadShort}
                </th>
              </>
            ) : null}
            {cuppers.map((cupper, pi) => (
              <th key={cupper.id} scope="col" className="border-b border-outline-variant p-0 text-center">
                {cupperButton(pi)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {coffees.map((coffee, ci) => (
            <tr key={coffee.id}>
              <th scope="row" className={`${stick} border-b border-outline-variant/60 px-2 py-2 text-left text-caption font-semibold`}>
                {coffeeHead(coffee)}
              </th>
              {matrix.scored ? (
                <>
                  <td className={`${lineCell} font-semibold text-on-surface`} data-line="group">
                    {group(coffee)}
                  </td>
                  <td className={`${lineCell} text-on-surface-variant`} data-line="spread">
                    {spread(coffee)}
                  </td>
                </>
              ) : null}
              {cuppers.map((cupper, pi) => (
                <td key={cupper.id} className="border-b border-outline-variant/60 p-0 text-center">
                  {cellButton(ci, pi)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );

  const current = coffees[pickedIndex];

  return (
    <div className="flex flex-col gap-3" data-panel-matrix="">
      {/* Phones: one coffee at a time, its cuppers as a list. */}
      {current ? (
        <div className="flex flex-col gap-2 md:hidden" data-matrix-phone="">
          {coffees.length > 1 ? (
            <PillTabs
              items={coffees.map((coffee) => ({ id: coffee.id, label: coffee.label }))}
              value={current.id}
              onChange={(id) => setPicked(id)}
              ariaLabel={t.pickCoffee}
              size="sm"
            />
          ) : null}
          <p className="m-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-body text-on-surface">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              {current.label}
              {current.isReference && referenceBadge ? (
                <span className="text-caption font-normal text-on-surface-variant">
                  {referenceBadgeText(referenceBadge, current.referenceRank, matrix.references)}
                </span>
              ) : null}
            </span>
            {matrix.scored ? (
              <span className="tabular-nums text-on-surface-variant">
                {fillPattern(t.phoneGroup, { score: group(current) })} · {fillPattern(t.phoneSpread, { sd: spread(current) })}
              </span>
            ) : null}
          </p>
          <ul className="m-0 flex list-none flex-col p-0">
            {cuppers.map((cupper, pi) => {
              const cell = cells[pickedIndex][pi];
              return (
                <li key={cupper.id} className={pi === 0 ? "" : "border-t border-outline-variant/60"}>
                  <button
                    type="button"
                    onClick={() => onOpen(current.id, cupper.id)}
                    aria-label={cellName(pickedIndex, pi)}
                    data-distance={cupper.excluded ? "none" : cell.distance}
                    className="flex min-h-[48px] w-full items-center gap-2 py-1.5 text-left text-body"
                  >
                    <span className={`min-w-0 flex-1 truncate font-semibold ${cupper.excluded ? "text-on-surface-variant" : "text-on-surface"}`}>
                      <span className={cupper.excluded ? "line-through" : ""}>{cupper.name}</span>
                      {cupper.excluded ? <span className="font-normal"> {t.excludedTag}</span> : null}
                    </span>
                    <span
                      className={`inline-flex min-w-[76px] items-center justify-center gap-1 rounded-input px-2 py-1.5 tabular-nums ${tone(cell, cupper.excluded)}`}
                    >
                      <Mark distance={cupper.excluded ? "none" : cell.distance} />
                      {cell.value !== null ? score(cell.value) : cell.partial ? t.partial : t.noScore}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* From 768 px: the table, in a box that can be scrolled with the keyboard. */}
      <div className="hidden flex-col gap-2 md:flex">
        <div ref={box} role="region" aria-label={t.region} tabIndex={0} className="overflow-x-auto rounded-input" data-matrix-box="">
          {table}
        </div>
        {overflows ? (
          <p className="m-0 text-caption text-on-surface-variant" data-matrix-hint="">
            {t.scrollHint}
          </p>
        ) : null}
      </div>

      {matrix.scored ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-caption leading-snug text-on-surface-variant" data-matrix-legend="">
          <li className="flex items-start gap-1.5">
            <span className="mt-px h-4 w-5 shrink-0 rounded-sm bg-primary-fixed" aria-hidden="true" />
            {t.markWithin}
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-px inline-flex h-4 w-5 shrink-0 items-center justify-center rounded-sm bg-warning-container text-on-warning-container">
              <Mark distance="over1" />
            </span>
            {t.markOver1}
          </li>
          <li className="flex items-start gap-1.5">
            <span className="mt-px inline-flex h-4 w-5 shrink-0 items-center justify-center rounded-sm bg-warning text-on-warning">
              <Mark distance="over2" />
            </span>
            {t.markOver2}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
