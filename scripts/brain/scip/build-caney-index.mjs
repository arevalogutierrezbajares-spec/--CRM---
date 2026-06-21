/**
 * THE BRAIN — build the CaneyCloud SCIP index (reproducible).
 *
 * Two steps, both read-only against the Caney backend:
 *   1. scip-python  → APP/backend/.brain/index.scip   (precise, pyright-backed)
 *   2. scip print --json → APP/backend/.brain/caney-scip.json  (what the
 *      extractor consumes)
 *
 * Prereqs (one-time):
 *   npm i -g @sourcegraph/scip-python      # the indexer (NOTE: npm, NOT pip)
 *   # the `scip` CLI: download the release binary for your platform and either
 *   # put it on PATH or pass SCIP_CLI=/abs/path/to/scip
 *
 * Usage:
 *   node scripts/brain/scip/build-caney-index.mjs
 * Output index is gitignored (~20-30MB). The extractor reads BRAIN_SCIP_INDEX or
 * the default path below.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { CANEY_BACKEND } from "../extractors/scip-caney-edges.mjs";

const OUT_DIR = join(CANEY_BACKEND, ".brain");
const SCIP_INDEX = join(OUT_DIR, "index.scip");
const JSON_INDEX = join(OUT_DIR, "caney-scip.json");
const SCIP_CLI = process.env.SCIP_CLI || "scip";

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(" ")}`);
  return execFileSync(cmd, args, { stdio: ["ignore", "inherit", "inherit"], ...opts });
}

function main() {
  if (!existsSync(CANEY_BACKEND)) {
    console.error(`[brain:scip] Caney backend not found at ${CANEY_BACKEND}`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  // 1) index with scip-python. --project-name namespaces symbols so the index
  // can later join cross-repo (scip-python's documented multi-repo flag).
  run(
    "scip-python",
    ["index", ".", "--project-name", "caneycloud-backend", "--output", SCIP_INDEX],
    { cwd: CANEY_BACKEND },
  );

  // 2) dump to JSON for the Node extractor.
  const json = execFileSync(SCIP_CLI, ["print", "--json", SCIP_INDEX], {
    cwd: CANEY_BACKEND,
    maxBuffer: 512 * 1024 * 1024,
  });
  writeFileSync(JSON_INDEX, json);

  console.log(`\n[brain:scip] wrote ${JSON_INDEX}`);
  console.log(`[brain:scip] point the extractor at it: BRAIN_SCIP_INDEX=${JSON_INDEX}`);
}

main();
