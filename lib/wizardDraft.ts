// Session-wizard draft kept in localStorage (S8-10 T3, F-crear-sesion-2/-6): a
// reload, a crash or a back-swipe used to lose a long form. Pure helpers — the
// component owns the React state, this owns the storage key, the shape check
// and the "is there anything worth saving" rule so vitest can pin them.
//
//  · keyed PER USER (`cata_wizard_draft_<userId>`): a shared tablet never
//    restores one person's draft for the next;
//  · the DATE is deliberately not saved (it re-defaults to today);
//  · `clearWizardDrafts` is called by clearLocalDeviceState on sign-out.

export const WIZARD_DRAFT_PREFIX = "cata_wizard_draft_";
export const WIZARD_DRAFT_VERSION = 1;
/** A draft older than this is stale and ignored. */
export const WIZARD_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type DraftCoffee = {
  id: string;
  name: string;
  producer: string;
  variety: string;
  altitude: string;
  roastLevel: string;
  country: string;
  region: string;
  farm: string;
  species: string;
  harvestYear: string;
  processType: string;
  certifications: string[];
  notes: string;
  existingCoffeeId?: string;
  linkedOrigin?: "mine" | "shared" | "public";
};

export type DraftSample = {
  id: string;
  label: string;
  coffeeId: string;
  auto: boolean;
  /** A9 optional prep data, flat; absent in drafts saved before it existed. */
  roastDate?: string;
  preparationNote?: string;
  offProtocol?: boolean;
  offProtocolNote?: string;
};

export type WizardDraft = {
  v: number;
  savedAt: number;
  name: string;
  objective: string;
  format: "descriptive" | "affective" | "combined";
  cupsPerSample: number;
  warmupOn: boolean;
  warmupId: string;
  coffees: DraftCoffee[];
  samples: DraftSample[];
  referenceId: string | null;
  isGroup: boolean;
  closesAt: string;
  linkedGroupId: string;
  notifyGroup: boolean;
  /** C8: when a LIVE session's group is emailed. Drafts saved before it existed read as "start". */
  notifyGroupWhen: "create" | "start";
  /** B1: how the reference is scored. Drafts saved before it existed read as "anchor". */
  referenceMode: "anchor" | "free";
};

export function wizardDraftKey(userId: string): string {
  return `${WIZARD_DRAFT_PREFIX}${userId}`;
}

const FORMATS = ["descriptive", "affective", "combined"];

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

/** Anything typed that is worth restoring? An untouched form is not saved. */
export function isDraftDirty(d: Pick<WizardDraft, "name" | "objective" | "coffees" | "samples">): boolean {
  if (d.name.trim() || d.objective.trim()) return true;
  if (d.samples.length > 1 || d.coffees.length > 1) return true;
  if (d.samples.some((s) => s.roastDate || s.preparationNote || s.offProtocol || s.offProtocolNote)) {
    return true;
  }
  return d.coffees.some(
    (c) =>
      !!c.existingCoffeeId ||
      [c.name, c.producer, c.variety, c.altitude, c.roastLevel, c.country, c.region, c.farm, c.species, c.harvestYear, c.processType, c.notes].some(
        (x) => x.trim() !== "",
      ) ||
      c.certifications.length > 0,
  );
}

type DirtyShape = Pick<WizardDraft, "name" | "objective" | "coffees" | "samples">;

/** Content signature ignoring random ids (coffees are referenced by index). */
function contentSignature(d: DirtyShape): string {
  const idx = new Map(d.coffees.map((c, i) => [c.id, i]));
  return JSON.stringify({
    n: d.name.trim(),
    o: d.objective.trim(),
    c: d.coffees.map(({ id: _id, ...rest }) => rest),
    s: d.samples.map((s) => [
      s.label,
      idx.get(s.coffeeId) ?? -1,
      s.roastDate ?? "",
      s.preparationNote ?? "",
      s.offProtocol === true,
      s.offProtocolNote ?? "",
    ]),
  });
}

