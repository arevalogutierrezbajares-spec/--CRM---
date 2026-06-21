/**
 * THE BRAIN — pipeline integrity assertions.
 *
 * Run by build-graph.mjs AFTER all extractors merge, BEFORE the artifact is
 * written. On violation they throw (NFR-OBS-2: fail loudly, leave the previous
 * artifact in place) — never write a corrupt graph.
 *
 * Two invariants:
 *   1. FR-PIPE-13 — no surface/domain id may appear under two systems.
 *      Restaurants surfaces are `system:"restaurants"`, never `caney`; this
 *      assertion guarantees the host-mounted territory never collides with the
 *      host's own ids.
 *   2. NFR-OBS-5 — any node with `source:"manifest"` must have `state:"needed"`
 *      (planned/fog-of-war). A manifest node that claims to be built is a bug.
 */

/**
 * FR-PIPE-13: assert the de-dup invariant — a node's globally-unique id (the
 * dotted "<system>.<slug>" key, per types.ts) belongs to exactly one system,
 * and that id's system prefix matches its `system` field.
 *
 * The canonical schema (FN_MAP in lib/brain/functions.ts) DELIBERATELY shares
 * domain vocabulary across systems — every system has a `payments`, `identity`,
 * `accounting`, etc. domain — namespaced by the system prefix
 * (`vav.payments` ≠ `caney.payments` ≠ `restaurants.payments`). So the de-dup
 * key is the FULL id, not the de-prefixed slug.
 *
 * The real risk FR-PIPE-13 guards is a host-mounted surface/entity leaking under
 * the wrong system: e.g. a Restaurants node carrying `system:"caney"`, or an id
 * prefixed for one system while `system` says another. We catch that two ways:
 *   (a) the same id appearing with two different `system` values, and
 *   (b) an id whose "<system>." prefix disagrees with its `system` field.
 * Restaurants nodes are `system:"restaurants"` and `restaurants.`-prefixed, so
 * they can never collide with the CaneyCloud host's own ids.
 *
 * @param {import("../../../lib/brain/types.ts").BrainNode[]} nodes
 * @throws {Error} listing every offending id.
 */
export function assertNoCrossSystemDup(nodes) {
  /** @type {Map<string, Set<string>>} id → set of systems claiming it */
  const byId = new Map();
  /** @type {string[]} ids whose dotted prefix disagrees with their `system`. */
  const mislabeled = [];

  for (const n of nodes) {
    if (n.kind === "system") continue; // systems are the partition, not members
    if (!n.system) continue;

    let set = byId.get(n.id);
    if (!set) {
      set = new Set();
      byId.set(n.id, set);
    }
    set.add(n.system);

    // The id MUST be namespaced under its own system: "<system>.<...>".
    if (!n.id.startsWith(`${n.system}.`)) {
      mislabeled.push(`${n.id} (system="${n.system}")`);
    }
  }

  const collisions = [];
  for (const [id, systems] of byId) {
    if (systems.size > 1) {
      collisions.push(`${id} → [${[...systems].sort().join(", ")}]`);
    }
  }

  const problems = [];
  if (collisions.length > 0) {
    problems.push(
      `${collisions.length} id(s) claimed by multiple systems:\n  ` +
        collisions.join("\n  "),
    );
  }
  if (mislabeled.length > 0) {
    problems.push(
      `${mislabeled.length} id(s) whose prefix disagrees with their system:\n  ` +
        mislabeled.join("\n  "),
    );
  }

  if (problems.length > 0) {
    throw new Error(`FR-PIPE-13 violation: ${problems.join("\n")}`);
  }
}

/**
 * NFR-OBS-5: assert every manifest-sourced node has state "needed".
 *
 * @param {import("../../../lib/brain/types.ts").BrainNode[]} nodes
 * @throws {Error} listing every offending node id + its bad state.
 */
export function assertManifestNeeded(nodes) {
  const offenders = nodes
    .filter((n) => n.source === "manifest" && n.state !== "needed")
    .map((n) => `${n.id} (state="${n.state}")`);

  if (offenders.length > 0) {
    throw new Error(
      `NFR-OBS-5 violation: ${offenders.length} manifest-sourced node(s) are not state:"needed":\n  ` +
        offenders.join("\n  "),
    );
  }
}

/**
 * Run all pipeline assertions. Call from the orchestrator before writing.
 * @param {import("../../../lib/brain/types.ts").BrainGraph} graph
 */
export function assertGraphIntegrity(graph) {
  assertNoCrossSystemDup(graph.nodes);
  assertManifestNeeded(graph.nodes);
}
