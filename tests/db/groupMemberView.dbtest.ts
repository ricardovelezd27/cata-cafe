// S10 WP6 B6: the real loader behind the group page, against Postgres. Whatever the
// query selects, the member rows it RETURNS carry only the allow-listed keys and no address.
import { beforeEach, describe, expect, it } from "vitest";
import { loadGroupForViewer } from "@/lib/groups/memberView";
import { MEMBER_VIEW_KEYS } from "@/lib/groups/memberViewRows";
import { makeUser, prisma, resetDb } from "./support/db";

beforeEach(resetDb);

describe("loadGroupForViewer (member view)", () => {
  it("returns member rows with exactly the allow-listed keys and no address anywhere", async () => {
    const owner = await makeUser({ name: "Dueña" });
    const linked = await makeUser({ name: "Luis Mora", email: "luis.mora@secreto.example" });
    const group = await prisma.tastingGroup.create({
      data: {
        name: "Grupo",
        createdBy: owner,
        members: {
          create: [
            { email: "luis.mora@secreto.example", userId: linked },
            { email: "pendiente@secreto.example", displayName: "Pendiente" },
            { email: "sinnombre@secreto.example" },
          ],
        },
      },
    });
    const view = await loadGroupForViewer(group.id, linked, { pending: "Invitación pendiente", member: "Miembro" });
    expect(view).not.toBeNull();
    expect(view!.members).toHaveLength(3);
    for (const m of view!.members) expect(Object.keys(m).sort()).toEqual([...MEMBER_VIEW_KEYS]);
    const json = JSON.stringify(view).toLowerCase();
    expect(json).not.toContain("@");
    expect(json).not.toContain("secreto");
    expect(json).not.toContain("sinnombre");
    // a viewer who is not in the group gets nothing
    const stranger = await makeUser({ name: "Otra" });
    expect(await loadGroupForViewer(group.id, stranger, { pending: "p", member: "m" })).toBeNull();
  });
});
