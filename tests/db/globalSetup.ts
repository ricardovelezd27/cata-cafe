// Global setup of the runtime DB suite (audit D-05).
//
// Starts a throwaway Postgres (embedded-postgres, real binaries) in a temp
// directory on a free 127.0.0.1 port, creates `cata_test_<random>`, then:
//   1. runs tests/db/support/shim.sql (Supabase shim),
//   2. `prisma migrate deploy` (env passed to the child only),
//   3. prisma/sql/rls_and_triggers.sql statement by statement, tolerating
//      ONLY the entries of KNOWN_SQL_FAILURES (and recording every failure),
// exports the URL via vitest `provide`, and deletes everything on teardown.
//
// It never reads .env.local / DATABASE_URL: the connection string is built
// here, and assertSafeTestDatabaseUrl() runs before every connection.

import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import type { TestProject } from "vitest/node";
import { assertSafeTestDatabaseUrl } from "./support/guard";
import { splitSql } from "./support/sqlSplit";
import { KNOWN_SQL_FAILURES, MIGRATION_PATCHES } from "./support/knownSqlFailures";

const ROOT = path.resolve(__dirname, "..", "..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** Last-resort cleanup: the Windows build leaves PG18 io workers behind when a run is cut short. */
function killTree(pid: number | undefined) {
  if (!pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

function postmasterPid(dir: string): number | undefined {
  try {
    return Number(fs.readFileSync(path.join(dir, "postmaster.pid"), "utf8").split(/\r?\n/)[0]) || undefined;
  } catch {
    return undefined;
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    dbUrl: string;
    sqlFailures: string[];
  }
}

export default async function setup(project: TestProject) {
  const t0 = Date.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cata-test-pg-"));
  const port = await freePort();
  const password = randomBytes(12).toString("hex");
  const dbName = `cata_test_${randomBytes(4).toString("hex")}`;
  const adminUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/postgres`;
  const dbUrl = `postgresql://postgres:${password}@127.0.0.1:${port}/${dbName}`;

  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password,
    port,
    persistent: false,
    // Windows initdb defaults to WIN1252, which cannot hold the migrations' arrows.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // PG18's default io_method=worker leaves orphaned io-worker processes behind on Windows after
    // a stop; sync I/O needs none (irrelevant for a throwaway test database).
    postgresFlags: ["-c", "io_method=sync"],
    onLog: () => {},
    onError: () => {},
  });

  let started = false;
  let pmPid: number | undefined;
  // postgres removes postmaster.pid on a clean stop; if it is still there, something is left over.
  const killIfStillRunning = () => {
    if (fs.existsSync(path.join(dir, "postmaster.pid"))) killTree(pmPid);
  };
  const teardown = async () => {
    console.log("[db-suite] teardown start");
    if (started) {
      try {
        await pg.stop();
      } catch {
        /* the Windows checkpointer exits non-zero on stop; harmless */
      }
    }
    killIfStillRunning();
    fs.rmSync(dir, { recursive: true, force: true });
    console.log("[db-suite] teardown done");
  };

  try {
    await pg.initialise();
    await pg.start();
    started = true;
    pmPid = postmasterPid(dir);
    process.once("exit", () => {
      killIfStillRunning();
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    });

    // Create the cata_test_ database (admin URL targets the 'postgres' db of
    // OUR instance; the guard still refuses anything non-local).
    const admin = new Client({ connectionString: (assertAdmin(adminUrl), adminUrl) });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    // Supabase runs in UTC; Windows initdb picks the machine zone, which would skew now()-based timestamp(3) columns.
    await admin.query(`ALTER DATABASE ${dbName} SET timezone TO 'UTC'`);
    await admin.end();

    assertSafeTestDatabaseUrl(dbUrl);
    const db = new Client({ connectionString: dbUrl });
    await db.connect();

    await db.query(fs.readFileSync(path.join(__dirname, "support", "shim.sql"), "utf8"));

    // prisma migrate deploy against the local URL only, from a TEMP COPY of the
    // migrations folder with the allowlisted patches applied.
    const migDir = path.join(dir, "migrations-copy");
    fs.cpSync(path.join(ROOT, "prisma", "migrations"), migDir, { recursive: true });
    for (const p of MIGRATION_PATCHES) {
      const f = path.join(migDir, p.dir, "migration.sql");
      const src = fs.readFileSync(f, "utf8");
      if (!src.includes(p.from)) throw new Error(`migration patch no longer applies: ${p.dir}`);
      fs.writeFileSync(f, src.replace(p.from, p.to));
    }
    const env = {
      ...process.env,
      CATA_TEST_DATABASE_URL: dbUrl,
      CATA_TEST_MIGRATIONS_DIR: migDir,
      DATABASE_URL: dbUrl,
      DIRECT_URL: dbUrl,
    };
    const migrate = spawnSync(
      "npx",
      ["prisma", "migrate", "deploy", "--config", "tests/db/support/prisma.test.config.ts"],
      { cwd: ROOT, env, encoding: "utf8", shell: true },
    );
    if (migrate.status !== 0) {
      throw new Error(`prisma migrate deploy failed:
${migrate.stdout}
${migrate.stderr}`);
    }

    const stmts = splitSql(
      fs.readFileSync(path.join(ROOT, "prisma", "sql", "rls_and_triggers.sql"), "utf8"),
    );
    const failures: string[] = [];
    const knownHits: number[] = KNOWN_SQL_FAILURES.map(() => 0);
    for (const s of stmts) {
      try {
        await db.query(s);
      } catch (e) {
        const msg = (e as Error).message;
        const head = s.replace(/\s+/g, " ").slice(0, 160);
        failures.push(`${head}  =>  ${msg}`);
        let known = false;
        KNOWN_SQL_FAILURES.forEach((k, i) => {
          if (k.match.test(s) && k.error.test(msg)) {
            knownHits[i]++;
            known = true;
          }
        });
        if (!known) {
          throw new Error(`UNEXPECTED failure applying rls_and_triggers.sql:\n${head}\n${msg}`);
        }
      }
    }
    await db.end();

    // The tolerated list must be EXACTLY the known one: each known entry must
    // have failed exactly once and nothing else may have failed. A known
    // statement that starts working, or a second failure, stops the suite here
    // (tests/db/harness.dbtest.ts asserts the same from inside the run).
    const wrongHits = KNOWN_SQL_FAILURES.map((k, i) => `${k.why.slice(0, 60)}... -> ${knownHits[i]} hit(s)`).filter((_, i) => knownHits[i] !== 1);
    if (wrongHits.length > 0 || failures.length !== KNOWN_SQL_FAILURES.length) {
      throw new Error(
        "rls_and_triggers.sql: the tolerated failures are not exactly the known list. " +
          `expected ${KNOWN_SQL_FAILURES.length}, got ${failures.length}. ` +
          `entries not hit exactly once: ${wrongHits.join("; ") || "none"}. failures: ${failures.join(" || ")}`,
      );
    }

    project.provide("dbUrl", dbUrl);
    project.provide("sqlFailures", failures);
    console.log(
      `[db-suite] postgres up on 127.0.0.1:${port}/${dbName} in ${Date.now() - t0} ms; ` +
        `${stmts.length} SQL statements, ${failures.length} tolerated failures`,
    );
  } catch (e) {
    console.error("[db-suite] setup failed:", e);
    await teardown();
    throw e;
  }

  return teardown;
}

function assertAdmin(url: string) {
  // Same rules as the test database except the db name is the instance's own
  // `postgres` maintenance DB; host must still be loopback.
  const u = new URL(url);
  if (u.hostname !== "127.0.0.1") throw new Error("test-db guard: admin host must be 127.0.0.1");
}
