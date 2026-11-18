"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setParticipantExclusion } from "@/app/actions/community";
import { Card, useActionFeedback } from "@/components/ui";
import { ExclusionDialog } from "@/components/results/ExclusionDialog";
import { PanelMatrix } from "@/components/results/PanelMatrix";
import type { PanelStrings } from "@/components/results/panelStrings";
import type { SessionFormat } from "@/lib/constants";
import { exclusionReasonText } from "@/lib/exclusionReasons";
import { PANEL_MATRIX_ROWS, buildPanelMatrix, type PanelParticipant } from "@/lib/reports/panel";

export type ParticipantResult = PanelParticipant & {
  /** Who/when/why the owner excluded this cupper (S8-12); null when included. */
  trail?: { at: string | null; by: string | null; reason: string | null } | null;
};

export type OwnerMatrixTranslations = {
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
  /** S10 WP3b: shown in a cell whose evaluation is a declared partial. */
  partialLabel?: string;
  sdHeader: string;
  /** "{n} de {total} catadores incluidos…" — raw template. */
  includedCount: string;
  excludeDialogTitle: string;
  excludeDialogBody: string;
  /** Shown in the exclusion dialog only when a sample is still under the previous rule; null otherwise. */
  oldRuleNote: string | null;
  excludeReasonLabel: string;
  excludeOtherLabel: string;
  /** Only when the session is closed ("summaries already sent kept the old number"), else null. */
  closedNote: string | null;
  excludeConfirm: string;
  dialogCancel: string;
  dialogClose: string;
  /** "Excluido por {who} el {date} · {reason}" — raw template. */
  excludedTrail: string;
  excludedToast: string;
  restoredToast: string;
  reasons: Record<string, string>;
};

