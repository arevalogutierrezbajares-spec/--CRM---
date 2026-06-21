/**
 * THE BRAIN — staleness / drift gate (Concern 2: freshness).
 *
 * The generated artifact embeds a per-repo `commit` SHA + `generatedAt`. This
 * checks those against the LIVE HEAD of each source repo and the wall clock, so
 * a map that has gone stale (source repos moved on but `brain:build` never
 * re-ran) fails loudly — the same "--check before deploy" contract as
 * scripts/db-migrate.sh.
 *
 * Read-only. Degrades gracefully: a repo that isn't checked out (or isn't a git
 * repo) is skipped, not failed — so the check is meaningful wherever the sibling
 * repos are present (local pre-deploy, or a multi-repo CI) and a harmless no-op
 * where they aren't.
 *
 * Usage:
 *   node scripts/brain/check-staleness.mjs            # fail on SHA drift
 *   node scripts/brain/check-staleness.mjs --max-age 14   # also fail if older than 14d
 * Exit codes: 0 = fresh · 1 = drift / too old / missing artifact.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { ARTIFACT_PATH, REPO_ROOTS } from "./config.mjs";

/** System → repo-root key in REPO_ROOTS (academy has no code → no root). */
const SYSTEM_ROOT_KEY = {
  vav: "vav",
  caney: "caney",
  crm: "crm",
  restaurants: "restaurants",
};

/* ── Pure helpers (unit-testable) ────────────────────────────────────────── */

/**
 * Drift between the artifact's recorded SHAs and the live HEADs. A system is
 * compared only when BOTH are known; an absent live SHA (repo not checked out)
 * or a null recorded SHA (no code yet, e.g. academy) is skipped. PURE.
 * @returns {{system:string, recorded:string, current:string}[]}
 */
export function diffCommits(recorded = {}, current = {}) {
  const drift = [];
  for (const [system, rec] of Object.entries(recorded)) {
    const cur = current[system];
    if (!rec || cur === undefined || cur === null) continue;
    if (rec !== cur) drift.push({ system, recorded: rec, current: cur });
  }
  return drift;
}

/** Whole days between an ISO timestamp and a reference epoch-ms, or null if the
 * timestamp is unparseable. PURE. */
export function ageDays(generatedAt, nowMs) {
  const t = Date.parse(generatedAt ?? "");
  if (Number.isNaN(t)) return null;
  return Math.floor((nowMs - t) / 86_400_000);
}

/* ── I/O ─────────────────────────────────────────────────────────────────── */

/** Short HEAD SHA for a repo root, or null when missing / not a git repo. */
function liveSha(root) {
  if (!root || !existsSync(root)) return null;
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function parseMaxAge(argv) {
  const i = argv.indexOf("--max-age");
  if (i === -1) return null;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function main() {
  if (!existsSync(ARTIFACT_PATH)) {
    console.error(`[brain:check] no artifact at ${ARTIFACT_PATH} — run npm run brain:build`);
    process.exit(1);
  }
  let graph;
  try {
    graph = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  } catch (err) {
    console.error(`[brain:check] artifact unreadable: ${err?.message ?? err}`);
    process.exit(1);
  }

  const current = {};
  for (const [system, key] of Object.entries(SYSTEM_ROOT_KEY)) {
    current[system] = liveSha(REPO_ROOTS[key]);
  }

  const drift = diffCommits(graph.commit ?? {}, current);
  const age = ageDays(graph.generatedAt, Date.now());
  const maxAge = parseMaxAge(process.argv);

  console.log("── THE BRAIN · freshness check ────────────────────────────────");
  console.log(`  built : ${graph.generatedAt}${age != null ? `  (${age}d ago)` : ""}`);
  const checked = Object.entries(current).filter(([, sha]) => sha);
  for (const [system, sha] of checked) {
    const rec = graph.commit?.[system] ?? "—";
    const flag = rec === sha ? "✓" : "✗ DRIFT";
    console.log(`  ${system.padEnd(12)} recorded ${String(rec).padEnd(10)} live ${sha}  ${flag}`);
  }
  const skipped = Object.entries(current).filter(([, sha]) => !sha).map(([s]) => s);
  if (skipped.length) console.log(`  skipped (repo not present): ${skipped.join(", ")}`);

  const tooOld = maxAge != null && age != null && age > maxAge;
  if (drift.length === 0 && !tooOld) {
    console.log(`\n  ✓ fresh — ${checked.length} repos in sync` + (maxAge ? `, within ${maxAge}d` : ""));
    process.exit(0);
  }

  if (drift.length) {
    console.error(`\n  ✗ STALE — ${drift.length} repo(s) moved since the last brain:build:`);
    for (const d of drift) console.error(`      ${d.system}: ${d.recorded} → ${d.current}`);
  }
  if (tooOld) console.error(`\n  ✗ TOO OLD — built ${age}d ago (max ${maxAge}d)`);
  console.error(`\n  → regenerate: npm run brain:build`);
  process.exit(1);
}

// Run only when invoked directly (node … / npm run brain:check) — NOT when
// imported by tests (which would trigger process.exit and kill the runner).
const isEntry =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) main();
