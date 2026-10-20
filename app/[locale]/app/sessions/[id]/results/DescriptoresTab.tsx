"use client";

/**
 * Descriptores tab (N15/Phase 4): owns the sample + block filter row pair and
 * feeds the same two selections into every panel below — the word cloud, the
 * per-sample descriptor bars, and the owner-only cupper alignment ranking —
 * so "muestra X, bloque Y" always means the same slice everywhere on this
 * tab. Sample/block selection is lifted to ResultsClient (not local state)
 * so the Resumen dashboard's "ver en descriptores" links can preselect a
 * sample before switching tabs.
 */

import { useMemo, useState, useSyncExternalStore } from "react";
import { PillTabs, InfoHint } from "@/components/ui";
import { WordCloud } from "@/components/results/WordCloud";
import { DescriptorFrequency, type SampleBlockFreq } from "@/components/results/DescriptorFrequency";
import { CupperAlignment, type CupperAlignmentRow } from "@/components/results/CupperAlignment";
import type { ParticipantResult } from "@/components/results/OwnerParticipantSection";
import {
  buildFlavorCloud,
  buildTasterCloud,
  sharedLabelKeys,
  labelKey,
  ALL_BLOCK_IDS,
  type FlavorCloudScope,
} from "@/lib/wordCloud";
import { PERCEPTUAL_BLOCKS } from "@/lib/descriptors";
import type { SessionFormat } from "@/lib/constants";
import type { ResultsHelp } from "./types";

// "Hide single-person descriptors" — persisted like cata_results_view (external
// store read, no setState-in-effect). Default OFF: show every descriptor.
const HIDE_SINGLES_KEY = "cata_results_hide_singles";
const HIDE_SINGLES_EVENT = "cata-results-hide-singles-change";
function subscribeHideSingles(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(HIDE_SINGLES_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(HIDE_SINGLES_EVENT, cb);
  };
}
function getHideSinglesSnapshot(): boolean {
  try {
    return localStorage.getItem(HIDE_SINGLES_KEY) === "1";
  } catch {
    return false;
  }
}
function getHideSinglesServerSnapshot(): boolean {
  return false;
}

type DescriptoresTabTranslations = {
  cloudTitle: string;
  soloCloudTitle: string;
  cloudEmpty: string;
  hideSingles: string;
  filterSampleAll: string;
  filterBlockLabel: string;
  tasterScopeAll: string;
  descViewAll: string;
  descByGroup: string;
  descOf: string;
  descParticipants: string;
  descEmptyBlock: string;
  descEmptyAll: string;
  close: string;
  alignTitle: string;
  alignSubtitle: string;
  alignExcluded: string;
  alignNoData: string;
};

