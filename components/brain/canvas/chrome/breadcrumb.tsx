"use client";

/**
 * THE BRAIN — breadcrumb (FR-NAV-3).
 *
 * Renders the resolved trail from `view.crumbs` (Portfolio › System › Domain, or
 * Functions › Func › Domain). Every crumb except the current is a button that
 * navigates UP to that altitude via the provider's `goUp(toLevel, nodeId)` — the
 * clickable up-paths required by FR-NAV-2/3. The synthetic root crumb
 * ("portfolio"/"functions") pops all the way out (toLevel 0, nodeId null).
 */

import { Fragment } from "react";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import type { BreadcrumbItem } from "@/lib/brain/selectors";

export function Breadcrumb() {
  const { view, actions } = useBrain();
  const crumbs = view.crumbs;

  function goTo(item: BreadcrumbItem) {
    // Root crumb → fully pop; node crumb → pop to its level + reselect it.
    if (item.id === "portfolio" || item.id === "functions") {
      actions.goUp(0, null);
    } else {
      actions.goUp(item.level, item.id);
    }
  }

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--mono)",
        fontSize: 12,
        minWidth: 0,
      }}
    >
      <ol
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          listStyle: "none",
          margin: 0,
          padding: 0,
          minWidth: 0,
        }}
      >
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <Fragment key={`${c.id}-${i}`}>
              <li style={{ minWidth: 0 }}>
                {isLast ? (
                  <span
                    aria-current="page"
                    style={{
                      color: "var(--ink)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "inline-block",
                      maxWidth: 180,
                      verticalAlign: "bottom",
                    }}
                  >
                    {c.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo(c)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--ink-faint)",
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      transition: "color .18s var(--ease)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--ink-dim)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--ink-faint)";
                    }}
                  >
                    {c.label}
                  </button>
                )}
              </li>
              {!isLast && (
                <li aria-hidden="true" style={{ color: "var(--ink-faint)", opacity: 0.5 }}>
                  ›
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
