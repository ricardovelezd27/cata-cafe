// The name of a recorded voice line: a short hash of its TEXT. Pure, and the
// same in the browser and in the render scripts (scripts/warmup-voice/).
//
// A file is named after what it says, so a copy edit gives a new file name
// (the old file is simply no longer referenced) and a URL never changes what
// it plays: the files can be cached for good.

/** Whitespace and Unicode form never change the key. */
export function normalizeLine(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function fnv1a(text: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 16 hex characters (two independent 32-bit FNV-1a hashes). With a few
 *  hundred lines a collision is out of reach; tests/warmup-voice.test.ts
 *  checks there is none anyway. */
export function lineKey(text: string): string {
  const t = normalizeLine(text);
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return hex(fnv1a(t, 0x811c9dc5)) + hex(fnv1a(t, 0x2f0b4a61));
}
