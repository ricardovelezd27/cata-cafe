import { describe, expect, it } from "vitest";
import { memberRosterForMember } from "@/lib/groupRoster";

const PENDING = "Invitación pendiente";

// The source rows deliberately carry addresses the mapper must never forward,
// to prove the output cannot contain them even if a caller leaks one in.
const members = [
  { id: "m1", displayName: "Ana Ríos", email: "ana.rios@secreto.example" },
  { id: "m2", displayName: null, profileName: "Luis Mora", email: "luis@secreto.example" },
  { id: "m3", displayName: "  ", profileName: null, email: "zzq@secreto.example" },
  { id: "m4", email: "otro@secreto.example" },
];

describe("memberRosterForMember (F-grupos-10)", () => {
  const rows = memberRosterForMember(members, PENDING);

  it("shows the name, else the account name, else 'Invitación pendiente'", () => {
    expect(rows.map((r) => r.label)).toEqual(["Ana Ríos", "Luis Mora", PENDING, PENDING]);
  });

  it("a member's payload carries no email field and no substring of any address", () => {
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["id", "label"]);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("@");
    expect(json).not.toContain("secreto");
    expect(json).not.toContain("***");
    for (const m of members) {
      const local = m.email.split("@")[0];
      expect(json).not.toContain(local);
      expect(json).not.toContain(local.slice(0, 1) + "***");
    }
  });

  it("a pending member shows no initial or masked address", () => {
    const pending = rows.filter((r) => r.label === PENDING);
    expect(pending).toHaveLength(2);
    for (const r of pending) expect(r.label).toBe(PENDING);
  });
});

// The page runs ONE query for any viewer and a second one only for the owner.
// This pins that the shared query never selects the address column.
describe("group page query (F-grupos-10)", () => {
  it("the shared query leaves the email column out; only the owner roster reads it", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/[locale]/app/groups/[id]/page.tsx", "utf8");
    const start = src.indexOf("prisma.tastingGroup.findFirst");
    const end = src.indexOf("if (!group) notFound();");
    expect(start).toBeGreaterThan(0);
    const shared = src.slice(start, end);
    expect(shared).not.toMatch(/email\s*:\s*true/);
    expect(shared).toContain("select: {");
    expect(src).toMatch(/isOwner\s*\?\s*await prisma\.tastingGroupMember\.findMany/);
  });
});
