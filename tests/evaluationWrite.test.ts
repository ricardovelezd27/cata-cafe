import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { writeEvaluationOrdered, type EvaluationWriteDb } from "@/lib/evaluationWrite";

// S8-18 review: the ordering write against a hand-written fake client.

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
  const db = {
    evaluation: {
      upsert: async (a: Record<string, unknown>) => run("upsert", a),
      update: async (a: Record<string, unknown>) => run("update", a),
      create: async (a: Record<string, unknown>) => run("create", a),
      findUnique: async (a: Record<string, unknown>) => run("findUnique", a),
    },
  } as unknown as EvaluationWriteDb;
  return { db, calls };
}

const fields = { individualScore: 80 } as never;
const base = { sessionSampleId: "s1", sessionId: "se1", cupperId: "u1", fields };
const ops = (calls: Call[]) => calls.map((c) => c.op);

describe("writeEvaluationOrdered", () => {
  it("a stale write returns applied:false and performs no data write", async () => {
    const { db, calls } = fake({ update: ["P2025", "P2025"], create: ["P2002"] });
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r).toEqual({ id: "ev1", applied: false });
    // every write attempt was rejected by the database; the only success is a read
    expect(ops(calls)).toEqual(["update", "create", "update", "findUnique"]);
  });

  it("first write for a new row creates it", async () => {
    const { db, calls } = fake({ update: ["P2025"] });
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r).toEqual({ id: "ev1", applied: true });
    expect(ops(calls)).toEqual(["update", "create"]);
    expect(calls[1].args.data).toMatchObject({ sessionSampleId: "s1", cupperId: "u1" });
  });

  it("a create racing another creator falls back to the conditional update", async () => {
    const { db, calls } = fake({ update: ["P2025", "ok"], create: ["P2002"] });
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r).toEqual({ id: "ev1", applied: true });
    expect(ops(calls)).toEqual(["update", "create", "update"]);
  });

  it("an existing, older row is updated in one round trip", async () => {
    const { db, calls } = fake({});
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: Date.now() - 1000 });
    expect(r.applied).toBe(true);
    expect(ops(calls)).toEqual(["update"]);
  });

  it("without clientTs it takes the legacy upsert path", async () => {
    const { db, calls } = fake({});
    const r = await writeEvaluationOrdered(db, { ...base, clientTs: undefined });
    expect(r).toEqual({ id: "ev1", applied: true });
    expect(ops(calls)).toEqual(["upsert"]);
  });
});
