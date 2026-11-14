import "server-only";

import { prisma } from "@/lib/prisma";
import { toMemberViewRows } from "@/lib/groups/memberViewRows";

// The group page's ONE query for any viewer (S10 WP5a, F-grupos-10, review H2/M2).
// It reads the member address only to decide whether a profile name is really the
// address in disguise, and returns rows that carry NO email field: the page, its
// props and its HTML never see an address. The OWNER's roster (which shows
// addresses) is a separate query in the page. Typed `select` on purpose: an
// `include` here would pull every column, address included (tests pin this).

export async function loadGroupForViewer(
  groupId: string,
  viewerId: string,
  labels: { pending: string; member: string },
) {
  const group = await prisma.tastingGroup.findFirst({
    where: {
      id: groupId,
      OR: [{ createdBy: viewerId }, { members: { some: { userId: viewerId } } }],
    },
    select: {
      id: true,
      name: true,
      description: true,
      createdBy: true,
      owner: { select: { displayName: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          email: true,
          emailOptOutAt: true,
          user: { select: { displayName: true } },
        },
      },
    },
  });
  if (!group) return null;

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdBy: group.createdBy,
    owner: group.owner,
    // No `email` key: it is dropped by the pure mapper, after the label rule used it
    // (lib/groups/memberViewRows.ts, whose key allow-list the tests assert on).
    members: toMemberViewRows(group.members, labels),
  };
}
