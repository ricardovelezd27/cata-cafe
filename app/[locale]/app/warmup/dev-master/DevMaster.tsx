"use client";

import { useEffect, useState } from "react";
import { MasterControls } from "@/components/ui/MasterControls";
import { formatTimeLeft } from "@/lib/warmup/syncedRun";

export function DevMaster({
  strings,
}: {
  strings: Record<
    | "title"
    | "submitted"
    | "close"
    | "invite"
    | "generating"
    | "copy"
    | "copied"
    | "copyImage"
    | "downloadQr"
    | "start"
    | "starting"
    | "warmupStart"
    | "warmupStop"
    | "warmupReopen"
    | "warmupRunning"
    | "warmupTimeLeft"
    | "cancel",
    string
  >;
}) {
  const RUN_MS = 90_000;
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [startedAt]);
  const running = startedAt !== null && now > 0 && now - startedAt < RUN_MS;
  const push = (m: string) => setLog((l) => [...l, m]);
  return (
    <div className="space-y-4" data-dev-master>
      <p className="text-xs text-on-surface-variant">
        dev · master panel · synced warm-up block (90 s fake run) · <span data-dev-log>{log.join(" · ")}</span>
      </p>
      <MasterControls
        title={strings.title}
        submittedLabel={strings.submitted}
        closeLabel={strings.close}
        inviteLabel={strings.invite}
        generatingLabel={strings.generating}
        copyLabel={strings.copy}
        copiedLabel={strings.copied}
        qrCopyImageLabel={strings.copyImage}
        qrDownloadLabel={strings.downloadQr}
        sessionClosed={false}
        inviteLink={null}
        isGenerating={false}
        isCopied={false}
        onClose={() => push("close")}
        onGenerate={() => push("invite")}
        onCopy={() => push("copy")}
        onResetInvite={() => push("reset")}
        startLabel={strings.start}
        startingLabel={strings.starting}
        showStart
        isStarting={false}
        onStart={() => push("start")}
        warmup={{
          exerciseLabel: "Los ojos · 5 min",
          startLabel: strings.warmupStart,
          stopLabel: strings.warmupStop,
          reopenLabel: strings.warmupReopen,
          runningLabel: strings.warmupRunning,
          timeLeft: running && startedAt !== null ? strings.warmupTimeLeft.replace("{time}", formatTimeLeft(RUN_MS - (now - startedAt))) : null,
          running,
          pending: false,
          onStart: () => {
            setStartedAt(Date.now());
            push("warmup:start");
          },
          onStop: () => {
            setStartedAt(null);
            push("warmup:stop");
          },
          onReopen: () => push("warmup:reopen"),
        }}
      />
    </div>
  );
}
