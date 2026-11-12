import path from "path";
import { defineConfig } from "vitest/config";

// Runtime DB suite (audit D-05). Runs against a disposable LOCAL Postgres that
// tests/db/globalSetup.ts starts itself. Never part of plain `npm test`.
export default defineConfig({
  test: {
    include: ["tests/db/**/*.dbtest.ts"],
    environment: "node",
    globalSetup: ["tests/db/globalSetup.ts"],
    setupFiles: ["tests/db/support/setupEnv.ts"],
    fileParallelism: false,
    pool: "forks",
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // tests/db/node_modules carries its own pg (an embedded-postgres dependency);
      // the suite must talk through the APP's pg, from the root install.
      pg: path.resolve(__dirname, "node_modules/pg"),
      // Vite resolves bare imports from the project root, so the suite-only
      // dependency (tests/db/package.json) is pointed at its own install.
      "embedded-postgres": path.resolve(__dirname, "tests/db/node_modules/embedded-postgres"),
      "server-only": path.resolve(__dirname, "tests/db/support/serverOnlyStub.ts"),
    },
  },
});
