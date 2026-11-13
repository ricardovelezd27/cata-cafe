"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ConfirmDialog, Badge } from "@/components/ui";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import {
  applyReplayOutcome,
  listTerminalEntries,
  removeModule,
  type UnsyncedEntry,
} from "@/lib/offline/store";
import { submitLateDraft } from "@/app/actions/offline";
import { isModuleSendable } from "@/lib/lateContributions";
import { useActionFeedback } from "@/components/ui";
import { draftToText } from "@/lib/offline/draftText";
import { OFFLINE_SYNC_EVENT } from "@/hooks/useOfflineSync";
import type { ModuleKey } from "@/lib/offline/types";

export type UnsyncedNotesTranslations = {
  title: string;
  intro: string;
  empty: string;
  statusClosed: string;
  statusOrphaned: string;
  statusRevealed: string;
  statusFailed: string;
  view: string;
  hide: string;
  copy: string;
  copied: string;
  discard: string;
  discardTitle: string;
  discardBody: string;
  discardConfirm: string;
  cancel: string;
  close: string;
  openSession: string;
  moduleDescriptive: string;
  moduleAffective: string;
  moduleCombined: string;
  modulePhysical: string;
  moduleExtrinsic: string;
  /** RAW template with "{date}". */
  savedAt: string;
  // S10 WP4b (Kim C1c): send a COMPLETE note of a closed session to the organizer.
  send: string;
  sending: string;
  sendHint: string;
  sent: string;
  sendFailed: string;
  sendConflict: string;
  /** The organizer already holds the draft the server had when the session closed. */
  sendKeptDraft: string;
  sendRejected: string;
};

const entryKey = (e: UnsyncedEntry) => `${e.sessionId}:${e.sampleId}:${e.moduleKey}`;

