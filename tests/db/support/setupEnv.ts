// Runs in every test worker BEFORE the test file imports lib/prisma.
// Points the app's Prisma singleton at the disposable local database, after the
// guard has verified it. Production URLs from the shell/.env are overwritten.
import { inject } from "vitest";
import { assertSafeTestDatabaseUrl } from "./guard";

const url = inject("dbUrl");
assertSafeTestDatabaseUrl(url);
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.DB_POOL_MAX = "6";
// Never let a code path under test reach hosted services.
delete process.env.RESEND_API_KEY;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.GEMINI_API_KEY;
