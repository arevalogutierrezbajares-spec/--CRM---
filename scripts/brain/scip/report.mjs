/**
 * THE BRAIN — SCIP Caney extraction report (the "7 → ~80" proof).
 *
 * Runs the SCIP-backed extractor against the index and writes a committed,
 * reviewable artifact (lib/brain/generated/scip-caney-report.json) plus a
 * console summary comparing it to the regex baseline. The report lets reviewers
 * see the full edge set WITHOUT the 29MB index.
 *
 * Usage:
 *   BRAIN_SCIP_INDEX=/path/to/caney-scip.json node scripts/brain/scip/report.mjs
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { extractScipCaneyEdges, scipIndexPath } from "../extractors/scip-caney-edges.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const ARTIFACT = join(REPO, "lib", "brain", "generated", "brain-graph.json");
const OUT = join(REPO, "lib", "brain", "generated", "scip-caney-report.json");

/** Current regex baseline: caney reads_writes edges in the live artifact. */
function regexBaseline() {
  try {
    const g = JSON.parse(readFileSync(ARTIFACT, "utf8"));
    return g.edges.filter(
      (e) => e.kind === "reads_writes" && e.from?.system === "caney",
    ).length;
  } catch {
    return null;
  }
}

const indexPath = scipIndexPath();
if (!existsSync(indexPath)) {
  console.error(
    `[brain:scip] no index at ${indexPath}\n` +
      `Run: node scripts/brain/scip/build-caney-index.mjs  (or set BRAIN_SCIP_INDEX)`,
  );
  process.exit(1);
}

const { edges, stats } = extractScipCaneyEdges({ indexPath });
const baseline = regexBaseline();

// Deterministic ordering for a diff-stable committed report.
edges.sort(
  (a, b) =>
    a.routeFile.localeCompare(b.routeFile) ||
    a.table.localeCompare(b.table) ||
    a.cls.localeCompare(b.cls),
);
const byDirection = edges.reduce(
  (acc, e) => ((acc[e.direction] = (acc[e.direction] ?? 0) + 1), acc),
  {},
);

const report = {
  source: "scip-python (Sourcegraph) — CaneyCloud backend",
  extractor: "scripts/brain/extractors/scip-caney-edges.mjs",
  regexBaselineEdges: baseline,
  scipEdges: edges.length,
  routeFiles: stats.routeFiles,
  tables: stats.tables,
  byDirection,
  edges,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log("── THE BRAIN · SCIP Caney route→table extraction ──────────────");
console.log(`  regex baseline (live artifact) : ${baseline} edges`);
console.log(`  SCIP-backed extractor          : ${edges.length} edges`);
console.log(`  across                         : ${stats.routeFiles} route files · ${stats.tables} tables`);
console.log(`  direction (reads/writes)       : ${JSON.stringify(byDirection)}`);
console.log(`  jump                           : ${baseline} → ${edges.length}  (${baseline ? (edges.length / baseline).toFixed(1) : "∞"}×)`);
console.log(`  report written                 : ${OUT.replace(REPO + "/", "")}`);
console.log("\n  sample edges:");
for (const e of edges.slice(0, 10)) {
  console.log(`    ${e.routeFile}  —${e.direction}→  ${e.table}  (${e.cls})`);
}
