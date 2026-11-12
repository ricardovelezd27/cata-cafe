// Prisma CLI config used ONLY by the DB suite's `prisma migrate deploy`.
// Differs from the root prisma.config.ts in two ways: it loads no .env files
// (so a production URL can never leak in), and its migrations folder is a temp
// copy that globalSetup patches for the allowlisted clean-database failures.
import path from "node:path";
import { defineConfig } from "prisma/config";
import { assertSafeTestDatabaseUrl } from "./guard";

const url = process.env.CATA_TEST_DATABASE_URL;
assertSafeTestDatabaseUrl(url);

export default defineConfig({
  schema: path.resolve(__dirname, "..", "..", "..", "prisma", "schema.prisma"),
  migrations: { path: process.env.CATA_TEST_MIGRATIONS_DIR! },
  datasource: { url: url! },
});
