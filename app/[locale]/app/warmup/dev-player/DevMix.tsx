"use client";

import { useEffect, useRef, useState } from "react";
import { playWarmupVoiceClip, setWarmupMixOverride } from "@/hooks/useWarmupAudio";
import { MIX, backgroundUnderVoiceDb, worstCasePeakDb, type MixLevels } from "@/lib/warmup/mix";

// Dev only: tune the mix by ear. The sliders override lib/warmup/mix.ts MIX
// for this page (a running player reschedules at once); "voz de prueba"
// plays one rendered line through the voice lane with the background ducked
// under it, so every level is judged against the real voice. Nothing is
// saved: the numbers you land on go into MIX by hand.

const REFERENCE_CLIP = "/warmup/dev/voice-reference.mp3";

const FIELDS: readonly { key: keyof MixLevels; label: string; min: number; max: number; step: number; unit: string }[] = [
  { key: "markersDb", label: "Campanas vs. voz", min: -24, max: 0, step: 1, unit: "dB" },
  { key: "toneDb", label: "Tono del movimiento vs. voz", min: -30, max: 0, step: 1, unit: "dB" },
  { key: "airDb", label: "Aire de fondo vs. voz", min: -40, max: -6, step: 1, unit: "dB" },
  { key: "duckDb", label: "Bajada del fondo mientras habla", min: -24, max: 0, step: 1, unit: "dB" },
  { key: "duckAttackMs", label: "Tiempo de bajada", min: 80, max: 1000, step: 10, unit: "ms" },
  { key: "duckReleaseMs", label: "Tiempo de vuelta", min: 200, max: 3000, step: 50, unit: "ms" },
];

export function DevMix() {
  const [mix, setMix] = useState<MixLevels>(MIX);
  const [copied, setCopied] = useState(false);
  const stopClip = useRef<(() => void) | null>(null);

  // Leave the committed mix in force when the page goes away.
  useEffect(
    () => () => {
      stopClip.current?.();
      setWarmupMixOverride(null);
    },
    [],
  );

  const change = (key: keyof MixLevels, value: number) => {
    const next = { ...mix, [key]: value };
    setMix(next);
    setWarmupMixOverride(next);
  };
  const reset = () => {
    setMix(MIX);
    setWarmupMixOverride(null);
  };
  const playReference = () => {
    stopClip.current?.();
    void playWarmupVoiceClip(REFERENCE_CLIP).then((stop) => {
      stopClip.current = stop;
    });
  };

  const under = backgroundUnderVoiceDb(mix);
  const peak = worstCasePeakDb(mix);
  const source = `{ markersDb: ${mix.markersDb}, toneDb: ${mix.toneDb}, airDb: ${mix.airDb}, duckDb: ${mix.duckDb}, duckAttackMs: ${mix.duckAttackMs}, duckReleaseMs: ${mix.duckReleaseMs} }`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard refused: the line is selectable */
    }
  };

  const btn = "rounded-pill border border-outline-variant px-3 py-1";
  return (
    <details className="rounded-card border border-outline-variant bg-surface-container-lowest p-3 text-xs text-on-surface-variant" data-dev-mix>
      <summary className="cursor-pointer font-semibold text-on-surface">dev · mix (lib/warmup/mix.ts)</summary>
      <div className="mt-3 space-y-3">
        <p>
          Empieza un ejercicio, toca «voz de prueba» y mueve los controles. Prueba con audífonos y con el altavoz del teléfono. Los números van a mano a{" "}
          <code>MIX</code>.
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="flex justify-between gap-2">
                <span>{f.label}</span>
                <span className="font-semibold tabular-nums text-on-surface">
                  {mix[f.key]} {f.unit}
                </span>
              </span>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={mix[f.key]}
                onChange={(e) => change(f.key, Number(e.target.value))}
                aria-label={f.label}
                data-mix-field={f.key}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} onClick={playReference}>
            Voz de prueba
          </button>
          <button type="button" className={btn} onClick={reset}>
            Volver al mix guardado
          </button>
          <button type="button" className={btn} onClick={copy}>
            {copied ? "Copiado" : "Copiar números"}
          </button>
        </div>
        <p className="tabular-nums">
          Fondo bajo la voz mientras habla: <strong className={under <= -12 ? "text-on-surface" : "text-error"}>{under} dB</strong> (límite: −12 o menos) · Pico en el peor caso:{" "}
          <strong className={peak <= 3 ? "text-on-surface" : "text-error"}>{peak.toFixed(1)} dB</strong> (límite: 3 o menos)
        </p>
        <code className="block select-all break-all" data-mix-source>
          {source}
        </code>
      </div>
    </details>
  );
}
