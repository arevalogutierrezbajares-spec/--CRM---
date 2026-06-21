"use client";

/**
 * THE BRAIN — canvas-scoped ⌘K palette (stub).
 *
 * Mirrors the existing global palette (components/command/command-palette.tsx):
 * same `cmdk` Command.Dialog structure, `shouldFilter={false}`, ⌘K/Ctrl+K open,
 * Esc close. But this one is SCOPED TO THE CANVAS — it lists Brain nodes to jump
 * to (drill into systems/domains, select surfaces) plus lens/preset switches,
 * dispatching through the provider rather than navigating routes.
 *
 * It deliberately does NOT register a second route-level palette; it only opens
 * when the canvas has focus interest. The global AGB-CRM ⌘K still works for app
 * navigation — this is an additive, canvas-local jump tool (a v0 stub: search +
 * jump + lens/preset, no fuzzy ranking beyond substring).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import { PRESET_LIST } from "@/lib/brain/presets";
import {
  STATE_GLYPH,
  SYSTEM_LABEL,
  type BrainNode,
  type System,
} from "@/lib/brain/types";
import type { LensKey } from "@/lib/brain/lenses/types";

const OPEN_EVENT = "open-brain-command-palette";

/** Open the canvas palette from anywhere inside the Brain shell. */
export function openBrainCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const ACTIVE_LENSES: { key: LensKey; label: string }[] = [
  { key: "navigation", label: "Navigation lens" },
  { key: "state", label: "State lens" },
  { key: "function", label: "Function overlay" },
];

interface JumpTarget {
  node: BrainNode;
  kind: "system" | "domain" | "surface";
}

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

  // Flat jump index: systems (L1) + domains (L2) + surfaces (L3 placeholders).
  const targets = useMemo<JumpTarget[]>(() => {
    const out: JumpTarget[] = [];
    for (const n of graph.nodes) {
      if (n.level === 1) out.push({ node: n, kind: "system" });
      else if (n.level === 2) out.push({ node: n, kind: "domain" });
      else if (n.level === 3) out.push({ node: n, kind: "surface" });
    }
    return out;
  }, [graph.nodes]);

  const q = query.trim().toLowerCase();
  const JUMP_LIMIT = 24;
  const filtered = useMemo(
    () =>
      q
        ? targets.filter(
            (t) =>
              t.node.label.toLowerCase().includes(q) ||
              t.node.id.toLowerCase().includes(q),
          )
        : targets.filter((t) => t.kind !== "surface"),
    [targets, q],
  );
  const matches = filtered.slice(0, JUMP_LIMIT);

  const jump = useCallback(
    (t: JumpTarget) => {
      if (t.kind === "system") {
        actions.drillInto({
          nodeId: t.node.id,
          level: 1,
          system: t.node.system as System,
        });
      } else if (t.kind === "domain") {
        actions.drillInto({
          nodeId: t.node.id,
          level: 2,
          system: t.node.system as System,
          domainId: t.node.id,
        });
      } else {
        actions.select(t.node.id);
      }
      close();
    },
    [actions, close],
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
          placeholder="Jump to a system, domain, or surface…"
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
          No node matches “{query}” — safe to build it.
        </Command.Empty>

        <Group heading="Jump to">
          {matches.map((t) => (
            <Row
              key={t.node.id}
              icon={
                t.kind === "surface"
                  ? "›"
                  : STATE_GLYPH[t.node.state]
              }
              right={kindRight(t)}
              onSelect={() => jump(t)}
            >
              {t.node.label}
            </Row>
          ))}
          {filtered.length > JUMP_LIMIT ? (
            <div
              style={{
                padding: "6px 10px 8px",
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--ink-faint)",
              }}
            >
              Showing {JUMP_LIMIT} of {filtered.length} — keep typing to narrow.
            </div>
          ) : null}
        </Group>

        {!q && (
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

function kindRight(t: JumpTarget): string {
  if (t.kind === "system") return "system";
  if (t.kind === "domain") {
    return t.node.system ? SYSTEM_LABEL[t.node.system as System] : "domain";
  }
  return t.node.surfaces[0] ?? "surface";
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