/**
 * Dirty relative to the form's INITIAL state on this mount (which may already
 * carry a prefill such as ?coffeeId= or the express handoff): an untouched
 * prefilled form is not dirty, so it neither prompts on unload nor overwrites
 * an older saved draft.
 */
export function isDraftDirtyFrom(current: DirtyShape, initial: DirtyShape): boolean {
  return isDraftDirty(current) && contentSignature(current) !== contentSignature(initial);
}

export function serializeDraft(d: Omit<WizardDraft, "v" | "savedAt">, now: number = Date.now()): string {
  return JSON.stringify({ ...d, v: WIZARD_DRAFT_VERSION, savedAt: now });
}

/** Returns the draft, or null when absent / stale / malformed / from another
 *  version. Defensive on purpose: storage is user-editable. */
export function parseDraft(raw: string | null, now: number = Date.now()): WizardDraft | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const d = o as Record<string, unknown>;
  if (d.v !== WIZARD_DRAFT_VERSION || typeof d.savedAt !== "number") return null;
  if (now - d.savedAt > WIZARD_DRAFT_MAX_AGE_MS) return null;
  if (!isStr(d.name) || !isStr(d.objective) || !isStr(d.closesAt) || !isStr(d.linkedGroupId) || !isStr(d.warmupId)) {
    return null;
  }
  if (!isStr(d.format) || !FORMATS.includes(d.format)) return null;
  if (typeof d.cupsPerSample !== "number" || !Number.isInteger(d.cupsPerSample)) return null;
  if (typeof d.warmupOn !== "boolean" || typeof d.isGroup !== "boolean" || typeof d.notifyGroup !== "boolean") return null;
  if (!Array.isArray(d.coffees) || d.coffees.length === 0 || d.coffees.length > 50) return null;
  if (!Array.isArray(d.samples) || d.samples.length === 0 || d.samples.length > 100) return null;

  const coffeeKeys = [
    "id", "name", "producer", "variety", "altitude", "roastLevel", "country", "region",
    "farm", "species", "harvestYear", "processType", "notes",
  ];
  for (const c of d.coffees as Record<string, unknown>[]) {
    if (!c || typeof c !== "object") return null;
    if (!coffeeKeys.every((k) => isStr(c[k]))) return null;
    if (!Array.isArray(c.certifications) || !c.certifications.every(isStr)) return null;
    if (c.existingCoffeeId !== undefined && !isStr(c.existingCoffeeId)) return null;
  }
  const coffeeIds = new Set((d.coffees as DraftCoffee[]).map((c) => c.id));
  for (const s of d.samples as Record<string, unknown>[]) {
    if (!s || typeof s !== "object") return null;
    if (!isStr(s.id) || !isStr(s.label) || !isStr(s.coffeeId) || typeof s.auto !== "boolean") return null;
    if (!coffeeIds.has(s.coffeeId)) return null;
    for (const k of ["roastDate", "preparationNote", "offProtocolNote"]) {
      if (s[k] !== undefined && !isStr(s[k])) return null;
    }
    if (s.offProtocol !== undefined && typeof s.offProtocol !== "boolean") return null;
  }
  if (d.referenceId !== null && !isStr(d.referenceId)) return null;
  // A4: a row still on "auto" carries NO label (the letter is drawn at
  // creation). Drafts saved before that stored "Muestra A" in the label; blank
  // it so the restored row shows the "random letter" placeholder.
  return {
    ...(d as unknown as WizardDraft),
    notifyGroupWhen: d.notifyGroupWhen === "create" ? "create" : "start",
    referenceMode: d.referenceMode === "free" ? "free" : "anchor",
    samples: (d.samples as DraftSample[]).map((s) => (s.auto ? { ...s, label: "" } : s)),
  };
}

/** Minimal Storage surface so the helper is testable without a DOM. */
export type KeyValueStorage = {
  readonly length: number;
  key(i: number): string | null;
  removeItem(k: string): void;
};

/** Removes every wizard draft on this device (sign-out). */
export function clearWizardDrafts(storage: KeyValueStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(WIZARD_DRAFT_PREFIX)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
}
