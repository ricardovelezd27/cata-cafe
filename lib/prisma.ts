// Prisma 7 client singleton with the pg driver adapter.
// The generated client lives at `app/generated/prisma` per schema.prisma,
// and only resolves AFTER `npx prisma generate` has run.
import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  // Pool size for the pg driver. Defaults to ~10; raised to handle bursts of
  // concurrent auto-saves during a live group cupping (dozens of cuppers).
  // Override per-environment with DB_POOL_MAX. When DATABASE_URL points at
  // Supabase's transaction pooler (port 6543, ?pgbouncer=true), the pooler caps
  // real Postgres connections, so a larger client pool here is safe.
  const max = Number(process.env.DB_POOL_MAX ?? 20);
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max,
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
