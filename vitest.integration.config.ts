import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/integration/**/*.test.ts"],
    globals: false,
    // Single worker, no parallel files / no concurrent tests within a file.
    // Integration tests share the schema; the afterEach truncate only works
    // when they run strictly sequentially.
    pool: "forks",
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    setupFiles: ["__tests__/integration/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      "server-only": path.resolve(__dirname, "__tests__/mocks/server-only.ts"),
    },
  },
});
