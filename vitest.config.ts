import path from "path";
import { defineConfig } from "vitest/config";

// Unit tests only (pure libs: scoring, validation, session state, action error
// mapping). No DB, no Next runtime — anything that imports lib/prisma or
// `server-only` must not be pulled into a test.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
