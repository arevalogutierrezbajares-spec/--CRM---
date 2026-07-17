"use client";

/**
 * THE BRAIN — canvas-scoped rebuild-guard palette (⌘⇧K + `/`).
 *
 * Uses the same deterministic searchBrain ranking as /api/brain/search and the
 * floating command center. Jump actions go through navFromHit.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { PRESET_LIST } from "@/lib/brain/presets";
import {
  pushRecentSearch,
  safeToBuildMessage,
  searchBrain,
} from "@/lib/brain/search";
import { navFromHit } from "@/lib/brain/navigate";
import type { LensKey } from "@/lib/brain/lenses/types";

const OPEN_EVENT = "open-brain-command-palette";

/** Open the canvas palette from anywhere inside the Brain shell. */
export function openBrainCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const ACTIVE_LENSES: { key: LensKey; label: string }[] = [
  { key: "navigation", label: "Navigation lens" },
  { key: "state", label: "State lens" },
  { key: "topology", label: "Topology lens" },
  { key: "function", label: "Function overlay" },
];

export function BrainCommandPalette() {
  const { graph, view, actions } = useBrain();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Only intercept when shift is held OR the brain shell requests it via
        // the event; the bare ⌘K stays owned by the global palette. We open on
        // ⌘K + Shift to avoid stealing the app-wide shortcut, plus the event.
        if (e.shiftKey) {
          e.preventDefault();
          setOpen((o) => !o);
        }
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  // Unified rebuild-guard index (same ranking as /api/brain/search).
  const searchResult = useMemo(
    () =>
      query.trim()
        ? searchBrain(graph, query, 24)
        : {
            query: "",
            matches: graph.nodes
              .filter((n) => n.level === 1 || n.level === 2)
              .slice(0, 24)
              .map((n) => ({
                id: n.id,
                kind: (n.level === 1 ? "system" : "domain") as
                  | "system"
                  | "domain",
                label: n.label,
                system: n.system,
                path: n.id,
                score: 0,
              })),
            safeToBuild: false,
          },
    [graph, query],
  );

  const jumpHit = useCallback(
    (id: string, kind: string, label: string) => {
      if (query.trim()) pushRecentSearch(query.trim());
      const hit = searchResult.matches.find((m) => m.id === id) ?? {
        id,
        kind: kind as "system" | "domain" | "surface" | "entity" | "interchange",
        label,
        system: null,
        path: id,
        score: 0,
      };
      for (const step of navFromHit(graph, hit)) {
        if (step.type === "drill") {
          actions.drillInto({
            nodeId: step.nodeId,
            level: step.level,
            system: step.system,
            domainId: step.domainId,
          });
        } else {
          actions.select(step.id);
        }
      }
      close();
    },
    [actions, close, graph, query, searchResult.matches],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      label="Brain — jump to a node"
      shouldFilter={false}
      className="brain-root glass-cmdk"
      style={{
        position: "fixed",
        left: "50%",
        top: "13vh",
        zIndex: 120,
        width: "min(560px,92vw)",
        maxHeight: "64vh",
        transform: "translateX(-50%)",
        overflow: "hidden",
        borderRadius: 14,
        border: "1px solid var(--line-2)",
      }}
    >
      {/* Radix Dialog.Content requires an accessible title — visually hidden. */}
      <Dialog.Title
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Brain — jump to a node
      </Dialog.Title>
      <style>{`
        .brain-root .brain-cmdk-item[data-selected="true"]{
          background: var(--panel-s);
          color: var(--ink);
        }
        .brain-root .brain-cmdk-item[data-selected="true"] > span:first-child{
          color: var(--caney);
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--line)",
          padding: "0 14px",
        }}
      >
        <span aria-hidden="true" style={{ color: "var(--ink-faint)" }}>
          ⌕
        </span>
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Does it already exist? Route, domain, wire…"
          style={{
            height: 46,
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "var(--ink)",
            fontFamily: "var(--body)",
            fontSize: 15,
          }}
        />
        <kbd
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 5,
            border: "1px solid var(--line-2)",
            color: "var(--ink-faint)",
          }}
        >
          esc
        </kbd>
      </div>

      <Command.List
        style={{ maxHeight: "calc(64vh - 46px)", overflowY: "auto", padding: 6 }}
      >
        <Command.Empty
          style={{
            padding: "22px 12px",
            textAlign: "center",
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
          }}
        >
          {query.trim().length >= 2
            ? safeToBuildMessage(query)
            : "Type to search the portfolio graph."}
        </Command.Empty>

        <Group heading="Rebuild-guard">
          {searchResult.matches.map((hit) => (
            <Row
              key={hit.id}
              icon={
                hit.kind === "interchange"
                  ? "⇄"
                  : hit.kind === "surface"
                    ? "›"
                    : hit.kind === "entity"
                      ? "▣"
                      : "●"
              }
              right={hit.kind}
              onSelect={() => jumpHit(hit.id, hit.kind, hit.label)}
            >
              {hit.label}
            </Row>
          ))}
        </Group>

        {!query.trim() && (
          <>
            <Group heading="Lenses">
              {ACTIVE_LENSES.map((l) => (
                <Row
                  key={l.key}
                  icon={view.lens === l.key ? "●" : "○"}
                  onSelect={() => {
                    actions.setLens(l.key);
                    close();
                  }}
                >
                  {l.label}
                </Row>
              ))}
            </Group>

            <Group heading="Audiences">
              {PRESET_LIST.map((p) => (
                <Row
                  key={p.id}
                  icon={view.preset === p.id ? "●" : "○"}
                  onSelect={() => {
                    actions.setPreset(p.id);
                    close();
                  }}
                >
                  {p.label}
                </Row>
              ))}
            </Group>
          </>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          padding: "4px 8px 3px",
        }}
      >
        {heading}
      </div>
      {children}
    </Command.Group>
  );
}

function Row({
  icon,
  right,
  onSelect,
  children,
}: {
  icon: string;
  right?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="brain-cmdk-item"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 9px",
        borderRadius: 8,
        cursor: "pointer",
        color: "var(--ink-dim)",
        fontSize: 13,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 14,
          textAlign: "center",
          fontFamily: "var(--mono)",
          fontSize: 12,
          color: "var(--ink-faint)",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </span>
      {right && (
        <span
          style={{
            flexShrink: 0,
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-faint)",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {right}
        </span>
      )}
    </Command.Item>
  );
}