export function DescriptoresTab({
  descriptorFrequency,
  blockLabels,
  cupperAlignment,
  participants,
  isOwner,
  isSoloDescriptors,
  format,
  sampleId,
  onSampleIdChange,
  blockId,
  onBlockIdChange,
  locale,
  t,
  help,
}: {
  descriptorFrequency: SampleBlockFreq[];
  blockLabels: Record<string, string>;
  cupperAlignment: CupperAlignmentRow[] | null;
  /** Owner-only raw participant matrix — null for non-owners (no taster-scoped cloud). */
  participants: ParticipantResult[] | null;
  isOwner: boolean;
  isSoloDescriptors: boolean;
  format: SessionFormat;
  sampleId: "all" | string;
  onSampleIdChange: (id: "all" | string) => void;
  blockId: string;
  onBlockIdChange: (id: string) => void;
  locale: string;
  t: DescriptoresTabTranslations;
  help: ResultsHelp;
}) {
  // "all" = the anonymous group/solo cloud; a participant id switches the
  // cloud to that cupper's own descriptors (owner-only).
  const [tasterId, setTasterId] = useState<"all" | string>("all");

  const canViewTasterCloud = isOwner && !!participants?.length;

  const sampleItems = [
    { id: "all", label: t.filterSampleAll },
    ...descriptorFrequency.map((s) => ({ id: s.sampleId, label: s.label })),
  ];

  const blockItems = [
    { id: "general", label: blockLabels.general ?? "General" },
    ...PERCEPTUAL_BLOCKS.map((b) => ({ id: b.id, label: blockLabels[b.id] ?? b.id })),
  ];

  const hideSingles = useSyncExternalStore(
    subscribeHideSingles,
    getHideSinglesSnapshot,
    getHideSinglesServerSnapshot,
  );
  // Solo sessions have exactly one cupper, so every descriptor is "single".
  const singlesToggleVisible = !isSoloDescriptors;
  const hideSinglesActive = hideSingles && singlesToggleVisible;
  const changeHideSingles = () => {
    try {
      window.localStorage.setItem(HIDE_SINGLES_KEY, hideSingles ? "0" : "1");
    } catch {
      // Storage denied — the choice just won't persist.
    }
    window.dispatchEvent(new Event(HIDE_SINGLES_EVENT));
  };

  const groupCloudWords = useMemo(() => {
    const scope: FlavorCloudScope =
      sampleId === "all" ? { kind: "session" } : { kind: "sample", sampleId };
    // General = every stage once (buildFlavorCloud sums stage mentions and
    // merges same-label entries, so nothing is counted twice).
    const blockIds = blockId === "general" ? ALL_BLOCK_IDS : [blockId];
    const words = buildFlavorCloud(descriptorFrequency, scope, blockIds, locale === "en" ? "en" : "es");
    if (!hideSinglesActive) return words;
    const shared = sharedLabelKeys(descriptorFrequency, scope, blockId);
    return words.filter((w) => shared.has(labelKey(w.label)));
  }, [descriptorFrequency, sampleId, blockId, locale, hideSinglesActive]);

  const tasterCloudWords = useMemo(() => {
    if (tasterId === "all" || !participants) return [];
    const participant = participants.find((p) => p.id === tasterId);
    if (!participant) return [];
    const scopedSamples =
      sampleId === "all" ? participant.samples : participant.samples.filter((s) => s.id === sampleId);
    const blobs = scopedSamples.map((s) => (format === "descriptive" ? s.descriptive : s.combined));
    return buildTasterCloud(blobs, locale === "en" ? "en" : "es");
  }, [tasterId, participants, sampleId, format, locale]);

  const activeCloudWords = tasterId === "all" ? groupCloudWords : tasterCloudWords;

  const visibleSampleIds = sampleId === "all" ? null : [sampleId];
  const minCount = hideSinglesActive ? 2 : 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Filter rows: sample scope + perceptual block scope */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <InfoHint title={help.filtros.title} body={help.filtros.body} closeLabel={help.closeLabel} />
        </div>
        <PillTabs
          items={sampleItems}
          value={sampleId}
          onChange={(id) => onSampleIdChange(id as "all" | string)}
          ariaLabel={t.filterSampleAll}
        />
        <PillTabs
          items={blockItems}
          value={blockId}
          onChange={onBlockIdChange}
          ariaLabel={t.filterBlockLabel}
          size="sm"
        />
        {singlesToggleVisible && (
          <PillTabs
            items={[{ id: "hide", label: t.hideSingles }]}
            value={hideSingles ? "hide" : ""}
            onChange={changeHideSingles}
            ariaLabel={t.hideSingles}
            size="sm"
          />
        )}
      </div>

      {/* Word cloud */}
      <div className="rounded-card border border-outline-variant bg-surface-container-lowest p-4 flex flex-col gap-3">
        <h3 className="inline-flex items-center gap-1.5 font-display text-lg font-medium text-primary-container">
          {isSoloDescriptors ? t.soloCloudTitle : t.cloudTitle}
          <InfoHint title={help.nube.title} body={help.nube.body} closeLabel={help.closeLabel} />
        </h3>

        {canViewTasterCloud && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {[{ id: "all", name: t.tasterScopeAll }, ...participants!].map((p) => {
              const active = p.id === tasterId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTasterId(p.id)}
                  className={`shrink-0 whitespace-nowrap rounded-pill border px-3 py-1 text-xs font-medium transition-colors min-h-[44px] ${
                    active
                      ? "border-primary-container bg-primary-container text-on-primary"
                      : "border-outline-variant text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        )}

        <WordCloud words={activeCloudWords} emptyLabel={t.cloudEmpty} />
      </div>

      {/* Per-sample descriptor bars for the active block */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <InfoHint
            title={help.frecuencia.title}
            body={help.frecuencia.body}
            closeLabel={help.closeLabel}
          />
        </div>
        <DescriptorFrequency
          samples={descriptorFrequency}
          activeBlockId={blockId}
          visibleSampleIds={visibleSampleIds}
          minCount={minCount}
          blockLabels={blockLabels}
          t={{
            viewAll: t.descViewAll,
            byGroup: t.descByGroup,
            of: t.descOf,
            participants: t.descParticipants,
            emptyBlock: t.descEmptyBlock,
            emptyAll: t.descEmptyAll,
            close: t.close,
          }}
        />
      </div>

      {/* Owner-only cupper alignment, scoped to the same sample filter */}
      {isOwner && cupperAlignment && cupperAlignment.length > 0 && (
        <CupperAlignment
          rows={cupperAlignment}
          sampleFilter={sampleId === "all" ? null : sampleId}
          t={{
            title: t.alignTitle,
            subtitle: t.alignSubtitle,
            excluded: t.alignExcluded,
            noData: t.alignNoData,
          }}
          titleAction={
            <InfoHint
              title={help.alineacion.title}
              body={help.alineacion.body}
              closeLabel={help.closeLabel}
            />
          }
        />
      )}
    </div>
  );
}
