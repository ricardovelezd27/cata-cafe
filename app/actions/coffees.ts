import { prisma } from "@/lib/prisma";

export async function getCoffeesWithStats(userId: string) {
  return prisma.coffee.findMany({
    where: { OR: [{ isPublic: true }, { createdBy: userId }] },
    select: {
      id: true,
      name: true,
      country: true,
      region: true,
      variety: true,
      processType: true,
      _count: { select: { sessionSamples: true } },
      coffeeHistory: {
        where: { userId },
        orderBy: { tastedAt: "desc" },
        take: 1,
        select: { tastedAt: true, individualScore: true, communityScore: true },
      },
    },
    orderBy: { name: "asc" },
  });
}
