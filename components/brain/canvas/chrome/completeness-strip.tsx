"use client";

/**
 * Completeness strip — trust loop under the freshness badge.
 * Shows portfolio coverage + live wires; animates bar fill on mount.
 */

import { useMemo } from "react";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { computeCompleteness } from "@/lib/brain/completeness";

export function CompletenessStrip() {
  const { graph } = useBrain();
  const report = useMemo(() => computeCompleteness(graph), [graph]);

  const pct = report.portfolioCoveragePct;
  const gapN = report.gaps.filter(
    (g) => g.kind === "dark_wire" || g.kind === "warn_wire" || g.kind === "low_coverage",
  ).length;

  const barW = pct ?? Math.min(
    100,
    Math.round(
      (report.totalSurfaces /
        Math.max(1, report.totalSurfaces + report.gaps.filter((g) => g.kind === "empty_domain").length)) *
        100,
    ),
  );

  return (
    <div
      className="brain-completeness"
      title={[
        `${report.totalSurfaces} surfaces · ${report.totalDomains} domains`,
        `${report.liveInterchanges} live wires · ${report.plannedInterchanges} planned`,
        pct != null ? `Coverage ~${pct}% vs OpenAPI/route meta` : "Coverage from map inventory",
      ].join("\n")}
    >
      <div className="brain-completeness__row">
        <span className="brain-completeness__label">Catalog</span>
        <span className="brain-completeness__stats">
          {report.totalSurfaces} surfaces
          <span className="brain-completeness__dot">·</span>
          {report.liveInterchanges} wires
          {gapN > 0 ? (
            <>
              <span className="brain-completeness__dot">·</span>
              <span className="brain-completeness__warn">{gapN} gaps</span>
            </>
          ) : (
            <>
              <span className="brain-completeness__dot">·</span>
              <span className="brain-completeness__ok">healthy</span>
            </>
          )}
        </span>
      </div>
      <div className="brain-completeness__track" aria-hidden>
        <div
          className="brain-completeness__fill"
          style={{ width: `${Math.max(4, barW)}%` }}
        />
      </div>
      {pct != null ? (
        <div className="brain-completeness__pct">{pct}% coverage</div>
      ) : null}
    </div>
  );
}
