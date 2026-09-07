// Short human-shareable coffee codes — the external identifier roasters quote
// to each other ("prueba mi café, es el K7M-3FP"), layered over the internal
// cuid. Client-safe on purpose: CoffeePicker and CoffeesTable format and
// normalize codes in the browser, so this module must import nothing.

// 31 unambiguous chars: A-Z and 2-9, minus the lookalikes I, L, O, 0, 1.
// 31^6 ≈ 887M combinations — collisions are negligible at this scale but the
// unique constraint + withCodeRetry below handle them anyway.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const COFFEE_CODE_LENGTH = 6;

/**
 * Random 6-char code via Web Crypto (available in Node 18+ and browsers, so
 * no node:crypto import that would break client bundling). The tiny modulo
 * bias of 31 over 256 (~0.4%) is irrelevant for uniqueness codes.
 */
export function generateCoffeeCode(): string {
  const bytes = new Uint8Array(COFFEE_CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < COFFEE_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

/** Canonical storage is bare ("K7M3FP"); display adds a hyphen ("K7M-3FP"). */
export function formatCoffeeCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return code.length === COFFEE_CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/**
 * Uppercases and strips separators so "k7m-3fp", "K7M 3FP" and "K7M3FP" all
 * normalize to the stored form. Returns "" for queries with no alphanumerics.
 */
export function normalizeCoffeeCodeQuery(query: string): string {
  return query.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * True when `err` is Prisma's unique-constraint violation (P2002) on the
 * coffee `code` column. Duck-typed so this module stays free of Prisma
 * imports. A P2002 on a different column is NOT a code collision.
 */
export function isCoffeeCodeCollision(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } } | null;
  if (e?.code !== "P2002") return false;
  const target = e?.meta?.target;
  return Array.isArray(target)
    ? target.includes("code")
    : String(target ?? "").includes("code");
}

/**
 * N codes, unique within the batch — for array-form $transaction creates
 * where two rows colliding with EACH OTHER would P2002 pointlessly.
 */
export function generateUniqueCoffeeCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateCoffeeCode());
  return [...codes];
}

/**
 * Runs a coffee create, retrying with a fresh code on a code collision. Any
 * other error rethrows immediately.
 *
 * ONLY for creates that run as their own implicit transaction (createCoffee,
 * duplicateCoffee, updateSampleMetadata's implicit create, the backfill).
 * Do NOT use inside an interactive `$transaction` on Postgres: the first
 * P2002 aborts the surrounding transaction (25P02 on every later statement),
 * so the retry can never succeed there — retry the whole transaction with
 * fresh codes instead (see resolveCoffees in app/actions/sessions.ts).
 */
export async function withCodeRetry<T>(
  create: (code: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateCoffeeCode();
    try {
      return await create(code);
    } catch (err) {
      if (!isCoffeeCodeCollision(err)) throw err;
      lastError = err;
    }
  }
  throw lastError;
}
