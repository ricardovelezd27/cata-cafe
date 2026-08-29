"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { calcIndividualScore } from "@/lib/scoring";
import { setParticipantExclusion } from "@/app/actions/community";
import type { SessionFormat } from "@/lib/constants";

type SampleResult = {
  id: string;
  label: string;
  revealed: boolean;
  coffee: { name: string } | null;
  descriptive: Record<string, unknown>;
  affective: Record<string, unknown>;
  combined: Record<string, unknown>;
};

export type ParticipantResult = {
  id: string;
  name: string;
  excluded: boolean;
  samples: SampleResult[];
};

/* Pick the dataset that drives CVA, mirroring MyResultsSummary.dataFor. */
function dataFor(s: SampleResult, format: SessionFormat): Record<string, unknown> {
  return format === "affective"
    ? s.affective
    : format === "descriptive"
      ? s.descriptive
      : s.combined;
}

function hasData(data: Record<string, unknown>): boolean {
  return Object.values(data).some((v) =>
    Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "" && v !== 0
  );
}

/* CVA total for one participant on one sample, or null when not applicable. */
function cvaFor(
  s: SampleResult,
  format: SessionFormat,
  cupsPerSample: number
): number | null {
  if (format === "descriptive") return null; // no CVA without affective scores
  const data = dataFor(s, format);
  if (!hasData(data)) return null;
  const cva = calcIndividualScore(data, cupsPerSample);
  return typeof cva === "number" ? cva : null;
}

type CellTone = "neutral" | "green" | "amber" | "red";

/* Cell tone → MD3 token classes. Traffic-light consensus semaphore per
   DESIGN.md: bg-primary-fixed (green, within 1 SD of the row mean — consensus)
   / bg-warning-container (amber, > 1 SD) / bg-error-container (red, >= 2 SD,
   possible outlier). Excluded participants always render with the neutral
   "greyed out" pairing regardless of their tone. */
function toneClass(tone: CellTone, excluded: boolean): string {
  if (excluded) return "bg-surface-container-high text-on-surface-variant";
  if (tone === "red") return "bg-error-container text-on-error-container font-bold";
  if (tone === "amber") return "bg-warning-container text-on-warning-container font-bold";
  if (tone === "green") return "bg-primary-fixed text-on-primary-fixed font-semibold";
  return "text-on-surface font-semibold";
}

