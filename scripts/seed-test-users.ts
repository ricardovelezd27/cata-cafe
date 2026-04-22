import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const DEV_PASSWORD = "cata-dev-2024";

const TEST_USERS = [
  { email: "master@cata.test", displayName: "Maestro Test" },
  { email: "par1@cata.test",   displayName: "Participante Uno" },
  { email: "par2@cata.test",   displayName: "Participante Dos" },
] as const;

async function seed() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl       = process.env.DATABASE_URL;

  if (!supabaseUrl || !serviceKey || !dbUrl) {
    console.error("Missing env vars. Make sure .env.local has NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL");
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adapter = new PrismaPg({ connectionString: dbUrl });
  const prisma  = new PrismaClient({ adapter });

  const { data: { users: existing }, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    console.error("Failed to list users:", listError.message);
    process.exit(1);
  }

  const existingByEmail = new Map(existing.map((u) => [u.email, u]));

  for (const user of TEST_USERS) {
    let authId: string;

    const found = existingByEmail.get(user.email);
    if (found) {
      authId = found.id;
      console.log(`  SKIP (exists)    ${user.email}  →  ${authId}`);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: DEV_PASSWORD,
        email_confirm: true,
      });
      if (error || !data.user) {
        console.error(`  FAIL (auth)      ${user.email}: ${error?.message}`);
        continue;
      }
      authId = data.user.id;
      console.log(`  CREATED (auth)   ${user.email}  →  ${authId}`);
    }

    await prisma.profile.upsert({
      where:  { id: authId },
      create: { id: authId, displayName: user.displayName },
      update: { displayName: user.displayName },
    });
    console.log(`  UPSERT (profile) ${user.email}`);
  }

  await prisma.$disconnect();
  console.log("\nSeed complete. Dev password: cata-dev-2024");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
