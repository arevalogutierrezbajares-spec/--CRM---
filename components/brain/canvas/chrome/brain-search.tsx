"use client";

/**
 * THE BRAIN — unified rebuild-guard search (CRM-native).
 *
 * Primary: left rail field (never floating center of the graph).
 * Mobile / TopBar: focus via `brain:focus-search` event or variant="topbar".
 * One `/` handler. Lucide Search. Inter UI + mono paths only in hits.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Search,
  SearchX,
  CornerDownRight,
  type LucideIcon,
} from "lucide-react";
import {
  Box,
  Cable,
  FolderTree,
  LayoutGrid,
  Route,
} from "lucide-react";
import { useBrain } from "@/components/brain/canvas/graph-provider";
import {
  BRAIN_SEARCH_EXAMPLES,
  loadRecentSearches,
  pushRecentSearch,
  safeToBuildMessage,
  searchBrain,
  type BrainSearchHit,
} from "@/lib/brain/search";
import { navFromHit } from "@/lib/brain/navigate";
import { parseBrainUrl } from "@/lib/brain/url-state";
import { SYSTEM_ACCENT, type System } from "@/lib/brain/types";

export const BRAIN_FOCUS_SEARCH = "brain:focus-search";

export function focusBrainSearch() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(BRAIN_FOCUS_SEARCH));
  }
}

const KIND_META: Record<
  BrainSearchHit["kind"],
  { label: string; Icon: LucideIcon }
> = {
  system: { label: "System", Icon: LayoutGrid },
  domain: { label: "Domain", Icon: FolderTree },
  surface: { label: "Route", Icon: Route },
  entity: { label: "Table", Icon: Box },
  interchange: { label: "Wire", Icon: Cable },
};

type Variant = "rail" | "topbar";

export function BrainSearch({ variant = "rail" }: { variant?: Variant }) {
  const { graph, view, actions } = useBrain();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isL0Hero =
    view.level === 0 && view.selection == null && view.axis === "system";

  useEffect(() => {
    const { q } = parseBrainUrl(window.location.search);
    if (q) setQuery(q);
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    function onFocus() {
      inputRef.current?.focus();
      setSheetOpen(true);
    }
    window.addEventListener(BRAIN_FOCUS_SEARCH, onFocus);
    return () => window.removeEventListener(BRAIN_FOCUS_SEARCH, onFocus);
  }, []);

  // Single `/` handler for the brain map (only when not typing elsewhere).
  useEffect(() => {
    if (variant !== "rail") return;
    function onSlash(e: globalThis.KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      // Prefer brain when we're on the map page.
      if (!document.querySelector(".brain-root")) return;
      e.preventDefault();
      e.stopPropagation();
      inputRef.current?.focus();
      setSheetOpen(true);
    }
    window.addEventListener("keydown", onSlash, true);
    return () => window.removeEventListener("keydown", onSlash, true);
  }, [variant]);

  const result = useMemo(
    () => (query.trim() ? searchBrain(graph, query, 8) : null),
    [graph, query],
  );

  const jump = useCallback(
    (hit: BrainSearchHit) => {
      pushRecentSearch(query.trim() || hit.label);
      setRecent(loadRecentSearches());
      const steps = navFromHit(graph, hit);
      for (const step of steps) {
        if (step.type === "drill") {
          actions.drillInto({
            nodeId: step.nodeId,
            level: step.level,
            system: step.system,
            domainId: step.domainId,
            fn: step.fn,
          });
        } else {
          actions.select(step.id);
        }
      }
      setQuery("");
      setActive(0);
      setSheetOpen(false);
      inputRef.current?.blur();
    },
    [actions, graph, query],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (result?.matches[active]) jump(result.matches[active]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
        setActive(0);
        return;
      }
      setSheetOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!result?.matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(result.matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    }
  };

  useEffect(() => {
    setActive(0);
  }, [query]);

  // Close results when clicking outside (rail dropdown).
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showSafe = result && result.safeToBuild && query.trim().length >= 2;
  const showHits = result && result.matches.length > 0;
  const showPanel = focused || Boolean(query.trim()) || sheetOpen;

  if (variant === "topbar") {
    return (
      <button
        type="button"
        className="brain-search-chip"
        onClick={() => focusBrainSearch()}
        aria-label="Search portfolio map"
        title="Search map (/)"
      >
        <Search size={14} strokeWidth={2} aria-hidden />
        <span className="brain-search-chip__label">Search map</span>
        <kbd className="brain-search-chip__kbd">/</kbd>
      </button>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`brain-search${focused || query ? " is-hot" : ""}${
        isL0Hero ? " is-hero" : ""
      }`}
      role="search"
      aria-label="Portfolio rebuild-guard search"
    >
      {isL0Hero ? (
        <div className="brain-search__intro">
          <span className="brain-search__eyebrow">Rebuild-guard</span>
          <p className="brain-search__prompt">Does it already exist?</p>
        </div>
      ) : null}

      <form className="brain-search__form" onSubmit={onSubmit}>
        <Search
          className="brain-search__icon"
          size={15}
          strokeWidth={2}
          aria-hidden
        />
        <input
          ref={inputRef}
          id="brain-search-input"
          className="brain-search__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setFocused(true);
            setSheetOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search routes, domains, wires…"
          aria-autocomplete="list"
          aria-controls="brain-search-results"
          aria-expanded={Boolean(showHits && showPanel)}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="brain-search__kbd">/</kbd>
      </form>

      {showPanel && !query.trim() ? (
        <div className="brain-search__empty">
          <p className="brain-search__hint">
            Search the live portfolio before you build. Deterministic — no AI.
          </p>
          <div className="brain-search__chips">
            {BRAIN_SEARCH_EXAMPLES.map((ex) => (
              <button
                key={ex.q}
                type="button"
                className="brain-search__chip"
                onClick={() => {
                  setQuery(ex.q);
                  inputRef.current?.focus();
                }}
              >
                <span className="brain-search__chip-q">{ex.q}</span>
                <span className="brain-search__chip-h">{ex.hint}</span>
              </button>
            ))}
          </div>
          {recent.length > 0 ? (
            <div className="brain-search__recent">
              <span className="brain-search__recent-label">Recent</span>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="brain-search__chip brain-search__chip--ghost"
                  onClick={() => {
                    setQuery(r);
                    inputRef.current?.focus();
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showPanel && showHits ? (
        <ul
          id="brain-search-results"
          className="brain-search__list"
          role="listbox"
        >
          {result!.matches.map((hit, i) => {
            const accent =
              hit.system && hit.system in SYSTEM_ACCENT
                ? SYSTEM_ACCENT[hit.system as System]
                : "var(--caney)";
            const { label, Icon } = KIND_META[hit.kind];
            return (
              <li key={hit.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`brain-search__hit${i === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => jump(hit)}
                  style={{ ["--hit-accent" as string]: accent }}
                >
                  <span className="brain-search__hit-kind">
                    <Icon size={12} strokeWidth={2} aria-hidden />
                    {label}
                  </span>
                  <span className="brain-search__hit-label">{hit.label}</span>
                  <span className="brain-search__hit-path">{hit.path}</span>
                  <CornerDownRight
                    className="brain-search__hit-go"
                    size={12}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showPanel && showSafe ? (
        <div className="brain-search__safe" role="status">
          <SearchX size={16} strokeWidth={2} aria-hidden />
          <div>
            <p className="brain-search__safe-title">Verify before building</p>
            <p className="brain-search__safe-body">
              {safeToBuildMessage(query)}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
