/**
 * THE BRAIN / AGB-CRM — architecture drift gate (Concern 2, TS side).
 *
 * `npm run lint:deps` fails the build when the import graph drifts from the
 * intended architecture: new dependency cycles, dead/orphan modules, devDeps
 * leaking into runtime code, or `lib/` (the reusable core) reaching back into
 * `app/` routes. The rules are checked-in next to the code, so divergence is
 * caught on the PR that introduces it — the Python counterpart is import-linter.
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Circular dependencies hairball the graph, break tree-shaking, and signal a missing seam.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment:
        "Unreferenced modules are usually dead code. Next.js framework entry points are excluded (the framework loads them, not an import).",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)[^/]+\\.config\\.[cm]?[jt]s$",
          "(^|/)(next-env|instrumentation|middleware)\\.[cm]?[jt]sx?$",
          // App-Router special files are reachable by the framework, not by imports:
          "(^|/)app/.*(page|layout|loading|error|not-found|route|template|default|global-error)\\.[jt]sx?$",
          "(^|/)app/(sitemap|robots|manifest|icon|apple-icon|opengraph-image)\\.[jt]sx?$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-dev-dep",
      severity: "error",
      comment:
        "Runtime code must not import a devDependency (it won't exist in production).",
      from: {
        pathNot: [
          "(^|/)__tests__/",
          "\\.test\\.[jt]sx?$",
          "(^|/)scripts/",
          "(^|/)db/seed", // dev-only seed scripts (run via tsx, never bundled)
          "(^|/)[^/]+\\.config\\.[cm]?[jt]s$",
        ],
      },
      to: {
        dependencyTypes: ["npm-dev"],
        pathNot: ["node_modules/(@types|typescript)/"],
      },
    },
    {
      name: "lib-stays-app-agnostic",
      severity: "error",
      comment:
        "lib/ is the reusable core — it must not import from app/ (that would couple shared logic to routes).",
      from: { path: "^lib/" },
      to: { path: "^app/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types", "typings"],
    },
  },
};
