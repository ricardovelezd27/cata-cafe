"use client";

import { AFFECTIVE_LABELS } from "@/lib/constants";
import {
  clearCooledValue,
  cooledPair,
  isNotEvaluated,
  setCooledValue,
  setNotEvaluated,
} from "@/lib/affectivePartial";

// Two small, optional controls under the bubbles of ONE affective section (S10 WP3b):
//  - "No evaluado" (Kim C4): the cupper could not judge the section; the bubbles are
//    cleared and disabled, the section reads "No evaluado" and the evaluation becomes a
//    declared partial (no total). Toggling off re-opens the section empty.
//  - "¿Cambió al enfriarse?" (Kim A5): a second value, "7 → 8"; `<attr>_final` stays THE
//    value, `<attr>_inicial` keeps the first one (display-only).
// Both edit the module blob through the same onChange as every other field, so they
// autosave with it. The enclosing <fieldset disabled> freezes them for a revealed
// sample, and CupClient.setSampleData refuses the change anyway (lib/revealFreeze.ts).
// TODO(kim-validar:C4) TODO(kim-validar:A5)

export type PartialCopy = {
  notEvaluated: string;
  notEvaluatedOn: string;
  evaluateIt: string;
  cooledPrompt: string;
  cooledLabel: string;
  cooledRemove: string;
  /** "{from} → {to} al enfriarse": fetched with t.raw() and replaced client-side. */
  cooledSummary: string;
  /** "Tu evaluación de {sample} es parcial…": t.raw(), replaced client-side. */
  submitNote: string;
  submitTitle: string;
  /** Results: shown instead of a score. */
  scoreLabel: string;
  /** "Incluye {n} evaluación parcial" / plural: t.raw(), replaced client-side. */
  includesOne: string;
  includesMany: string;
};

/** Used only when the cup error boundary rehydrates an older cached prop blob without
 *  `partial` (same idea as MARKET_COPY_FALLBACK). tests/partialCopy.test.ts keeps it
 *  equal to the message files. */
export const PARTIAL_COPY_FALLBACK: Record<"es" | "en", PartialCopy> = {
  es: {
    notEvaluated: "No evaluado",
    notEvaluatedOn: "Esta sección quedó sin evaluar.",
    evaluateIt: "Evaluarla",
    cooledPrompt: "¿Cambió al enfriarse?",
    cooledLabel: "Valor al enfriarse",
    cooledRemove: "Quitar",
    cooledSummary: "{from} → {to} al enfriarse",
    submitNote:
      "Tu evaluación de {sample} es parcial: no tendrá puntaje total. Lo que sí calificaste cuenta en los promedios por atributo.",
    submitTitle: "Enviar evaluación parcial",
    scoreLabel: "Parcial · sin puntaje",
    includesOne: "Incluye {n} evaluación parcial",
    includesMany: "Incluye {n} evaluaciones parciales",
  },
  en: {
    notEvaluated: "Not evaluated",
    notEvaluatedOn: "This section was left unevaluated.",
    evaluateIt: "Evaluate it",
    cooledPrompt: "Did it change as it cooled?",
    cooledLabel: "Value as it cooled",
    cooledRemove: "Remove",
    cooledSummary: "{from} → {to} as it cooled",
    submitNote:
      "Your evaluation of {sample} is partial: it will have no total score. What you did rate counts in the per-attribute averages.",
    submitTitle: "Submit a partial evaluation",
    scoreLabel: "Partial · no score",
    includesOne: "Includes {n} partial evaluation",
    includesMany: "Includes {n} partial evaluations",
  },
};

type Data = Record<string, unknown>;

const BTN =
  "inline-flex min-h-[44px] items-center rounded-input px-3 font-sans text-sm text-on-surface-variant underline underline-offset-2 hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50";

/** Whether a section's bubbles must be disabled/hidden by the form: it is marked "no evaluado". */
export function sectionNotEvaluated(data: Data, attrId: string): boolean {
  return isNotEvaluated(data, attrId);
}

export function AttributeExtras({
  data,
  onChange,
  attrId,
  copy,
  locked = false,
}: {
  data: Data;
  onChange: (d: Data) => void;
  /** The affective id (an id of AFFECTIVE_ATTRIBUTES), e.g. "fragancia_af". */
  attrId: string;
  copy: PartialCopy;
  /** Pinned reference: neither control is offered (lib/referenceRules.ts). */
  locked?: boolean;
}) {
  if (locked) return null;

  const notEvaluated = isNotEvaluated(data, attrId);
  const finalValue = Number(data[`${attrId}_final`]);
  const hasValue = Number.isFinite(finalValue) && finalValue > 0;
  const pair = cooledPair(data, attrId);

  if (notEvaluated) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3" data-testid={`ne-${attrId}`}>
        <span className="font-sans text-sm font-medium text-on-surface-variant">{copy.notEvaluatedOn}</span>
        <button type="button" className={BTN} onClick={() => onChange(setNotEvaluated(data, attrId, false))}>
          {copy.evaluateIt}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3">
      <button type="button" className={BTN} onClick={() => onChange(setNotEvaluated(data, attrId, true))}>
        {copy.notEvaluated}
      </button>

      {hasValue && !pair && (
        <details className="min-w-0">
          <summary className={`${BTN} cursor-pointer list-none`}>{copy.cooledPrompt}</summary>
          <div className="mt-2" role="group" aria-label={copy.cooledLabel}>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9]
                .filter((n) => n !== finalValue)
                .map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onChange(setCooledValue(data, attrId, n))}
                    aria-label={`${copy.cooledLabel}: ${n} — ${AFFECTIVE_LABELS[n]}`}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-pill border border-outline-variant font-sans text-sm text-on-surface hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    {n}
                  </button>
                ))}
            </div>
          </div>
        </details>
      )}

      {pair && (
        <span className="inline-flex items-center gap-2 font-sans text-sm text-on-surface">
          <span aria-label={copy.cooledSummary.replace("{from}", String(pair.from)).replace("{to}", String(pair.to))}>
            {pair.from} → {pair.to}
          </span>
          <button type="button" className={BTN} onClick={() => onChange(clearCooledValue(data, attrId))}>
            {copy.cooledRemove}
          </button>
        </span>
      )}
    </div>
  );
}