// "Notas sin sincronizar" (S8-09, F-sesiones-5, F-offline-1 storage half): the
// drafts that can never reach the server (session closed, sample deleted,
// replay gave up). View and copy always work. A COMPLETE note of a closed session can
// also be sent to the organizer (S10 WP4b, `TODO(kim-validar:C1)`): it lands on the
// server as a draft only and the organizer decides whether to include it. An
// incomplete note keeps today's options. Nothing is deleted without an explicit
// confirmation.
export function UnsyncedNotesPanel({
  open,
  onOpenChange,
  userId,
  locale,
  translations: t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  locale: string;
  translations: UnsyncedNotesTranslations;
}) {
  const [entries, setEntries] = useState<UnsyncedEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState<UnsyncedEntry | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const feedback = useActionFeedback();

  const refresh = useCallback(async () => {
    setEntries(await listTerminalEntries(userId));
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    // Mirrors durable storage into React state when the panel opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [open, refresh]);

  const moduleLabel: Record<ModuleKey, string> = {
    descriptive: t.moduleDescriptive,
    affective: t.moduleAffective,
    combined: t.moduleCombined,
    physical: t.modulePhysical,
    extrinsic: t.moduleExtrinsic,
  };

  const statusLabel = (e: UnsyncedEntry) =>
    e.status === "closed_unsent"
      ? t.statusClosed
      : e.status === "revealed_unsent"
        ? t.statusRevealed
        : e.status === "orphaned"
        ? t.statusOrphaned
        : t.statusFailed;

  const copy = async (e: UnsyncedEntry) => {
    try {
      await navigator.clipboard.writeText(draftToText(e.data));
      setCopiedKey(entryKey(e));
      setTimeout(() => setCopiedKey((k) => (k === entryKey(e) ? null : k)), 2000);
    } catch {
      // Clipboard blocked: the text is still on screen to select by hand.
      setExpanded(entryKey(e));
    }
  };

  const discard = async () => {
    if (!discarding) return;
    await removeModule(discarding.sessionId, userId, discarding.sampleId, discarding.moduleKey);
    setDiscarding(null);
    await refresh();
    window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));
  };

  const send = async (e: UnsyncedEntry) => {
    setSendingKey(entryKey(e));
    try {
      const { status, reason } = await submitLateDraft({
        sessionSampleId: e.sampleId,
        moduleKey: e.moduleKey as "descriptive" | "affective" | "combined",
        data: e.data,
        clientTs: e.updatedAt,
        pinnedView: e.pinnedView === true,
        expectedUserId: userId,
      });
      if (status === "synced") {
        // The module leaves the panel as synced (lib/offline/status.ts "synced"); an edit
        // made meanwhile keeps its newer data (ifUpdatedAt).
        await applyReplayOutcome(e.sessionId, userId, e.sampleId, e.moduleKey, "synced", {
          ifUpdatedAt: e.updatedAt,
        });
        feedback.notifySuccess(t.sent);
        await refresh();
        window.dispatchEvent(new Event(OFFLINE_SYNC_EVENT));
      } else {
        feedback.notifyWarning(
          status === "conflict"
            ? reason === "saved_before_close"
              ? t.sendKeptDraft
              : t.sendConflict
            : status === "rejected" || status === "gone"
              ? t.sendRejected
              : t.sendFailed,
        );
      }
    } catch {
      feedback.notifyWarning(t.sendFailed);
    } finally {
      setSendingKey(null);
    }
  };

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t.title} closeLabel={t.close}>
        <div className="space-y-4">
          <p className="font-sans text-sm text-on-surface-variant">{t.intro}</p>
          {entries.length === 0 ? (
            <p className="font-sans text-sm text-on-surface-variant">{t.empty}</p>
          ) : (
            <ul className="space-y-3">
              {entries.map((e) => {
                const key = entryKey(e);
                const text = draftToText(e.data);
                return (
                  <li
                    key={key}
                    className="rounded-card border border-outline-variant bg-surface-container-low p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-sans text-sm font-semibold text-on-surface">
                        {e.sampleLabel}
                      </span>
                      <Badge tone="outline">{moduleLabel[e.moduleKey]}</Badge>
                      <Badge tone={e.status === "closed_unsent" || e.status === "revealed_unsent" ? "accent" : "danger"}>
                        {statusLabel(e)}
                      </Badge>
                    </div>
                    <p className="mt-1 font-sans text-xs text-on-surface-variant">
                      {t.savedAt.replace("{date}", dateFmt.format(new Date(e.updatedAt)))}
                    </p>
                    {e.status === "closed_unsent" && isModuleSendable(e.moduleKey, e.data) && (
                      <p className="mt-1 font-sans text-xs text-on-surface-variant">{t.sendHint}</p>
                    )}
                    {expanded === key && (
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-input bg-surface p-2 font-sans text-sm text-on-surface">
                        {text}
                      </pre>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpanded(expanded === key ? null : key)}
                        aria-expanded={expanded === key}
                      >
                        {expanded === key ? t.hide : t.view}
                      </Button>
                      {e.status === "closed_unsent" && isModuleSendable(e.moduleKey, e.data) && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={sendingKey !== null}
                          onClick={() => void send(e)}
                        >
                          {sendingKey === key ? t.sending : t.send}
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => void copy(e)}>
                        {copiedKey === key ? t.copied : t.copy}
                      </Button>
                      {e.status === "closed_unsent" && (
                        <Link
                          href={`/${locale}/app/sessions/${e.sessionId}/results?closed=1`}
                          className="inline-flex min-h-[44px] items-center px-3.5 font-sans text-xs font-medium text-primary-container underline underline-offset-2"
                        >
                          {t.openSession}
                        </Link>
                      )}
                      <Button size="sm" variant="danger" onClick={() => setDiscarding(e)}>
                        {t.discard}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ResponsiveDialog>
      <ConfirmDialog
        open={discarding !== null}
        onOpenChange={(o) => {
          if (!o) setDiscarding(null);
        }}
        title={t.discardTitle}
        body={t.discardBody}
        confirmLabel={t.discardConfirm}
        cancelLabel={t.cancel}
        closeLabel={t.close}
        onConfirm={discard}
      />
    </>
  );
}
