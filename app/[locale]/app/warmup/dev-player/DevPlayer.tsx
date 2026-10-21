"use client";

import { useState } from "react";
import { WARMUP_EXERCISES, warmupById } from "@/lib/warmup/exercises";
import { WarmupPlayer, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";

export function DevPlayer({
  exerciseId,
  locale,
  inline,
  strings,
}: {
  exerciseId: string;
  locale: string;
  inline: boolean;
  strings: WarmupPlayerStrings;
}) {
  const [log, setLog] = useState<string[]>([]);
  const [epoch, setEpoch] = useState(0);
  const exercise = warmupById(exerciseId) ?? WARMUP_EXERCISES[0];
  const push = (m: string) => setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)} ${m}`]);
  return (
    <div className="space-y-4" data-dev-player>
      {inline && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span>dev · player ({exercise.id})</span>
          <button type="button" className="rounded-pill border border-outline-variant px-3 py-1" onClick={() => setEpoch((e) => e + 1)}>
            Remount
          </button>
          <span data-dev-log>{log.join(" · ")}</span>
        </div>
      )}
      <WarmupPlayer
        key={epoch}
        exercise={exercise}
        locale={locale}
        t={strings}
        inline={inline}
        onFinish={() => push("finish")}
        onSkip={() => push("skip")}
      />
    </div>
  );
}
