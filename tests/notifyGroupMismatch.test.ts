import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// S8-22 D-09 (source scan: the action imports prisma).
describe("notifyGroupOfSession group/session match (D-09)", () => {
  const src = readFileSync("app/actions/groups.ts", "utf8");
  const body = src.slice(src.indexOf("export async function notifyGroupOfSession"));

  it("selects the session's groupId and refuses a mismatch with invalid_input", () => {
    expect(body).toContain("groupId: true }");
    const check = body.indexOf("session.groupId !== input.groupId");
    expect(check).toBeGreaterThan(-1);
    expect(body.slice(check, check + 120)).toContain('"invalid_input"');
  });

  it("checks before any mail is prepared (invite token, members)", () => {
    const check = body.indexOf("session.groupId !== input.groupId");
    expect(check).toBeLessThan(body.indexOf("resolveOrCreateSessionInvite"));
    expect(check).toBeLessThan(body.indexOf("tastingGroupMember.findMany"));
  });
});
