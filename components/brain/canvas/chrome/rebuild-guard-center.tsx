"use client";

/**
 * Search-first rebuild-guard (Wave 3 — always on).
 *
 * L0 hero dock when portfolio + no selection + system axis.
 * Slim top bar at every other altitude so search is a habit, not a mode.
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
import { parseBrainUrl } from "@/lib/brain/url-state";
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

  // Hero = full dock copy; everywhere else = slim always-on bar.
  const hero =
    view.level === 0 && view.selection == null && view.axis === "system";
  const slim = !hero;

  // Prefill from ?q= once on mount (shareable rebuild-guard links).
  useEffect(() => {
    const { q } = parseBrainUrl(window.location.search);
    if (q) setQuery(q);
    setRecent(loadRecentSearches());
  }, []);

  useEffect(() => {
    setRecent(loadRecentSearches());
  }, [view.level, view.axis]);

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

  // `/` focuses search when not already in an input (habit shortcut).
  useEffect(() => {
    function onSlash(e: KeyboardEvent | globalThis.KeyboardEvent) {
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
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onSlash);
    return () => window.removeEventListener("keydown", onSlash);
  }, []);

  const showSafe = result && result.safeToBuild && query.trim().length >= 2;
  const showHits = result && result.matches.length > 0;

  return (
    <div
      className={`brain-rg${slim ? " brain-rg--slim" : ""}${
        focused || query ? " brain-rg--hot" : ""
      }${reduceMotion ? " brain-rg--static" : ""}`}
      role="search"
      aria-label="Rebuild-guard search"
    >
      {!slim ? <div className="brain-rg__glow" aria-hidden /> : null}
      {!slim ? (
        <header className="brain-rg__head">
          <span className="brain-rg__eyebrow">Rebuild-guard</span>
          <h2 className="brain-rg__title">Does it already exist?</h2>
          <p className="brain-rg__sub">
            Search the live portfolio map before you build. Deterministic — no
            AI.
          </p>
        </header>
      ) : null}

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
          placeholder={
            slim
              ? "Search map… (routes, wires, domains)"
              : "Route, domain, wire, table…"
          }
          aria-autocomplete="list"
          aria-controls="brain-rg-results"
          aria-expanded={Boolean(showHits)}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="brain-rg__kbd">{slim ? "/" : "↵"}</kbd>
      </form>

      {!query.trim() && !slim ? (
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
                  <span className="brain-rg__hit-kind">
                    {KIND_LABEL[hit.kind]}
                  </span>
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
            ?
          </div>
          <div>
            <p className="brain-rg__safe-title">Verify before building</p>
            <p className="brain-rg__safe-body">{safeToBuildMessage(query)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
