"use client";

/**
 * Search-first rebuild-guard command center (Area 1).
 *
 * Floating dock on L0 when nothing is selected — the default habit surface.
 * Elite motion, example chips, live results, safe-to-build empty state.
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
import { useReducedMotion } from "framer-motion";
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
import { SYSTEM_ACCENT, type System } from "@/lib/brain/types";

const KIND_LABEL: Record<BrainSearchHit["kind"], string> = {
  system: "System",
  domain: "Domain",
  surface: "Route",
  entity: "Table",
  interchange: "Wire",
};

export function RebuildGuardCenter() {
  const { graph, view, actions } = useBrain();
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [focused, setFocused] = useState(false);

  // Only on portfolio with no selection — command center mode
  const visible =
    view.level === 0 && view.selection == null && view.axis === "system";

  useEffect(() => {
    if (visible) setRecent(loadRecentSearches());
  }, [visible]);

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
          });
        } else {
          actions.select(step.id);
        }
      }
      setQuery("");
      setActive(0);
    },
    [actions, graph, query],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (result?.matches[active]) jump(result.matches[active]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!result?.matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(result.matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Escape") {
      setQuery("");
      setActive(0);
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!visible) return null;

  const showSafe = result && result.safeToBuild && query.trim().length >= 2;
  const showHits = result && result.matches.length > 0;

  return (
    <div
      className={`brain-rg${focused || query ? " brain-rg--hot" : ""}${
        reduceMotion ? " brain-rg--static" : ""
      }`}
      role="search"
      aria-label="Rebuild-guard search"
    >
      <div className="brain-rg__glow" aria-hidden />
      <header className="brain-rg__head">
        <span className="brain-rg__eyebrow">Rebuild-guard</span>
        <h2 className="brain-rg__title">Does it already exist?</h2>
        <p className="brain-rg__sub">
          Search the live portfolio map before you build. Deterministic — no AI.
        </p>
      </header>

      <form className="brain-rg__form" onSubmit={onSubmit}>
        <span className="brain-rg__glyph" aria-hidden>
          ⌕
        </span>
        <input
          ref={inputRef}
          className="brain-rg__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder="Route, domain, wire, table…"
          aria-autocomplete="list"
          aria-controls="brain-rg-results"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="brain-rg__kbd">↵</kbd>
      </form>

      {!query.trim() ? (
        <div className="brain-rg__chips">
          {BRAIN_SEARCH_EXAMPLES.map((ex) => (
            <button
              key={ex.q}
              type="button"
              className="brain-rg__chip"
              onClick={() => {
                setQuery(ex.q);
                inputRef.current?.focus();
              }}
            >
              <span className="brain-rg__chip-q">{ex.q}</span>
              <span className="brain-rg__chip-h">{ex.hint}</span>
            </button>
          ))}
          {recent.length > 0 ? (
            <div className="brain-rg__recent">
              <span className="brain-rg__recent-label">Recent</span>
              {recent.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="brain-rg__chip brain-rg__chip--ghost"
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

      {showHits ? (
        <ul id="brain-rg-results" className="brain-rg__list" role="listbox">
          {result!.matches.map((hit, i) => {
            const accent =
              hit.system && hit.system in SYSTEM_ACCENT
                ? SYSTEM_ACCENT[hit.system as System]
                : "var(--caney)";
            return (
              <li key={hit.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`brain-rg__hit${i === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => jump(hit)}
                  style={{ ["--hit-accent" as string]: accent }}
                >
                  <span className="brain-rg__hit-kind">{KIND_LABEL[hit.kind]}</span>
                  <span className="brain-rg__hit-label">{hit.label}</span>
                  <span className="brain-rg__hit-path">{hit.path}</span>
                  <span className="brain-rg__hit-go" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {showSafe ? (
        <div className="brain-rg__safe" role="status">
          <div className="brain-rg__safe-icon" aria-hidden>
            ✓
          </div>
          <div>
            <p className="brain-rg__safe-title">Safe to build</p>
            <p className="brain-rg__safe-body">{safeToBuildMessage(query)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
