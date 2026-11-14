import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikeAddress, memberRosterForMember } from "@/lib/groupRoster";
import { MEMBER_VIEW_KEYS, toMemberViewRows } from "@/lib/groups/memberViewRows";

const L = { pending: "Invitación pendiente", member: "Miembro" };

// The source rows deliberately carry addresses the mapper must never forward,
// to prove the output cannot contain them even if a caller leaks one in.
const members = [
  { id: "m1", displayName: "Ana Ríos", emails: ["ana.rios@secreto.example"], linked: true },
  // profile name defaults to the local part of the address (review H2)
  { id: "m2", displayName: null, profileName: "ricardo.velez88", emails: ["ricardo.velez88@secreto.example"], linked: true },
  // same local part in another case
  { id: "m3", displayName: null, profileName: "  Ricardo.Velez88 ", emails: ["ricardo.velez88@secreto.example"], linked: true },
  // the whole address as a name
  { id: "m4", displayName: null, profileName: "otro@secreto.example", emails: ["otro@secreto.example"], linked: true },
  // a real profile name
  { id: "m5", displayName: null, profileName: "Luis Mora", emails: ["luis@secreto.example"], linked: true },
  // never signed in, no name
  { id: "m6", displayName: "  ", profileName: null, emails: ["zzq@secreto.example"], linked: false },
  // the owner typed the address as the name
  { id: "m7", displayName: "pablo@secreto.example", emails: ["pablo@secreto.example"], linked: false },
];

describe("memberRosterForMember (F-grupos-10, review H2)", () => {
  const rows = memberRosterForMember(members, L);

  it("name, else a profile name that is not the address, else Miembro (linked) / Invitación pendiente", () => {
    expect(rows.map((r) => r.label)).toEqual([
      "Ana Ríos",
      "Miembro",
      "Miembro",
      "Miembro",
      "Luis Mora",
      L.pending,
      L.pending,
    ]);
  });

  it("a member's payload carries no email field and no substring or local part of any address", () => {
    for (const r of rows) expect(Object.keys(r).sort()).toEqual(["id", "label"]);
    const json = JSON.stringify(rows).toLowerCase();
    expect(json).not.toContain("@");
    expect(json).not.toContain("secreto");
    expect(json).not.toContain("***");
    expect(json).not.toContain("ricardo");
    expect(json).not.toContain("velez88");
    for (const m of members) {
      for (const e of m.emails) {
        const local = e.split("@")[0].toLowerCase();
        if (local !== "ana.rios" && local !== "luis") expect(json).not.toContain(local);
      }
    }
  });
});

describe("looksLikeAddress", () => {
  const emails = ["Ricardo.Velez88@Example.com"];
  it("matches the local part (any case), the full address and anything with @", () => {
    expect(looksLikeAddress("ricardo.velez88", emails)).toBe(true);
    expect(looksLikeAddress(" RICARDO.VELEZ88 ", emails)).toBe(true);
    expect(looksLikeAddress("ricardo.velez88@example.com", emails)).toBe(true);
    expect(looksLikeAddress("alguien@otro.com", emails)).toBe(true);
  });
  it("does not match a real name or an empty name", () => {
    expect(looksLikeAddress("Ricardo Vélez", emails)).toBe(false);
    expect(looksLikeAddress("", emails)).toBe(false);
    expect(looksLikeAddress("Ana", [])).toBe(false);
  });
});

// S10 WP6 B6: the guard is on the RETURNED OBJECTS (a typed allow-list), not on the source text.
// Rows are poisoned with an address, a whole profile and extra columns: whatever way the
// mapper let one through (a spread of the row, `user: true`, a renamed key) fails here.
describe("toMemberViewRows returns only the allow-listed keys", () => {
  const poisoned = [
    {
      id: "m1",
      userId: "u1",
      displayName: "Ana Ríos",
      email: "ana.rios@secreto.example",
      emailOptOutAt: null,
      user: { displayName: "Ana", email: "ana.rios@secreto.example", id: "u1" },
      groupId: "g1",
      extra: "x",
    },
    {
      id: "m2",
      userId: null,
      displayName: null,
      email: "zzq@secreto.example",
      emailOptOutAt: new Date("2026-11-01T00:00:00Z"),
      user: null,
    },
  ];
  const rows = toMemberViewRows(poisoned, L);

  it("every row has exactly MEMBER_VIEW_KEYS, in any order", () => {
    for (const r of rows) expect(Object.keys(r).sort()).toEqual([...MEMBER_VIEW_KEYS]);
  });
  it("no address, local part or profile object survives anywhere in the output", () => {
    const json = JSON.stringify(rows).toLowerCase();
    expect(json).not.toContain("@");
    expect(json).not.toContain("secreto");
    expect(json).not.toContain("zzq");
    expect(json).not.toContain("groupid");
    expect(json).not.toContain('"user"');
  });
  it("keeps what the page needs", () => {
    expect(rows.map((r) => [r.id, r.userId, r.label])).toEqual([
      ["m1", "u1", "Ana Ríos"],
      ["m2", null, L.pending],
    ]);
    expect(rows[1].emailOptOutAt).toEqual(new Date("2026-11-01T00:00:00Z"));
  });
});

// M2: the member-view query lives in a server-only loader with a typed `select`.
describe("group member-view loader (F-grupos-10, review M2)", () => {
  const loader = readFileSync("lib/groups/memberView.ts", "utf8");
  const page = readFileSync("app/[locale]/app/groups/[id]/page.tsx", "utf8");

  it("the members block uses select, never include", () => {
    const start = loader.indexOf("members: {");
    expect(start).toBeGreaterThan(0);
    const block = loader.slice(start, loader.indexOf("owner:", start) > start ? loader.length : loader.length);
    const members = block.slice(0, block.indexOf("});"));
    expect(members).toContain("select: {");
    expect(members).not.toMatch(/include\s*:/);
    expect(loader).not.toMatch(/include\s*:/);
  });

  it("the loader returns rows without an email key, and the page never selects one", () => {
    const ret = loader.slice(loader.indexOf("return {\n    id: group.id"));
    expect(ret).not.toMatch(/\bemail\s*:/);
    // the page reads members only through the loader; its own owner roster is the one email query
    expect(page).toContain("loadGroupForViewer(");
    expect(page).not.toMatch(/email\s*:\s*true/);
    expect(page).toMatch(/isOwner\s*\?\s*await prisma\.tastingGroupMember\.findMany/);
  });
});
