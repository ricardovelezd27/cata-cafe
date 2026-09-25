// One-off, READ-ONLY export of registered account emails to a CSV file.
//
//   npx tsx scripts/export-emails.ts [output.csv]
//
// - Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
//   (whichever project that file points at — check before running against prod).
// - Lists auth users with the admin API, following GoTrue's `nextPage`
//   (never "stop when a page is short" — GoTrue clamps per_page, see
//   lib/supabase/adminUsers.ts; that module is `server-only`, so the loop is
//   repeated here instead of imported).
// - Keeps only registered accounts: is_anonymous = false AND an email present.
//   Anonymous QR guests are skipped.
// - Writes `email,created_at` sorted by created_at. The default output path is
//   OUTSIDE the repository (the user's temp dir) — this is PII, never commit it.
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_PAGES = 50;
const PER_PAGE = 1000;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing env vars. .env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows: { email: string; createdAt: string }[] = [];
  let anonymous = 0;
  let noEmail = 0;
  let page = 1;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error(`listUsers page ${page} failed: ${error.message}`);
      process.exit(1);
    }
    for (const u of data.users) {
      if (u.is_anonymous === true) {
        anonymous++;
        continue;
      }
      if (!u.email) {
        noEmail++;
        continue;
      }
      rows.push({ email: u.email.toLowerCase(), createdAt: u.created_at ?? "" });
    }
    if (!data.nextPage) break;
    page = data.nextPage;
  }

  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const csv = ["email,created_at", ...rows.map((r) => `${csvCell(r.email)},${csvCell(r.createdAt)}`)]
    .join("\n")
    .concat("\n");

  const out =
    process.argv[2] ?? join(tmpdir(), `cata-emails-${new Date().toISOString().slice(0, 10)}.csv`);
  writeFileSync(out, csv, "utf8");

  console.log(`Project: ${new URL(url).host}`);
  console.log(`Registered accounts exported: ${rows.length}`);
  console.log(`Skipped — anonymous guests: ${anonymous}, no email: ${noEmail}`);
  console.log(`Written to: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
