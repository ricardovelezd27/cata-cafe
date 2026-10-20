import { describe, expect, it } from "vitest";
import { indexAfterReconcile, reconcileSamples } from "@/lib/sampleReconcile";

// S6 CP-C4 — the cup screen merges a refreshed server sample list into its
// local state: server metadata wins, local evaluation data wins.

type S = {
  id: string;
  label: string;
  position: number;
  revealed: boolean;
  coffeeId: string | null;
  coffee: { name: string } | null;
  affective: Record<string, unknown>;
  isDraft: boolean;
};

const mk = (id: string, position: number, extra: Partial<S> = {}): S => ({
  id,
  label: `Muestra ${id.toUpperCase()}`,
  position,
  revealed: false,
  coffeeId: null,
  coffee: null,
  affective: {},
  isDraft: true,
  ...extra,
});

describe("reconcileSamples", () => {
  it("adds a sample the owner created mid-session, in position order", () => {
    const local = [mk("a", 0), mk("b", 1)];
    const server = [mk("a", 0), mk("b", 1), mk("c", 2)];
    expect(reconcileSamples(local, server, null).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("applies a rename and coffee/reveal metadata but keeps the local evaluation", () => {
    const local = [mk("a", 0, { affective: { aroma_af_final: 8 }, isDraft: true })];
    const server = [mk("a", 0, { label: "Lote 7", revealed: true, coffeeId: "cf", coffee: { name: "Geisha" }, affective: {}, isDraft: false })];
    const [a] = reconcileSamples(local, server, null);
    expect(a.label).toBe("Lote 7");
    expect(a.revealed).toBe(true);
    expect(a.coffee).toEqual({ name: "Geisha" });
    // Local wins for what the cupper is typing.
    expect(a.affective).toEqual({ aroma_af_final: 8 });
    expect(a.isDraft).toBe(true);
  });

  it("drops a sample the owner removed and re-packs by the server positions", () => {
    const local = [mk("a", 0), mk("b", 1), mk("c", 2)];
    const server = [mk("a", 0), mk("c", 1)];
    expect(reconcileSamples(local, server, null).map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("puts the (possibly new) reference first", () => {
    const local = [mk("a", 0), mk("b", 1)];
    const server = [mk("a", 0), mk("b", 1), mk("c", 2)];
    expect(reconcileSamples(local, server, "c").map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  it("does not mutate its inputs", () => {
    const local = [mk("b", 1), mk("a", 0)];
    const copy = local.map((s) => ({ ...s }));
    reconcileSamples(local, [mk("a", 0), mk("b", 1)], null);
    expect(local).toEqual(copy);
  });
});

describe("indexAfterReconcile", () => {
  const next = [{ id: "c" }, { id: "a" }, { id: "b" }];
  it("keeps the cupper on the sample they were viewing", () => {
    expect(indexAfterReconcile(next, "b", 1)).toBe(2);
  });
  it("clamps when that sample was removed", () => {
    expect(indexAfterReconcile(next, "zzz", 5)).toBe(2);
    expect(indexAfterReconcile(next, null, 1)).toBe(1);
    expect(indexAfterReconcile([], "a", 3)).toBe(0);
  });
});