/* Compact on/off switch for include/exclude. */
function ToggleSwitch({
  on,
  disabled,
  onClick,
  ariaLabel,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-pill p-0 transition-colors ${
        on ? "bg-primary-container" : "bg-surface-container-highest"
      } ${disabled ? "cursor-default opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-surface-container-lowest shadow-card transition-[left] ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function OwnerParticipantSection({
  sessionId,
  participants,
  format,
  cupsPerSample,
  readOnly = false,
  onOpenDetail,
  t,
}: {
  sessionId: string;
  participants: ParticipantResult[];
  format: SessionFormat;
  cupsPerSample: number;
  // Super-admin read view: matrix + drill-down only — the include/exclude
  // management card is hidden (setParticipantExclusion is owner-gated).
  readOnly?: boolean;
  onOpenDetail: (sampleId: string, participantId: string) => void;
  t: {
    title: string;
    manageTitle: string;
    manageHint: string;
    included: string;
    excluded: string;
    excludedTag: string;
    legendGreen: string;
    legendAmber: string;
    legendRed: string;
    noScore: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Optimistic exclusion: override per id until the server refresh confirms it.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const isExcluded = (p: ParticipantResult): boolean => overrides[p.id] ?? p.excluded;

  const toggleExclude = (p: ParticipantResult) => {
    const next = !isExcluded(p);
    setOverrides((o) => ({ ...o, [p.id]: next }));
    setPendingIds((s) => new Set(s).add(p.id));
    startTransition(async () => {
      try {
        await setParticipantExclusion(sessionId, p.id, next);
        router.refresh();
      } catch {
        setOverrides((o) => ({ ...o, [p.id]: !next })); // revert on failure
      } finally {
        setPendingIds((s) => {
          const n = new Set(s);
          n.delete(p.id);
          return n;
        });
      }
    });
  };

  // Build the sample axis from the first participant (all share the same sample
  // order/labels because each ParticipantResult is built over session.samples).
  const sampleAxis = participants[0]?.samples ?? [];
  const firstSampleId = sampleAxis[0]?.id ?? "";

  // Precompute CVA matrix: [sampleIndex][participantIndex] = number | null
  const matrix: (number | null)[][] = sampleAxis.map((_, si) =>
    participants.map((p) => {
      const s = p.samples[si];
      return s ? cvaFor(s, format, cupsPerSample) : null;
    })
  );

  // Per-row mean + population SD over the INCLUDED numeric values only — outlier
  // detection should reflect the same population the group score uses.
  const rowStats = matrix.map((row) => {
    const nums = row.filter(
      (v, pi): v is number => v !== null && !isExcluded(participants[pi])
    );
    if (nums.length < 2) return { mean: 0, sd: 0, count: nums.length };
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance =
      nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    return { mean, sd: Math.sqrt(variance), count: nums.length };
  });

  const toneFor = (value: number | null, rowIdx: number): CellTone => {
    if (value === null) return "neutral";
    const { sd, mean, count } = rowStats[rowIdx];
    if (count < 2 || sd === 0) return "neutral";
    const dev = Math.abs(value - mean);
    if (dev >= 2 * sd) return "red";
    if (dev >= sd) return "amber";
    return "green";
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Master control: include/exclude each participant from the group calc */}
      {!readOnly && (
      <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-4">
        <div className="mb-1 font-display text-lg font-semibold text-primary-container">
          {t.manageTitle}
        </div>
        <div className="mb-3 text-[11px] leading-relaxed text-on-surface-variant">
          {t.manageHint}
        </div>
        <div className="flex flex-col">
          {participants.map((p, i) => {
            const excluded = isExcluded(p);
            return (
              <div
                key={p.id}
                className={`flex min-h-[44px] items-center gap-2.5 py-2 ${
                  i === 0 ? "" : "border-t border-outline-variant/50"
                }`}
              >
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                    excluded ? "text-on-surface-variant line-through" : "text-on-surface"
                  }`}
                >
                  {p.name}
                  {excluded && <span className="ml-1.5 no-underline">{t.excludedTag}</span>}
                </span>
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide ${
                    excluded ? "text-on-surface-variant" : "text-primary-container"
                  }`}
                >
                  {excluded ? t.excluded : t.included}
                </span>
                <ToggleSwitch
                  on={!excluded}
                  disabled={pendingIds.has(p.id) || isPending}
                  onClick={() => toggleExclude(p)}
                  ariaLabel={`${excluded ? t.included : t.excluded}: ${p.name}`}
                />
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* CVA summary matrix — every cell/header is a drill-down trigger */}
      <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-4">
        <div className="mb-3 font-display text-lg font-semibold text-primary-container">
          {t.title}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 whitespace-nowrap border-b border-outline-variant bg-surface-container-lowest px-2.5 py-2" />
                {participants.map((p) => {
                  const excluded = isExcluded(p);
                  return (
                    <th
                      key={p.id}
                      className="whitespace-nowrap border-b border-outline-variant px-1 py-2 text-center text-[11px] font-bold"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (firstSampleId) onOpenDetail(firstSampleId, p.id);
                        }}
                        className={`min-h-[44px] w-full rounded-input px-1.5 transition-colors hover:bg-surface-container-high ${
                          excluded ? "text-on-surface-variant line-through" : "text-primary-container"
                        }`}
                      >
                        {p.name}
                        {excluded && (
                          <span className="block text-[9px] font-bold text-on-surface-variant no-underline">
                            {t.excludedTag}
                          </span>
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sampleAxis.map((sample, si) => (
                <tr key={sample.id}>
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-outline-variant/60 bg-surface-container-lowest px-2.5 py-2 text-xs font-bold text-on-surface">
                    {sample.label}
                  </td>
                  {participants.map((p, pi) => {
                    const value = matrix[si][pi];
                    const excluded = isExcluded(p);
                    const tone: CellTone = excluded ? "neutral" : toneFor(value, si);
                    return (
                      <td
                        key={p.id}
                        className="border-b border-outline-variant/60 p-0 text-center"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenDetail(sample.id, p.id)}
                          className={`min-h-[44px] w-full px-2.5 py-2 text-sm tabular-nums transition-colors hover:brightness-95 ${toneClass(tone, excluded)}`}
                        >
                          {value !== null ? value.toFixed(2) : t.noScore}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <span className="h-3 w-3 rounded-sm bg-primary-fixed" aria-hidden />
            {t.legendGreen}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <span className="h-3 w-3 rounded-sm bg-warning-container" aria-hidden />
            {t.legendAmber}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <span className="h-3 w-3 rounded-sm bg-error-container" aria-hidden />
            {t.legendRed}
          </span>
        </div>
      </div>
    </div>
  );
}
