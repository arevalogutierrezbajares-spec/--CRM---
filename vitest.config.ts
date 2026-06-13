import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/unit/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      // `server-only` is a build-time marker; stub it so unit tests can
      // import server modules (lib/server-action-guard, storage helpers).
      "server-only": path.resolve(__dirname, "__tests__/stubs/server-only.ts"),
      // pdf-lib's ES build uses extensionless relative imports that wedge
      // vite's transform (vitest hangs forever importing it); the CJS build
      // loads instantly and is what Next bundles server-side anyway.
      "pdf-lib": path.resolve(__dirname, "node_modules/pdf-lib/cjs/index.js"),
      "@": path.resolve(__dirname),
    },
  },
});
