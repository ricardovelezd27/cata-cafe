// Anonymous cupper codes for the results CSV (S10 WP5a, D5; review fix H1).
//
// A code is derived from a KEYED hash of (session, cupper), never from a position:
// not join order, not name order, not the organiser's seat. The same person has a
// different code in every session and nothing links a code to the analytics
// "Catador XXXX" label. The keyed digest is computed in a server-only module
// (csvCodeKey.ts); this file is pure: it turns hex digests into short codes.
//
// TODO(kim-validar:D5)

// Same unambiguous alphabet as the coffee short codes (lib/coffeeCode.ts), copied
// instead of imported so this module stays dependency-free.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CSV_CODE_BASE_LENGTH = 4;
export const CSV_CODE_PREFIX = "C-";

function charsFromHex(hex: string, n: number): string {
  let out = "";
  for (let i = 0; i < n; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    out += ALPHABET[(Number.isNaN(byte) ? 0 : byte) % ALPHABET.length];
  }
  return out;
}

/** `digests`: cupper id -> keyed hex digest for THIS session. Every code is
 *  "C-" + 4 characters of its own digest; cuppers whose 4 characters collide get
 *  the next characters of their own digest (5, 6…) until unique, so only the
 *  colliding ones change length. */
export function assignCsvCodes(digests: ReadonlyMap<string, string>): Map<string, string> {
  const maxLen = Math.floor(Math.min(...[...digests.values()].map((d) => d.length), 64) / 2);
  const len = new Map<string, number>([...digests.keys()].map((id) => [id, CSV_CODE_BASE_LENGTH]));
  const code = (id: string) =>
    CSV_CODE_PREFIX + charsFromHex(digests.get(id) as string, len.get(id) as number);
  for (let guard = 0; guard < 32; guard++) {
    const byCode = new Map<string, string[]>();
    for (const id of digests.keys()) {
      const c = code(id);
      byCode.set(c, [...(byCode.get(c) ?? []), id]);
    }
    let changed = false;
    for (const ids of byCode.values()) {
      if (ids.length < 2) continue;
      for (const id of ids) {
        const cur = len.get(id) as number;
        if (cur < maxLen) {
          len.set(id, cur + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return new Map([...digests.keys()].map((id) => [id, code(id)]));
}
