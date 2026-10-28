"use client";

import { useState } from "react";
import { WARMUP_EXERCISES, warmupById } from "@/lib/warmup/exercises";
import { WarmupPlayer, type WarmupPlayerMode, type WarmupPlayerStrings } from "@/components/warmup/WarmupPlayer";

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
  const [mode, setMode] = useState<WarmupPlayerMode>("library");
  const [seekSec, setSeekSec] = useState<number | null>(null);
  const [exitAt, setExitAt] = useState<number | null>(null);
  const exercise = warmupById(exerciseId) ?? WARMUP_EXERCISES[0];
  const push = (m: string) => setLog((l) => [...l, `${new Date().toISOString().slice(11, 19)} ${m}`]);
  const btn = "rounded-pill border border-outline-variant px-3 py-1";
  return (
    <div className="space-y-4" data-dev-player>
      {inline && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <span>dev · player ({exercise.id})</span>
          <button type="button" className={btn} onClick={() => setEpoch((e) => e + 1)}>
            Remount
          </button>
          <select className={btn} value={mode} onChange={(e) => setMode(e.target.value as WarmupPlayerMode)} aria-label="mode">
            <option value="library">library</option>
            <option value="session">session</option>
            <option value="synced">synced</option>
          </select>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setSeekSec(60);
              setEpoch((e) => e + 1);
            }}
          >
            Open seeked at 60 s
          </button>
          <button type="button" className={btn} onClick={() => setExitAt(Date.now() + 30000)}>
            Simulate “La cata empezó”
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
        mode={mode}
        seekToMs={seekSec !== null ? seekSec * 1000 : undefined}
        exitRequest={exitAt ? { deadlineMs: exitAt, label: "La cata empezó", leavingIn: "Te llevamos en {time}" } : null}
        onFinish={() => push("finish")}
        onExit={() => push("exit")}
      />
    </div>
  );
}
