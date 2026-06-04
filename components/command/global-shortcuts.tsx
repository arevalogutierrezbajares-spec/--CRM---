"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { GO_TO, GLOBAL_KEYS, isTypingTarget } from "@/lib/shortcuts";
import { openCommandPalette } from "./command-palette";

/**
 * App-wide keyboard shortcuts: `g`-then-key go-to navigation, `c`/`/` to open
 * the palette, and `?` for the cheat-sheet. Mouse/typing contexts are never
 * hijacked. ⌘K is owned by the palette itself.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const [overlay, setOverlay] = useState(false);
  const gMode = useRef(false);
  const gTimer = useRef<number | null>(null);

  useEffect(() => {
    function clearG() {
      gMode.current = false;
      if (gTimer.current) window.clearTimeout(gTimer.current);
      gTimer.current = null;
    }

    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // ⌘K etc. handled elsewhere

      if (gMode.current) {
        const k = e.key.toLowerCase();
        const target = GO_TO.find((g) => g.keys === k || g.keys === e.key);
        clearG();
        if (target) {
          e.preventDefault();
          router.push(target.href);
        }
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setOverlay(true);
      } else if (e.key === "Escape") {
        setOverlay(false);
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        gMode.current = true;
        gTimer.current = window.setTimeout(clearG, 1500);
      } else if (e.key === "c" || e.key === "C" || e.key === "/") {
        // Don't stack the palette over the shortcuts overlay or any open dialog
        // (the overlay + Radix dialogs carry aria-modal / data-state=open).
        if (document.querySelector('[aria-modal="true"],[role="dialog"][data-state="open"]')) return;
        e.preventDefault();
        openCommandPalette();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearG();
    };
  }, [router]);

  if (!overlay) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
      onClick={() => setOverlay(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-[min(560px,96vw)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
          <span className="text-[13px] font-semibold text-text-primary">Keyboard shortcuts</span>
          <button type="button" onClick={() => setOverlay(false)} aria-label="Close" className="rounded p-1 text-text-tertiary hover:text-text-primary">
            <X size={15} />
          </button>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-tiny font-medium uppercase tracking-wide text-text-tertiary">Global</div>
            <ul className="space-y-1.5">
              {GLOBAL_KEYS.map((s) => (
                <li key={s.keys} className="flex items-baseline gap-2 text-[12.5px] text-text-secondary">
                  <kbd className="shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-primary">{s.keys}</kbd>
                  <span>{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-1.5 text-tiny font-medium uppercase tracking-wide text-text-tertiary">Go to (press G then…)</div>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {GO_TO.map((g) => (
                <li key={g.href} className="flex items-baseline gap-2 text-[12.5px] text-text-secondary">
                  <kbd className="shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-primary">{g.keys.toUpperCase()}</kbd>
                  <span className="truncate">{g.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
