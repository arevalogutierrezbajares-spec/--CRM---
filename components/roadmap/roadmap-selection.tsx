"use client";

/**
 * Shared multi-select state for the roadmap. Lets the top toolbar (where Export
 * / Copy for AI live) show a "Delete (N)" action while milestone + deliverable
 * rows expose selection checkboxes. One provider wraps both so the toolbar and
 * the board stay in sync.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type SelKind = "init" | "task";

type SelectionCtx = {
  selectMode: boolean;
  setSelectMode: (on: boolean) => void;
  selected: Map<string, SelKind>;
  isSelected: (id: string) => boolean;
  toggle: (id: string, kind: SelKind) => void;
  clear: () => void;
  count: number;
  initiativeIds: string[];
  taskIds: string[];
};

const Ctx = createContext<SelectionCtx | null>(null);

export function RoadmapSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectMode, setSelectModeRaw] = useState(false);
  const [selected, setSelected] = useState<Map<string, SelKind>>(new Map());

  const clear = useCallback(() => setSelected(new Map()), []);
  const setSelectMode = useCallback((on: boolean) => {
    setSelectModeRaw(on);
    if (!on) setSelected(new Map());
  }, []);
  const toggle = useCallback((id: string, kind: SelKind) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, kind);
      return next;
    });
  }, []);

  const value = useMemo<SelectionCtx>(() => {
    const initiativeIds: string[] = [];
    const taskIds: string[] = [];
    for (const [id, kind] of selected) (kind === "init" ? initiativeIds : taskIds).push(id);
    return {
      selectMode,
      setSelectMode,
      selected,
      isSelected: (id) => selected.has(id),
      toggle,
      clear,
      count: selected.size,
      initiativeIds,
      taskIds,
    };
  }, [selectMode, setSelectMode, selected, toggle, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoadmapSelection(): SelectionCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRoadmapSelection must be used within RoadmapSelectionProvider");
  return v;
}
