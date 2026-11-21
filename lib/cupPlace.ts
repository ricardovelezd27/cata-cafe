// The cupping screen's place in the address (audit D-01, package P5b): which sample and which
// step the cupper is on, as `?sample=<session sample id>&step=<n>` (n is 1-based). Pure, no DOM.
//
// The address is WRITTEN FROM the page's state (after every move) and READ ONCE at mount, as
// the page already reads `?sample=` on the server (`cup/page.tsx` -> `initialSampleId`); it is
// never a second source of truth. Every reader is strict: an unknown sample or step is ignored
// (the page starts at the first) and the next write replaces it. Other keys are kept.

import { sameSearch, withParams } from "@/lib/viewAddress";

/** The place copy (messages `cupping.place`): `{n}` / `{total}` are replaced client-side. */
export type CupPlaceCopy = {
  stepsLabel: string;
  stepOf: string;
  sampleOf: string;
  sendStep: string;
  /** The OTHER language's name, written in it ("English" on the Spanish page). */
  language: string;
  languageLabel: string;
};

/** Used only when the cup error boundary rehydrates an older cached prop blob without
 *  `place`. tests/cupPlace.test.ts keeps it equal to the message files. */
export const CUP_PLACE_FALLBACK: Record<"es" | "en", CupPlaceCopy> = {
  es: {
    stepsLabel: "Pasos de la cata",
    stepOf: "paso {n} de {total}",
    sampleOf: "muestra {n} de {total}",
    sendStep: "Enviar",
    language: "English",
    languageLabel: "Cambiar el idioma a inglés",
  },
  en: {
    stepsLabel: "Cupping steps",
    stepOf: "step {n} of {total}",
    sampleOf: "sample {n} of {total}",
    sendStep: "Send",
    language: "Español",
    languageLabel: "Switch the language to Spanish",
  },
};

export const CUP_SAMPLE_PARAM = "sample";
export const CUP_STEP_PARAM = "step";

/** The 0-based step index a `step` value names, or 0 when it is not 1..stepCount. */
export function cupStepIndexFrom(value: string | null | undefined, stepCount: number): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,1}$/.test(value)) return 0;
  const n = Number(value);
  return n >= 1 && n <= stepCount ? n - 1 : 0;
}

/** The 0-based sample index a `sample` value names among the page's samples, or 0. */
export function cupSampleIndexFrom(value: string | null | undefined, sampleIds: readonly string[]): number {
  if (typeof value !== "string" || value === "") return 0;
  const i = sampleIds.indexOf(value);
  return i >= 0 ? i : 0;
}

/** The browser pieces `writePlaceToHistory` touches (a `window`, or a test's stand-in). */
export type HistoryHost = {
  location: { pathname: string; search: string; hash: string };
  history: { state: unknown; replaceState: (data: unknown, unused: string, url?: string | null) => void };
};

/** The keys Next.js keeps in a history entry's state for its own router. */
const NEXT_STATE_KEYS = ["__NA", "__PRIVATE_NEXTJS_INTERNALS_TREE", "_N"] as const;

/**
 * Write the cupper's place into the address with `replaceState`, keeping the entry's OWN
 * state (the back trap's sentinel flag) but never Next's internal keys.
 *
 * Why (found on Ricardo's phone, 2026-11-19): Next 16 patches `history.replaceState`, and
 * when the state passed in already carries Next's `__NA` it calls the original directly and
 * does NOT tell its router about the new URL. The address bar changed, the router kept the
 * old one, and its next `router.refresh()` (a group session refreshes every 30 s, and on
 * every resume) wrote the old URL back: a reload then opened the first sample and step.
 * Passing the state WITHOUT Next's keys lets the patch copy them back itself and update the
 * router's URL (as P5a's tables do). Returns whether it wrote.
 */
export function writePlaceToHistory(host: HistoryHost, sampleId: string | null, stepIndex: number): boolean {
  const next = writeCupPlace(host.location.search, sampleId, stepIndex);
  if (sameSearch(next, host.location.search)) return false;
  const current = host.history.state;
  const own: Record<string, unknown> = {};
  if (current && typeof current === "object") {
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (!(NEXT_STATE_KEYS as readonly string[]).includes(key)) own[key] = value;
    }
  }
  host.history.replaceState(own, "", `${host.location.pathname}${next}${host.location.hash}`);
  return true;
}

/** The query string with the cupper's place written in (sample id, 1-based step); other keys kept. */
export function writeCupPlace(search: string, sampleId: string | null, stepIndex: number): string {
  return withParams(search, {
    [CUP_SAMPLE_PARAM]: sampleId && sampleId !== "" ? sampleId : null,
    [CUP_STEP_PARAM]: Number.isInteger(stepIndex) && stepIndex >= 0 ? String(stepIndex + 1) : null,
  });
}
