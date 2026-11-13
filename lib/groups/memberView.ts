import "server-only";

import { prisma } from "@/lib/prisma";
import { memberRosterForMember } from "@/lib/groupRoster";

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

  const labelById = new Map(
    memberRosterForMember(
      group.members.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        profileName: m.user?.displayName ?? null,
        emails: [m.email],
        linked: !!m.userId,
      })),
      labels,
    ).map((r) => [r.id, r.label]),
  );

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    createdBy: group.createdBy,
    owner: group.owner,
    // No `email` key: it is dropped here, after the label rule used it.
    members: group.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      emailOptOutAt: m.emailOptOutAt,
      label: labelById.get(m.id) ?? labels.pending,
    })),
  };
}
