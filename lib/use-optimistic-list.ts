"use client";

import { useOptimistic } from "react";

/** An update applied optimistically to a list of id'd items. */
export type ListUpdate<T> =
  | { kind: "remove"; id: string }
  | { kind: "add"; item: T; prepend?: boolean }
  | { kind: "patch"; id: string; patch: Partial<T> };

/** Pure reducer (exported for testing). */
export function listReducer<T extends { id: string }>(state: T[], u: ListUpdate<T>): T[] {
  switch (u.kind) {
    case "remove":
      return state.filter((x) => x.id !== u.id);
    case "add":
      return u.prepend ? [u.item, ...state] : [...state, u.item];
    case "patch":
      return state.map((x) => (x.id === u.id ? { ...x, ...u.patch } : x));
    default:
      return state;
  }
}

/**
 * Optimistic list bound to a server-rendered prop. Dispatch a remove/add/patch
 * inside a `startTransition` (or a server action) for an instant update; when
 * the action's `revalidatePath` streams new props the optimistic state
 * reconciles automatically — and reverts (rolls back) if it doesn't.
 */
export function useOptimisticList<T extends { id: string }>(items: T[]): [T[], (u: ListUpdate<T>) => void] {
  return useOptimistic(items, listReducer<T>);
}
