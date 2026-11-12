// Safety guard for the runtime DB suite (audit D-05).
//
// The only hosted database is PRODUCTION. Every entry point of tests/db (the
// global setup, the Prisma bootstrap, the raw pg helper) calls
// assertSafeTestDatabaseUrl() BEFORE opening any connection. It THROWS unless
// the host is exactly 127.0.0.1 or localhost AND the database name starts with
// `cata_test_`. Pure module: unit-tested in tests/testDbGuard.test.ts.

export const TEST_DB_PREFIX = "cata_test_";
const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost"]);

export function assertSafeTestDatabaseUrl(raw: string | undefined | null): URL {
  if (!raw) throw new Error("test-db guard: no connection string given");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("test-db guard: connection string is not a valid URL");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`test-db guard: protocol ${url.protocol} is not postgres`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      `test-db guard: refusing host "${url.hostname}" (only 127.0.0.1 or localhost)`,
    );
  }
  const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!db.startsWith(TEST_DB_PREFIX)) {
    throw new Error(
      `test-db guard: refusing database "${db}" (name must start with ${TEST_DB_PREFIX})`,
    );
  }
  return url;
}
