import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Guard for "closed / expired = read-only" (S8-01, F-sesiones-2).
//
// Every server-action export that authorizes against a session or a sample
// (requireSession* / requireSample*) must either call assertSessionWritable()
// (or isSessionClosed(), for actions that return a code instead of throwing)
// or be on the allowlist below WITH a reason. Adding a mutation that forgets
// the closed guard fails this test, naming the file and the export.

const ACTIONS_DIR = path.join(process.cwd(), "app", "actions");

const AUTHZ = /\brequire(SessionOwner|SessionMember|SampleOwner|SampleMember)\b/;
const GUARD = /\b(assertSessionWritable|isSessionClosed|isSessionExpired)\s*\(/;

/** `file#export` -> why it may skip the closed guard. */
const ALLOWLIST: Record<string, string> = {
  // Reads
  "sessions.ts#getDeleteImpact": "read-only impact summary",
  "sessions.ts#getWaitingState": "read-only polling fallback",
  "sessions.ts#checkSessionStarted": "read-only polling fallback",
  // Allowed on closed sessions by design
  "sessions.ts#deleteSession": "owner may delete a closed session; history is detached",
  "sessions.ts#duplicateSession": "a closed session is a valid template",
  // Idempotent lifecycle transitions
  "community.ts#closeSession": "closing is idempotent (closeSessionInternal)",
  "community.ts#resendCloseEmails": "retries the ledger of a session that is already closed",
  "community.ts#startSession": "idempotent updateMany guarded by status/startedAt",
  // Replay answers "discarded" instead of throwing (see offline.ts)
  "offline.ts#syncEvaluation": "returns { status: 'discarded' } so the retry budget is not burned",
  // Owner actions on results that stay open after close until S8-12 decides
  "community.ts#setParticipantExclusion": "S8-12 decides whether exclusion after close stays",
  "community.ts#refreshAggregateScores": "S8-12 decides; recompute is idempotent",
};

function exportsOf(source: string): { name: string; body: string }[] {
  const re = /^export async function (\w+)\s*\(/gm;
  const starts: { name: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) starts.push({ name: m[1], index: m.index });
  return starts.map((s, i) => ({
    name: s.name,
    body: source.slice(s.index, i + 1 < starts.length ? starts[i + 1].index : source.length),
  }));
}

describe("server actions: closed / expired sessions are read-only", () => {
  const files = fs.readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"));

  it("finds the action files", () => {
    expect(files).toContain("sessions.ts");
    expect(files).toContain("community.ts");
  });

  it("every session-scoped export calls the closed guard or is allowlisted", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
      if (!/^["']use server["']/m.test(source)) continue;
      for (const { name, body } of exportsOf(source)) {
        if (!AUTHZ.test(body)) continue;
        if (GUARD.test(body)) continue;
        if (ALLOWLIST[`${file}#${name}`]) continue;
        offenders.push(`${file}#${name}`);
      }
    }
    expect(
      offenders,
      `These exports authorize against a session but never call assertSessionWritable(): ${offenders.join(", ")}. ` +
        `Call it right after the require* check, or add the export to ALLOWLIST with a reason.`,
    ).toEqual([]);
  });

  it("allowlist entries still exist (no stale excuses)", () => {
    const present = new Set<string>();
    for (const file of files) {
      const source = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
      for (const { name } of exportsOf(source)) present.add(`${file}#${name}`);
    }
    const stale = Object.keys(ALLOWLIST).filter((k) => !present.has(k));
    expect(stale).toEqual([]);
  });

  it("the dead unguarded submit actions are gone", () => {
    for (const file of files) {
      const source = fs.readFileSync(path.join(ACTIONS_DIR, file), "utf8");
      expect(source).not.toMatch(/export async function (submitSampleEvaluation|submitEvaluation)\b/);
    }
  });
});
