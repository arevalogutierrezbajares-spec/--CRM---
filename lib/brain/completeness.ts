/**
 * THE BRAIN — catalog completeness (Area 5).
 *
 * Pure metrics over BrainGraph so the UI can show trust + gaps without I/O.
 * Completeness = how much structure is on the map vs expected inventory signals
 * already present in system meta / L3 counts / interchange health.
 */

import type { BrainGraph, BrainNode, Health, System } from "./types";
import { SYSTEM_LABEL } from "./types";

export type SystemCompleteness = {
  system: System;
  label: string;
  /** L3 surfaces+entities on the map for this system. */
  surfacesOnMap: number;
  /** L2 domains. */
  domains: number;
  /** Domains with zero L3 children (coverage holes). */
  emptyDomains: number;
  /** Expected route/path count parsed from system.meta when present. */
  expectedFromMeta: number | null;
  /** Coverage 0–100 when expected is known; else null. */
  coveragePct: number | null;
  /** Live interchanges touching this system. */
  liveWires: number;
  /** Live wires with health warn/dark. */
  unhealthyWires: number;
  meta: string | null;
};

export type CompletenessGap = {
  id: string;
  kind: "empty_domain" | "planned_wire" | "dark_wire" | "warn_wire" | "low_coverage";
  label: string;
  detail: string;
  system: System | null;
  /** Graph node/edge id to select or drill. */
  targetId: string;
};

export type CompletenessReport = {
  systems: SystemCompleteness[];
  /** Mean of known coverage pcts; null if none known. */
  portfolioCoveragePct: number | null;
  totalSurfaces: number;
  totalDomains: number;
  liveInterchanges: number;
  plannedInterchanges: number;
  gaps: CompletenessGap[];
};

/** Parse "72 routes" / "243 routes · 194 pages" from system meta. */
export function parseExpectedFromMeta(meta: string | null | undefined): number | null {
  if (!meta) return null;
  const m = meta.match(/(\d+)\s*(?:routes?|paths?|endpoints?)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function childrenByParent(graph: BrainGraph): Map<string, BrainNode[]> {
  const m = new Map<string, BrainNode[]>();
  for (const n of graph.nodes) {
    if (!n.parentId) continue;
    const list = m.get(n.parentId) ?? [];
    list.push(n);
    m.set(n.parentId, list);
  }
  return m;
}

/**
 * Build a completeness report for the portfolio strip + gaps list.
 */
export function computeCompleteness(graph: BrainGraph): CompletenessReport {
  const byParent = childrenByParent(graph);
  const systemNodes = graph.nodes.filter((n) => n.level === 1 && n.system);
  const l3 = graph.nodes.filter((n) => n.level === 3);
  const domains = graph.nodes.filter((n) => n.level === 2);

  const systems: SystemCompleteness[] = systemNodes.map((sys) => {
    const system = sys.system as System;
    const sysDomains = domains.filter((d) => d.system === system);
    const surfacesOnMap = l3.filter((n) => n.system === system).length;
    let emptyDomains = 0;
    for (const d of sysDomains) {
      const kids = byParent.get(d.id) ?? [];
      if (kids.filter((k) => k.level === 3).length === 0 && d.source !== "manifest") {
        // manifest domains are *expected* empty of code surfaces
        emptyDomains += 1;
      }
    }
    const expectedFromMeta = parseExpectedFromMeta(sys.meta);
    const coveragePct =
      expectedFromMeta != null
        ? Math.min(100, Math.round((surfacesOnMap / expectedFromMeta) * 100))
        : null;

    const wires = graph.edges.filter(
      (e) =>
        e.kind === "interchange" &&
        e.contract_status === "live" &&
        (e.from.system === system || e.to.system === system),
    );
    const unhealthyWires = wires.filter(
      (e) => e.health === "warn" || e.health === "dark",
    ).length;

    return {
      system,
      label: SYSTEM_LABEL[system] ?? sys.label,
      surfacesOnMap,
      domains: sysDomains.length,
      emptyDomains,
      expectedFromMeta,
      coveragePct,
      liveWires: wires.length,
      unhealthyWires,
      meta: sys.meta,
    };
  });

  const known = systems
    .map((s) => s.coveragePct)
    .filter((p): p is number => p != null);
  const portfolioCoveragePct =
    known.length > 0
      ? Math.round(known.reduce((a, b) => a + b, 0) / known.length)
      : null;

  const liveIx = graph.edges.filter(
    (e) => e.kind === "interchange" && e.contract_status === "live",
  );
  const plannedIx = graph.edges.filter(
    (e) => e.kind === "interchange" && e.contract_status === "planned",
  );

  const gaps: CompletenessGap[] = [];

  // Empty domains (cap list)
  for (const d of domains) {
    if (d.source === "manifest") continue;
    const kids = (byParent.get(d.id) ?? []).filter((k) => k.level === 3);
    if (kids.length === 0) {
      gaps.push({
        id: `gap.empty.${d.id}`,
        kind: "empty_domain",
        label: d.label,
        detail: "No surfaces/entities on map yet",
        system: d.system,
        targetId: d.id,
      });
    }
  }

  for (const e of plannedIx) {
    gaps.push({
      id: `gap.planned.${e.id}`,
      kind: "planned_wire",
      label: e.purpose ?? e.id,
      detail: `${e.from.system} → ${e.to.system} (planned)`,
      system: e.from.system,
      targetId: e.id,
    });
  }

  for (const e of liveIx) {
    const h = (e.health ?? "ok") as Health;
    if (h === "dark" || h === "warn") {
      gaps.push({
        id: `gap.health.${e.id}`,
        kind: h === "dark" ? "dark_wire" : "warn_wire",
        label: e.purpose ?? e.id,
        detail: `Structural health: ${h}`,
        system: e.from.system,
        targetId: e.id,
      });
    }
  }

  for (const s of systems) {
    if (s.coveragePct != null && s.coveragePct < 70 && s.expectedFromMeta != null) {
      gaps.push({
        id: `gap.cov.${s.system}`,
        kind: "low_coverage",
        label: s.label,
        detail: `${s.surfacesOnMap}/${s.expectedFromMeta} on map (${s.coveragePct}%)`,
        system: s.system,
        targetId: s.system,
      });
    }
  }

  // Stable priority: health → coverage → empty → planned
  const rank: Record<CompletenessGap["kind"], number> = {
    dark_wire: 0,
    warn_wire: 1,
    low_coverage: 2,
    empty_domain: 3,
    planned_wire: 4,
  };
  gaps.sort((a, b) => rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label));

  return {
    systems,
    portfolioCoveragePct,
    totalSurfaces: l3.length,
    totalDomains: domains.length,
    liveInterchanges: liveIx.length,
    plannedInterchanges: plannedIx.length,
    gaps: gaps.slice(0, 24),
  };
}
