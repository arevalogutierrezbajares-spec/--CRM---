/**
 * THE BRAIN — derivation-pipeline ORCHESTRATOR.
 *
 * Builds a single BrainGraph by running the registered extractors, merging
 * their nodes/edges into one GraphBuilder, running the pipeline integrity
 * assertions (FR-PIPE-13 de-dup + NFR-OBS-5 manifest-state), and writing the
 * artifact + a timestamp-keyed snapshot.
 *
 * Invariants:
 *   - Read-only over source repos (NFR-SEC-3); CREDS never serialized (NFR-SEC-4).
 *   - Deterministic / idempotent: byte-identical output modulo `generatedAt`
 *     (NFR-FRESH-5). Nodes/edges keep insertion order; JSON keys are stable.
 *   - Runs cleanly with ZERO extractors wired — emits a valid empty graph.
 *   - On assertion failure, throws and leaves the previous artifact in place
 *     (NFR-OBS-2: fail loudly, never write a corrupt graph).
 *
 * Usage:
 *   node scripts/brain/build-graph.mjs [snapshotKey]
 *     snapshotKey — optional label for the snapshot copy; defaults to "manual".
 *
 * Output:
 *   lib/brain/generated/brain-graph.json
 *   lib/brain/generated/snapshots/<snapshotKey-or-timestamp>.json
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { execSync } from "node:child_process";

import { GraphBuilder } from "./lib/emit.mjs";
import { assertGraphIntegrity } from "./lib/dedup.mjs";
import { EXTERNALS, ARTIFACT_PATH, SNAPSHOT_DIR, REPO_ROOTS } from "./config.mjs";

import { extractOpenApiSurfaces } from "./extractors/openapi-surfaces.mjs";
import { extractMigrationEntities } from "./extractors/migration-entities.mjs";
import { extractSurfaceEdges } from "./extractors/surface-edges.mjs";
import { extractScipCaneyGraph } from "./extractors/scip-caney-edges.mjs";
import { extractDomainClusters } from "./extractors/domain-cluster.mjs";
import { extractInterchanges } from "./extractors/interchange-detector.mjs";
import { extractStateOverlay } from "./extractors/state-overlay.mjs";
import { extractHostMount } from "./extractors/host-mount.mjs";
import { extractManifestSource } from "./extractors/manifest-source.mjs";
import { extractDocsRef } from "./extractors/docs-ref.mjs";

/** Resolve a short commit SHA for a repo root; null if not a git repo. */
function gitShaFor(root) {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Serialize a BrainGraph with a STABLE top-level key order (matches the
 * BrainGraph interface declaration order), pretty-printed with 2-space indent.
 * Node/edge/function field order is already canonical (set by the emit
 * factories), so a plain stringify over those arrays preserves it.
 * @param {import("../../lib/brain/types.ts").BrainGraph} graph
 */
function serialize(graph) {
  const ordered = {
    version: graph.version,
    generatedAt: graph.generatedAt,
    commit: graph.commit,
    nodes: graph.nodes,
    edges: graph.edges,
    functions: graph.functions,
    externals: graph.externals,
  };
  return JSON.stringify(ordered, null, 2) + "\n";
}

async function main() {
  const snapshotKey = process.argv[2] || "manual";
  const generatedAt = new Date().toISOString();

  const gb = new GraphBuilder();
  gb.setExternals(EXTERNALS);

  // ============================================================
  // === EXTRACTORS WIRED ===
  //
  // Ordering matters: the surface + migration extractors gather real counts;
  // those counts feed domain-cluster so the system L1 meta strings are honest.
  // domain-cluster guarantees the FULL canonical domain set per live system.
  // Then surfaces/entities attach L3 detail, interchanges + host-mount + manifest
  // emit cross-system edges and the Restaurants/Academy territories. Finally the
  // state-overlay applies board-derived state overrides to merged domain nodes.
  // ============================================================

  // 1. FR-PIPE-1 — OpenAPI / route surfaces (also yields path/route counts).
  const surfaces = extractOpenApiSurfaces();

  // 2. FR-PIPE-2 — migration/schema entity counts + a few entity nodes.
  const migrations = extractMigrationEntities();

  // Merge the counts both extractors gathered for the system meta strings.
  const counts = { ...migrations.counts, ...surfaces.counts };

  // 3. FR-PIPE-3 — domain clusters: portfolio + 3 live systems with FULL domain
  //    sets + honest meta. Emit FIRST so L1/L2 exist before L3 attaches.
  const clusters = extractDomainClusters({ counts });
  gb.addNodes(clusters.nodes);
  gb.addEdges(clusters.edges);

  // Attach surface + entity detail (L3) and their contains edges.
  gb.addNodes(surfaces.nodes);
  gb.addEdges(surfaces.edges);
  gb.addNodes(migrations.nodes);

  // 3b. Surface→table reads_writes / calls micro-edges (the 40-blocker). Runs
  //     after surfaces + entities exist so it can resolve their ids. When
  //     BRAIN_SCIP=1, Caney is handled by the precise SCIP extractor below, so
  //     it is excluded from the regex path (the regex Caney path is superseded).
  const scipOn = process.env.BRAIN_SCIP === "1";
  const surfaceEdges = extractSurfaceEdges({
    surfaceNodes: surfaces.nodes,
    entityNodes: migrations.nodes,
    excludeSystems: scipOn ? ["caney"] : [],
  });
  gb.addEdges(surfaceEdges.edges);

  // 3c. (gated) SCIP-backed Caney route→table edges + their surface/entity nodes.
  //     scip-python resolves aliased/late/destructured imports the regex cannot,
  //     lifting Caney from ~3 to ~85 reads_writes edges. OFF by default so the
  //     committed artifact stays byte-identical; enable with BRAIN_SCIP=1 + a
  //     built index (scripts/brain/scip/build-caney-index.mjs).
  if (scipOn) {
    const caneyDomainIds = new Set(
      clusters.nodes.filter((n) => n.system === "caney" && n.level === 2).map((n) => n.id),
    );
    const caneyEntityIds = new Set(
      migrations.nodes.filter((n) => n.system === "caney" && n.kind === "entity").map((n) => n.id),
    );
    const scip = extractScipCaneyGraph({
      existingDomainIds: caneyDomainIds,
      existingEntityIds: caneyEntityIds,
    });
    gb.addNodes(scip.nodes);
    gb.addEdges(scip.edges);
    if (scip.stats.available) {
      console.log(
        `[brain:build] SCIP caney: +${scip.edges.length} reads_writes · +${scip.nodes.length} nodes (${scip.stats.routeFiles} routes · ${scip.stats.tables} tables)`,
      );
    } else {
      console.warn("[brain:build] BRAIN_SCIP=1 but no index found — skipping (run scripts/brain/scip/build-caney-index.mjs)");
    }
  }

  // 4. FR-PIPE-4 / FR-XSYS-1 — the 5 LIVE interchange edges.
  const interchanges = extractInterchanges();
  gb.addEdges(interchanges.edges);

  // 5. FR-PIPE-13/15 — Restaurants host-mounted territory + host_mount edge.
  const hostMount = extractHostMount();
  gb.addNodes(hostMount.nodes);
  gb.addEdges(hostMount.edges);

  // 6. FR-PIPE-14 — Academy planned-from-manifest territory + 3 planned edges.
  const manifest = extractManifestSource();
  gb.addNodes(manifest.nodes);
  gb.addEdges(manifest.edges);

  // 7. FR-PIPE-7 — state overlay: apply board-derived overrides to domain nodes.
  //    Never overrides a manifest ("needed") node (NFR-OBS-5) — manifest domains
  //    are not present in any board signal map.
  const overlay = extractStateOverlay();
  for (const n of gb.nodes()) {
    if (n.kind !== "domain") continue;
    if (n.source === "manifest") continue; // never promote fog-of-war
    const next = overlay.stateOverrides[n.id];
    if (next) n.state = next;
  }

  // 8. B4 — docs→node join: populate `summary` + `docs_ref` on any node whose
  //    id matches a docs/brain/*.md front-matter `brain_node:` in the caney
  //    repo. No-op unless BRAIN_ROOT_CANEY points at the clone that carries the
  //    docs (--TOURISM--), NOT the stale tour-pms-main default. Applies to
  //    nodes emitted by earlier extractors; never adds nodes of its own.
  const docs = extractDocsRef();
  let docsApplied = 0;
  for (const n of gb.nodes()) {
    const ref = docs.docRefs[n.id];
    if (!ref) continue;
    n.docs_ref = ref.docs_ref;
    if (ref.summary) n.summary = ref.summary;
    docsApplied++;
  }
  if (docs.stats.matched) {
    console.log(
      `[brain:build] docs-ref: matched ${docs.stats.matched} doc(s) → applied to ${docsApplied} node(s)`,
    );
  }

  // Per-system commit SHAs (academy stays null — no code yet).
  gb.setCommit("vav", gitShaFor(REPO_ROOTS.vav));
  gb.setCommit("caney", gitShaFor(REPO_ROOTS.caney));
  gb.setCommit("crm", gitShaFor(REPO_ROOTS.crm));
  gb.setCommit("restaurants", gitShaFor(REPO_ROOTS.restaurants));

  const graph = gb.toGraph({ generatedAt });

  // Pipeline integrity gate — throws (leaving the old artifact) on violation.
  assertGraphIntegrity(graph);

  const json = serialize(graph);

  // Write the canonical artifact.
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, json, "utf8");

  // Write a snapshot copy for time-travel diffing (keyed by arg or timestamp).
  const safeKey =
    snapshotKey === "manual"
      ? generatedAt.replace(/[:.]/g, "-")
      : snapshotKey.replace(/[^A-Za-z0-9._-]/g, "-");
  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const snapshotPath = `${SNAPSHOT_DIR}/${safeKey}.json`;
  writeFileSync(snapshotPath, json, "utf8");

  const summary = `[brain:build] ok — ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.functions.length} functions, ${graph.externals.length} externals`;
  console.log(summary);
  console.log(`[brain:build] artifact → ${ARTIFACT_PATH}`);
  console.log(`[brain:build] snapshot → ${snapshotPath}`);
}

main().catch((err) => {
  // NFR-OBS-2: fail loudly; the previous artifact is untouched (we write last).
  console.error(`[brain:build] FAILED: ${err?.stack ?? err}`);
  process.exitCode = 1;
});
