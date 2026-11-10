// Per-key promise chain (S8-09). Dependency-free so it can be unit-tested;
// lib/offline/store.ts runs every read-modify-write on a session blob through
// it, so two operations on the same storage key can never interleave. The
// chain never rejects; a failing task rejects only its own returned promise.

export function createKeyedQueue() {
  const chains = new Map<string, Promise<void>>();
  return function serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = chains.get(key) ?? Promise.resolve();
    const run = prev.then(fn);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    chains.set(key, tail);
    void tail.then(() => {
      if (chains.get(key) === tail) chains.delete(key);
    });
    return run;
  };
}
