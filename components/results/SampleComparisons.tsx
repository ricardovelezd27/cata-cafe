"use client";

/**
 * S10 WP5b (B3 + B6, TODO(kim-validar:B3 / B6)): two small neutral blocks under
 * the personal drill-down of a sample of a CLOSED session.
 *  - "Tú y el grupo" (B3): the viewer's own numbers next to the group's. Built on
 *    the server (lib/reports/personalComparison.ts), already gated by n >= 3.
 *  - "Misma muestra, dos veces" (B6): the viewer's own two evaluations of the
 *    same coffee against a 2-point tolerance (lib/reports/repeatedSample.ts).
 * Neutral wording and tokens only: scoring differently is never an error, no
 * red or green by direction. Strings with {placeholders} arrive raw and are
 * replaced here.
 */

import type { PersonalComparison } from "@/lib/reports/personalComparison";
import type { RepeatDiff } from "@/app/[locale]/app/sessions/[id]/results/types";

export type SampleComparisonsTranslations = {
  groupTitle: string;
  /** "Grupo: {group} · entre {min} y {max} · ± {sd}" */
  groupLine: string;
  /** "Tu total: {mine}" */
  mineLine: string;
  /** "tú {mine} · grupo {group}" */
  attrLine: string;
  /** "Con menos de 3 catadores no se muestra la comparación con el grupo." */
  tooFew: string;
  notAnError: string;
  intensities: string;
  matches: string;
  missed: string;
  repeatTitle: string;
  /** "Frente a {label}" */
  repeatVs: string;
  total: string;
  within: string;
  /** "diferencia de {x}" */
  beyond: string;
  /** "{mine} y {other}" */
  repeatValues: string;
  repeatNote: string;
};

const fmt = (v: number | null, digits = 2): string => (v === null ? "—" : v.toFixed(digits));

export function SampleComparisons({
  comparison,
  repeatDiffs,
  t,
}: {
  comparison?: PersonalComparison | null;
  repeatDiffs?: RepeatDiff[];
  t: SampleComparisonsTranslations;
}) {
  const hasGroup = !!comparison;
  const hasRepeat = !!repeatDiffs && repeatDiffs.length > 0;
  if (!hasGroup && !hasRepeat) return null;

  return (
    <div className="flex flex-col gap-4">
      {comparison && (
        <section className="flex flex-col gap-2 rounded-card border border-outline-variant bg-surface-container-low p-4">
          <h3 className="font-display text-sm font-semibold text-on-surface">{t.groupTitle}</h3>
          {comparison.status === "too_few" ? (
            <p className="text-sm text-on-surface-variant">{t.tooFew}</p>
          ) : (
            <>
              {comparison.affective && (
                <>
                  <p className="text-sm text-on-surface">
                    {t.mineLine.replace("{mine}", fmt(comparison.affective.mine))}
                  </p>
                  {comparison.affective.group !== null && (
                    <p className="text-sm text-on-surface-variant">
                      {t.groupLine
                        .replace("{group}", fmt(comparison.affective.group))
                        .replace("{sd}", fmt(comparison.affective.sd, 1))}
                    </p>
                  )}
                  <ul className="flex flex-col gap-1">
                    {comparison.affective.attrs
                      .filter((a) => a.mine !== null || a.group !== null)
                      .map((a) => (
                        <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="text-on-surface">{a.label}</span>
                          <span className="tabular-nums text-on-surface-variant">
                            {t.attrLine
                              .replace("{mine}", a.mine === null ? "—" : String(a.mine))
                              .replace("{group}", a.group === null ? "—" : String(a.group))}
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              )}
              {comparison.descriptive && (
                <>
                  {comparison.descriptive.intensities.length > 0 && (
                    <>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                        {t.intensities}
                      </h4>
                      <ul className="flex flex-col gap-1">
                        {comparison.descriptive.intensities.map((a) => (
                          <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="text-on-surface">{a.label}</span>
                            <span className="tabular-nums text-on-surface-variant">
                              {t.attrLine
                                .replace("{mine}", a.mine === null ? "—" : String(a.mine))
                                .replace("{group}", a.group === null ? "—" : String(a.group))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {comparison.descriptive.matches.length > 0 && (
                    <p className="text-sm text-on-surface">
                      <span className="text-on-surface-variant">{t.matches}: </span>
                      {comparison.descriptive.matches.map((d) => d.label).join(", ")}
                    </p>
                  )}
                  {comparison.descriptive.missed.length > 0 && (
                    <p className="text-sm text-on-surface">
                      <span className="text-on-surface-variant">{t.missed}: </span>
                      {comparison.descriptive.missed.map((d) => d.label).join(", ")}
                    </p>
                  )}
                </>
              )}
              {comparison.partial && <p className="text-xs text-on-surface-variant">{t.tooFew}</p>}
              <p className="text-xs text-on-surface-variant">{t.notAnError}</p>
            </>
          )}
        </section>
      )}

      {hasRepeat && (
        <section className="flex flex-col gap-3 rounded-card border border-outline-variant bg-surface-container-low p-4">
          <h3 className="font-display text-sm font-semibold text-on-surface">{t.repeatTitle}</h3>
          {repeatDiffs!.map((d) => (
            <div key={d.partnerLabel} className="flex flex-col gap-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                {t.repeatVs.replace("{label}", d.partnerLabel)}
              </p>
              <ul className="flex flex-col gap-1">
                {[...(d.total ? [{ ...d.total, label: t.total }] : []), ...d.intensities].map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-on-surface">{r.label}</span>
                    <span className="text-right tabular-nums text-on-surface-variant">
                      {t.repeatValues.replace("{mine}", String(r.mine)).replace("{other}", String(r.other))}
                      {" · "}
                      {r.within ? t.within : t.beyond.replace("{x}", String(Math.abs(r.diff)))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-on-surface-variant">{t.repeatNote}</p>
        </section>
      )}
    </div>
  );
}
