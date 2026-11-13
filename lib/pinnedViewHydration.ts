// S10 WP5b review round 3 (H2 of the re-review): the "pinned view" mark must survive a
// page reload. A module the cup page produced while the sample was the pinned
// reference holds the pinned 5s; the server rule (resolvePinnedPayload) only protects
// the ratings it restored if the write says so (`pinnedView`). Two reload paths used to
// drop the mark: the localStorage flush backup and the IndexedDB hydration at mount.
// Pure rules, used by CupClient (call sites named in the PR report):
//   - backupEntryFor        -> flushToLocal (what a backup entry carries)
//   - hydrateModule         -> what hydration does with ONE module flagged pinnedView
//   - planHydration         -> the mount rehydration: IndexedDB modules, then backup entries
//                              (newest-or-equal wins, as before), each through hydrateModule
// No server-side "looks like the anchor" heuristic: a cupper may legitimately rate all 5s.

import { adoptServerPinKeys } from "@/lib/referenceRules";

type Data = Record<string, unknown>;

export type BackupEntry = {
  sampleId: string;
  label: string;
  key: string;
  data: Data;
  ts: number;
  /** The data was produced while the sample was the pinned reference. */
  pinnedView?: boolean;
};

/** A backup entry carries the pinned-view flag (only when true, so older entries keep their shape). */
export function backupEntryFor(
  base: { sampleId: string; label: string; key: string; data: Data },
  ts: number,
  pinnedView: boolean,
): BackupEntry {
  return { ...base, ts, ...(pinnedView ? { pinnedView: true } : {}) };
}

/** One stored module flagged `pinnedView`:
 *   - sample still the pinned reference: keep it, keep the flag (the server pins it anyway);
 *   - NOT pinned any more: the pin-overwritten keys take the SERVER props' values (the
 *     server restored the ratings), local descriptive edits stay, the flag is dropped and
 *     the caller rewrites the offline module (`adopted`).
 *  An unflagged module is returned untouched. */
export function hydrateModule(input: {
  data: Data;
  pinnedView?: boolean;
  stillPinned: boolean;
  server?: Data | null;
}): { data: Data; pinnedView: boolean; adopted: boolean } {
  if (!input.pinnedView) return { data: input.data, pinnedView: false, adopted: false };
  if (input.stillPinned) return { data: input.data, pinnedView: true, adopted: false };
  return { data: adoptServerPinKeys(input.data, input.server), pinnedView: false, adopted: true };
}

export type HydrationBlob = {
  samples: Record<
    string,
    {
      label: string;
      modules: Record<string, { data: Data; updatedAt: number; pinnedView?: boolean; hydrates: boolean } | undefined>;
    }
  >;
};

export type PlannedModule = {
  sampleId: string;
  label: string;
  key: string;
  data: Data;
  /** Mark the data object and the sample as "pinned view" in the page. */
  pinnedView: boolean;
  /** Pin keys were replaced with the server's: rewrite the offline module. */
  adopted: boolean;
  fromBackup: boolean;
};

export function planHydration(input: {
  blob: HydrationBlob | null;
  backup: readonly BackupEntry[];
  isModuleKey: (key: string) => boolean;
  stillPinned: (sampleId: string) => boolean;
  serverModule: (sampleId: string, key: string) => Data | null;
}): Map<string, PlannedModule> {
  const out = new Map<string, PlannedModule>();
  const put = (
    sampleId: string,
    label: string,
    key: string,
    data: Data,
    flagged: boolean | undefined,
    fromBackup: boolean,
  ) => {
    const r = hydrateModule({
      data,
      pinnedView: flagged,
      stillPinned: input.stillPinned(sampleId),
      server: input.serverModule(sampleId, key),
    });
    out.set(`${sampleId}|${key}`, {
      sampleId,
      label,
      key,
      data: r.data,
      pinnedView: r.pinnedView,
      adopted: r.adopted,
      fromBackup,
    });
  };
  for (const [sampleId, sample] of Object.entries(input.blob?.samples ?? {})) {
    for (const [key, mod] of Object.entries(sample.modules)) {
      if (!mod || !mod.hydrates || !input.isModuleKey(key)) continue;
      put(sampleId, sample.label, key, mod.data, mod.pinnedView, false);
    }
  }
  for (const entry of input.backup) {
    if (!input.isModuleKey(entry.key)) continue;
    // A crash can leave a backup behind: never let it regress a newer IndexedDB write.
    const mod = input.blob?.samples[entry.sampleId]?.modules[entry.key];
    if (mod && mod.updatedAt > entry.ts) continue;
    put(entry.sampleId, entry.label, entry.key, entry.data, entry.pinnedView, true);
  }
  return out;
}
