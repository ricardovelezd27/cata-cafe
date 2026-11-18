// Per-test time limits for the tests that are slow by nature (L1, L3).
//
// vitest's own limit (5 s) stays the default for every other test, on purpose:
// a light test that hangs must still fail fast. These two constants are given
// test by test, as the third argument of `it(...)`, only to a test whose work is
// large by design. Never raise the global `testTimeout` instead.
//
// Why the numbers are high: a full `npm test` runs every worker at once, and
// while other sessions run dev servers, captures or builds on the same machine a
// heavy test runs 5 to 10 times slower than alone. A limit is there to catch a
// hang, not to measure speed, so it is set well above the slowest run seen.

/** A test that walks and reads the source tree (L1). Alone 0.5 to 4 s; a full run slows file reads about tenfold. */
export const SCAN_TIMEOUT_MS = 30_000;

/**
 * A test that renders every scenario or fixture, loops over thousands of seeded
 * cases, sweeps every day of two years in many zones, or drives a real browser
 * (L3). Measured: the `endOfDayInZone` sweep takes about 17 s alone and took up
 * to 88 s on a loaded machine; the two Chrome-driven capture tests take 5 to 11 s
 * alone and up to 105 s beside a `next build` and three other suite runs; the
 * scenario renders take 0.2 to 3 s alone and up to 15 s loaded.
 */
export const HEAVY_TEST_TIMEOUT_MS = 180_000;
