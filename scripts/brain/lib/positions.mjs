/**
 * THE BRAIN — deterministic seed positions (NFR-LAYOUT-1: seed-then-pin).
 *
 * Pure functions, no randomness. The L0 portfolio sits at the origin; the 5
 * systems spread evenly around it; each system's domains seed radially around
 * their parent. The React-Flow client re-pins from these seeds, but the
 * artifact must already carry stable coords so a cold render has a layout.
 */

const TAU = Math.PI * 2;

/** Fixed angular order of the 5 systems around L0 (stable across runs). */
const SYSTEM_ORDER = ["vav", "caney", "crm", "restaurants", "academy"];
const SYSTEM_RADIUS = 520;
const DOMAIN_RADIUS = 260;
const SURFACE_RADIUS = 120;

/** Round to 1 decimal so the artifact is byte-stable. */
function r1(n) {
  return Math.round(n * 10) / 10;
}

/** Portfolio (L0) anchor. */
export function portfolioPos() {
  return { x: 0, y: 0 };
}

/** Deterministic position for a system node, spread around the origin. */
export function systemPos(system) {
  const i = SYSTEM_ORDER.indexOf(system);
  const idx = i < 0 ? 0 : i;
  // Start at -90° (top) and go clockwise so VAV is up.
  const angle = -TAU / 4 + (idx / SYSTEM_ORDER.length) * TAU;
  return { x: r1(Math.cos(angle) * SYSTEM_RADIUS), y: r1(Math.sin(angle) * SYSTEM_RADIUS) };
}

/**
 * Deterministic position for a domain node, seeded radially around its system
 * parent. `index`/`count` place it on the arc; positions fan outward from L0 so
 * domains don't overlap the hub.
 */
export function domainPos(system, index, count) {
  const base = systemPos(system);
  const n = Math.max(count, 1);
  // Bias the fan toward the outward direction (away from origin).
  const outward = Math.atan2(base.y, base.x);
  const spread = TAU * 0.5; // half-circle fan facing outward
  const start = outward - spread / 2;
  const angle = start + ((index + 0.5) / n) * spread;
  return {
    x: r1(base.x + Math.cos(angle) * DOMAIN_RADIUS),
    y: r1(base.y + Math.sin(angle) * DOMAIN_RADIUS),
  };
}

/** Deterministic position for a surface node, seeded around its domain parent. */
export function surfacePos(domainPosition, index, count) {
  const n = Math.max(count, 1);
  const outward = Math.atan2(domainPosition.y, domainPosition.x);
  const spread = TAU * 0.6;
  const start = outward - spread / 2;
  const angle = start + ((index + 0.5) / n) * spread;
  return {
    x: r1(domainPosition.x + Math.cos(angle) * SURFACE_RADIUS),
    y: r1(domainPosition.y + Math.sin(angle) * SURFACE_RADIUS),
  };
}
