// Entry of `npm run test:db`: installs the suite's own dependencies
// (tests/db/package.json, separate lockfile) when missing or outdated, then
// runs vitest with the DB config. vitest, prisma and the app's `pg` come from
// the root install.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const lock = path.join(here, "package-lock.json");
const installed = path.join(here, "node_modules", ".package-lock.json");

const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);
const needsInstall =
  !fs.existsSync(path.join(here, "node_modules", "embedded-postgres")) ||
  mtime(installed) < mtime(lock) ||
  mtime(installed) < mtime(path.join(here, "package.json"));

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
if (needsInstall) {
  console.log("[test:db] installing tests/db dependencies (npm ci)...");
  const r = spawnSync(npm, ["--prefix", here, "ci", "--no-audit", "--no-fund"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
const r = spawnSync(process.execPath, [vitest, "run", "--config", "vitest.db.config.ts", ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exit(r.status ?? 1);