/* On/off switch for include/exclude. The button is the 44 px target; the
   38 x 22 track inside it is what is seen. */
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
      className={`inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-pill p-0 ${
        disabled ? "cursor-default opacity-60" : "cursor-pointer"
      }`}
    >
      <span
        className={`relative block h-[22px] w-[38px] rounded-pill transition-colors ${
          on ? "bg-primary-container" : "bg-surface-container-highest"
        }`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-surface-container-lowest shadow-card transition-[left] ${
            on ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * The organizer's matrix and, under it, who counts in the group's numbers.
 * The two share one piece of state: the switch a cupper was just excluded with
 * greys their totals and takes them out of the spread at once, before the
 * server's refresh confirms it.
 *
 * R5 redrew the matrix (`PanelMatrix`, from the pure `buildPanelMatrix`) and
 * put it above the switches. What the switches DO is unchanged: excluding asks
 * for a reason in `ExclusionDialog` and writes through `setParticipantExclusion`;
 * including again is one tap; a failure says so and the switch stays.
 */
export function OwnerParticipantSection({
  sessionId,
  participants,
  format,
  cupsPerSample,
  readOnly = false,
  onOpenDetail,
  referenceBadge,
  groupScores,
  matrixRows = PANEL_MATRIX_ROWS,
  t,
  panelT,
}: {
  sessionId: string;
  participants: ParticipantResult[];
  format: SessionFormat;
  cupsPerSample: number;
  // Super-admin read view: matrix + drill-down only — the include/exclude
  // management card is hidden (setParticipantExclusion is owner-gated).
  readOnly?: boolean;
  onOpenDetail: (sampleId: string, participantId: string) => void;
  // Label for the badge on the reference (control) sample.
  referenceBadge?: string;
  /** The score each coffee's card shows, by sample id. */
  groupScores?: Readonly<Record<string, number | null>>;
  /** The table's direction; the page never passes it (`PANEL_MATRIX_ROWS`), the review board shows both. */
  matrixRows?: "cuppers" | "coffees";
  t: OwnerMatrixTranslations;
  panelT: PanelStrings;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  const [askExclude, setAskExclude] = useState<ParticipantResult | null>(null);

  // Optimistic exclusion: override per id until the server refresh confirms it.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const isExcluded = (p: { id: string; excluded: boolean }): boolean => overrides[p.id] ?? p.excluded;

  // Run one exclusion write with localized failure feedback (the old code
  // swallowed errors and silently flipped the switch back).
  const applyExclusion = async (
    p: ParticipantResult,
    next: boolean,
    reason?: string,
    reasonText?: string,
  ): Promise<{ ok: boolean }> => {
    setPendingIds((s) => new Set(s).add(p.id));
    try {
      const result = await feedback.run(
        setParticipantExclusion(sessionId, p.id, next, reason, reasonText),
        () => {
          setOverrides((o) => ({ ...o, [p.id]: next }));
          feedback.notifySuccess(next ? t.excludedToast : t.restoredToast);
          router.refresh();
        },
      );
      return { ok: result.ok };
    } finally {
      setPendingIds((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
    }
  };

  // Excluding asks for a reason first; restoring is a plain one-tap undo.
  const toggleExclude = (p: ParticipantResult) => {
    if (isExcluded(p)) void applyExclusion(p, false);
    else setAskExclude(p);
  };

  const includedN = participants.filter((p) => !isExcluded(p)).length;
  const fill = (tpl: string, vars: Record<string, string>) =>
    Object.entries(vars).reduce((acc, [k, val]) => acc.replace(`{${k}}`, val), tpl);

  // The numbers of the matrix: totals, the spread over the INCLUDED cuppers and
  // each cell's distance from the mean of its coffee (lib/reports/panel.ts).
  const matrix = buildPanelMatrix({ participants, isExcluded, format, cupsPerSample, groupScores });

  return (
    <div className="flex flex-col gap-5">
      {/* The matrix: every cell opens that cupper's evaluation of that coffee. */}
      <Card padding="compact" title={t.title}>
        <PanelMatrix
          matrix={matrix}
          rows={matrixRows}
          onOpen={onOpenDetail}
          referenceBadge={referenceBadge}
          t={{
            caption: panelT.matrixCaption,
            region: panelT.matrixRegion,
            group: panelT.group,
            spread: panelT.spread,
            spreadShort: t.sdHeader,
            noScore: t.noScore,
            partial: t.partialLabel ?? t.noScore,
            excludedTag: t.excludedTag,
            markWithin: t.legendGreen,
            markOver1: t.legendAmber,
            markOver2: t.legendRed,
            cell: panelT.cell,
            distOver1: panelT.distOver1,
            distOver2: panelT.distOver2,
            noTotal: panelT.noTotal,
            scrollHint: panelT.scrollHint,
            pickCoffee: panelT.pickCoffee,
            phoneGroup: panelT.phoneGroup,
            phoneSpread: panelT.phoneSpread,
          }}
        />
      </Card>

      {/* Who counts: include or exclude each cupper from the group's numbers. */}
      {!readOnly && (
        <div data-panel-section="who-counts">
        <Card padding="compact" title={t.manageTitle}>
          <p className="-mt-2 mb-1 text-caption leading-snug text-on-surface-variant">{t.manageHint}</p>
          <p className="m-0 mb-3 text-caption font-semibold tabular-nums text-on-surface-variant">
            {fill(t.includedCount, { n: String(includedN), total: String(participants.length) })}
          </p>
          <ul className="m-0 flex list-none flex-col p-0">
            {participants.map((p, i) => {
              const excluded = isExcluded(p);
              return (
                <li
                  key={p.id}
                  className={`flex min-h-[48px] flex-wrap items-center gap-x-2.5 gap-y-1 py-2 ${
                    i === 0 ? "" : "border-t border-outline-variant/60"
                  }`}
                >
                  <span
                    className={`min-w-0 flex-1 truncate text-body font-semibold ${
                      excluded ? "text-on-surface-variant" : "text-on-surface"
                    }`}
                  >
                    <span className={excluded ? "line-through" : ""}>{p.name}</span>
                    {excluded && <span className="ml-1.5 font-normal">{t.excludedTag}</span>}
                  </span>
                  <span className="text-caption text-on-surface-variant">{excluded ? t.excluded : t.included}</span>
                  <ToggleSwitch
                    on={!excluded}
                    disabled={pendingIds.has(p.id)}
                    onClick={() => toggleExclude(p)}
                    ariaLabel={`${excluded ? t.included : t.excluded}: ${p.name}`}
                  />
                  {excluded && p.trail && (p.trail.by || p.trail.at || p.trail.reason) && (
                    <span className="basis-full text-caption text-on-surface-variant">
                      {fill(t.excludedTrail, {
                        who: p.trail.by ?? "—",
                        date: p.trail.at ?? "—",
                        reason: exclusionReasonText(p.trail.reason, t.reasons) ?? "—",
                      })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        </div>
      )}

      {askExclude && (
        <ExclusionDialog
          open
          onOpenChange={(o) => {
            if (!o) setAskExclude(null);
          }}
          cupperName={askExclude.name}
          onConfirm={async (reason, otherText) => {
            const target = askExclude;
            const res = await applyExclusion(target, true, reason, otherText);
            if (res.ok) setAskExclude(null);
            return res;
          }}
          t={{
            title: t.excludeDialogTitle,
            body: t.excludeDialogBody,
            note: t.oldRuleNote,
            closedNote: t.closedNote,
            otherLabel: t.excludeOtherLabel,
            reasonLabel: t.excludeReasonLabel,
            confirm: t.excludeConfirm,
            cancel: t.dialogCancel,
            close: t.dialogClose,
            reasons: t.reasons,
          }}
        />
      )}
    </div>
  );
}
