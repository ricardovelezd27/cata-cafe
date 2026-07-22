// Prisma 7 client singleton with the pg driver adapter.
// The generated client lives at `app/generated/prisma` per schema.prisma,
// and only resolves AFTER `npx prisma generate` has run.
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  // Pool size for the pg driver. Vercel serverless can hold many warm
  // instances at once; a pool of 20 per instance risks exhausting the
  // Supabase pgbouncer pooler's connection ceiling. 8 is safe for ~50
  // concurrent cuppers' short-lived autosave writes. Raise via DB_POOL_MAX
  // only once you've confirmed the pooler has headroom for it.
  const max = Number(process.env.DB_POOL_MAX ?? 8);
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max,
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
