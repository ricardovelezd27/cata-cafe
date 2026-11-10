import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { writeEvaluationOrdered, type EvaluationWriteDb } from "@/lib/evaluationWrite";

// S8-18 review + S8-22 B-01: the ordering write against a hand-written fake client.

type Call = { op: string; args: Record<string, unknown> };
type Step = "ok" | "P2025" | "P2002";

function fake(script: Partial<Record<string, Step[]>>) {
  const calls: Call[] = [];
  const run = (op: string, args: Record<string, unknown>) => {
    calls.push({ op, args });
    const step = script[op]?.shift() ?? "ok";
    if (step !== "ok") throw Object.assign(new Error(step), { code: step });
    return { id: "ev1" };
  };
  const db: EvaluationWriteDb = {
    evaluation: {
      upsert: async (a: Record<string, unknown>) => run("upsert", a),
      update: async (a: Record<string, unknown>) => run("update", a),
      create: async (a: Record<string, unknown>) => run("create", a),
      findUnique: async (a: Record<string, unknown>) => run("findUnique", a),
      updateMany: async (a: Record<string, unknown>) => run("updateMany", a),
    },
    $transaction: async <T,>(fn: (tx: EvaluationWriteDb) => Promise<T>) => {
      calls.push({ op: "tx", args: {} });
      return fn(db);
    },
  };
  return { db, calls };
}

const fields = { individualScore: 80 } as never;
const base = { sessionSampleId: "s1", sessionId: "se1", cupperId: "u1", fields };
const ops = (calls: Call[]) => calls.map((c) => c.op);

describe("writeEvaluationOrdered", () => {
  it("a stale write returns applied:false and performs no data write", async () => {
    const { db, calls } = fake({ update: ["P2025", "P2025", "P2025"], create: ["P2002"] });
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r).toEqual({ id: "ev1", applied: false });
    expect(ops(calls)).not.toContain("updateMany");
    expect(ops(calls).at(-1)).toBe("findUnique");
  });

  it("first write for a new row creates it", async () => {
    const { db, calls } = fake({ update: ["P2025", "P2025"] });
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r).toEqual({ id: "ev1", applied: true });
    expect(ops(calls).at(-1)).toBe("create");
    expect(calls.at(-1)!.args.data).toMatchObject({ sessionSampleId: "s1", cupperId: "u1" });
  });

  it("an existing DRAFT row is updated in ONE statement, no transaction", async () => {
    const { db, calls } = fake({});
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r.applied).toBe(true);
    expect(ops(calls)).toEqual(["update"]);
    expect((calls[0].args.where as Record<string, unknown>).isDraft).toBe(true);
  });

  it("a SUBMITTED row is updated and re-fired in one transaction", async () => {
    const { db, calls } = fake({ update: ["P2025"] });
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r).toEqual({ id: "ev1", applied: true });
    expect(ops(calls)).toEqual(["update", "tx", "update", "updateMany"]);
    expect(calls[3].args).toEqual({ where: { id: "ev1", isDraft: false }, data: { isDraft: false } });
  });

  it("a create racing another creator falls back to the transactional update", async () => {
    const { db, calls } = fake({ update: ["P2025", "P2025", "ok"], create: ["P2002"] });
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r).toEqual({ id: "ev1", applied: true });
    expect(ops(calls).at(-1)).toBe("updateMany");
  });

  it("without clientTs it upserts inside one transaction", async () => {
    const { db, calls } = fake({});
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: undefined });
    expect(r).toEqual({ id: "ev1", applied: true });
    expect(ops(calls)).toEqual(["tx", "upsert"]);
  });
});
