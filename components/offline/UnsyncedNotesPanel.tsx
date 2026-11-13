"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, ConfirmDialog, Badge } from "@/components/ui";
import { ResponsiveDialog } from "@/components/ui/ResponsiveDialog";
import { listTerminalEntries, removeModule, type UnsyncedEntry } from "@/lib/offline/store";
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
};

const entryKey = (e: UnsyncedEntry) => `${e.sessionId}:${e.sampleId}:${e.moduleKey}`;

// "Notas sin sincronizar" (S8-09, F-sesiones-5, F-offline-1 storage half): the
// drafts that can never reach the server (session closed, sample deleted,
// replay gave up). Read-only on purpose: view and copy only. Sending a note to
// the session owner as a late contribution is a post-close write and waits on
// Kim's answer to C1. Nothing is deleted without an explicit confirmation.
// TODO(C1): send-to-owner (Kim C1 option b) -- a post-close write, not built.
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
