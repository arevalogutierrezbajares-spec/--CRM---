"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { User, FolderGit2, FileText, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { detectTrigger, spliceToken } from "@/lib/nlp/mention-trigger";
import { personToken, refToken } from "@/lib/nlp/mention-tokens";
import type { MemberOption, RefObject } from "@/components/town-hall/types";

export type MentionSources = {
  people: MemberOption[];
  projects: RefObject[];
  docs: RefObject[];
};

export type PickedEntity =
  | { kind: "person"; userId: string; label: string }
  | { kind: "ref"; ref: RefObject }
  | { kind: "all" };

type Sugg =
  | { section: "Everyone" }
  | { section: "People"; person: MemberOption }
  | { section: "Documents"; ref: RefObject }
  | { section: "Projects"; ref: RefObject };

const SECTION_ICON = { Everyone: Users, People: User, Documents: FileText, Projects: FolderGit2 } as const;
const MAX = 8;

/**
 * Controlled input/textarea with an at-caret @/# autocomplete and full keyboard
 * navigation. `@` suggests people + documents, `#` suggests projects. ↑/↓ move
 * the active option, Enter/Tab pick it, Esc closes; with the menu closed Enter
 * (single-line) or ⌘/Ctrl+Enter (multiline) calls `onSubmit`. Resolved picks are
 * reported via `onPick` so callers don't have to re-parse the text.
 */
export function MentionInput({
  value,
  onChange,
  sources,
  onPick,
  onSubmit,
  onKeyDown: onKeyDownPassthrough,
  onBlur,
  multiline = false,
  placeholder,
  autoFocus,
  rows = 3,
  disabled,
  className,
  inputClassName,
  inputProps,
  submitCompletedToken = false,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  sources: MentionSources;
  onPick?: (e: PickedEntity) => void;
  onSubmit?: () => void;
  /**
   * When true, pressing Enter on an *already fully-typed* token (e.g. you typed
   * "@all" and the menu's active option is exactly "@all") does NOT re-pick —
   * it falls through so the host can commit. Makes "@all⏎" a one-press action
   * in the roadmap editors while still completing partial queries ("@al⏎").
   */
  submitCompletedToken?: boolean;
  /**
   * Forwarded keydown for keys the autocomplete menu did NOT consume. Lets a
   * host (e.g. the roadmap outline) keep its own Enter/Tab/Arrow navigation
   * while the menu still owns those keys when open.
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  multiline?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  inputProps?: React.HTMLAttributes<HTMLInputElement | HTMLTextAreaElement> &
    Record<`data-${string}`, string>;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const uid = useId();
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  // Trigger-start at which Esc dismissed the menu; the menu stays hidden only
  // while the caret sits on that same trigger, and reopens on any other trigger
  // or on the next edit (so caret moves after Esc aren't stuck closed).
  const [dismissedStart, setDismissedStart] = useState<number | null>(null);

  const trigger = useMemo(() => detectTrigger(value, caret), [value, caret]);

  const suggestions = useMemo<Sugg[]>(() => {
    if (!trigger) return [];
    const q = trigger.query.toLowerCase();
    if (trigger.kind === "@") {
      // "@all" broadcast option — surfaced for an empty query or an all/everyone/team prefix.
      const everyone: Sugg[] =
        q === "" || "all".startsWith(q) || "everyone".startsWith(q) || "team".startsWith(q)
          ? [{ section: "Everyone" }]
          : [];
      // Reserve slots for docs so a query matching many people doesn't starve
      // them out entirely.
      const people = sources.people
        .filter((m) => m.displayName.toLowerCase().includes(q))
        .slice(0, 5)
        .map((person): Sugg => ({ section: "People", person }));
      const docs = sources.docs
        .filter((d) => d.label.toLowerCase().includes(q))
        .slice(0, MAX - people.length)
        .map((ref): Sugg => ({ section: "Documents", ref }));
      return [...everyone, ...people, ...docs];
    }
    return sources.projects
      .filter((p) => p.label.toLowerCase().includes(q))
      .slice(0, MAX)
      .map((ref): Sugg => ({ section: "Projects", ref }));
  }, [trigger, sources]);

  const dismissed = dismissedStart !== null && trigger != null && trigger.start === dismissedStart;
  const showMenu = !dismissed && suggestions.length > 0;
  const activeIdx = Math.min(active, suggestions.length - 1);

  const syncCaret = useCallback(() => {
    const el = ref.current;
    if (el) setCaret(el.selectionStart ?? 0);
  }, []);

  const pick = useCallback(
    (s: Sugg) => {
      if (!trigger) return;
      const token =
        s.section === "Everyone"
          ? "@all"
          : s.section === "People"
            ? personToken(s.person.displayName)
            : refToken(trigger.kind, s.ref.label);
      const { next, caret: newCaret } = spliceToken(value, trigger.start, caret, token);
      onChange(next);
      // Advance the caret synchronously (not only in the rAF below) so the
      // memoized `trigger` recomputes against the post-insert text+caret in the
      // SAME render — otherwise a stale caret keeps detecting the old @token and
      // the menu stays stuck open after a pick. (FR-E5-3)
      setCaret(newCaret);
      setActive(0);
      setDismissedStart(null);
      if (s.section === "Everyone") onPick?.({ kind: "all" });
      else if (s.section === "People") onPick?.({ kind: "person", userId: s.person.userId, label: s.person.displayName });
      else onPick?.({ kind: "ref", ref: s.ref });
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          el.focus();
          el.setSelectionRange(newCaret, newCaret);
          setCaret(newCaret);
        }
      });
    },
    [trigger, value, caret, onChange, onPick],
  );

  const tokenFor = (s: Sugg): string =>
    s.section === "Everyone"
      ? "@all"
      : s.section === "People"
        ? personToken(s.person.displayName)
        : refToken(trigger?.kind ?? "@", s.ref.label);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (showMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const s = suggestions[activeIdx];
        // If the active token is already fully typed and the host opted in,
        // Enter falls through to commit instead of re-picking (one-press @all).
        const typed = trigger ? value.slice(trigger.start, caret) : "";
        const alreadyComplete =
          submitCompletedToken &&
          e.key === "Enter" &&
          typed.toLowerCase() === tokenFor(s).toLowerCase();
        if (!alreadyComplete) {
          e.preventDefault();
          pick(s);
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissedStart(trigger?.start ?? -1);
        return;
      }
    }
    // Menu didn't capture the key — let the host handle navigation first.
    onKeyDownPassthrough?.(e);
    if (e.defaultPrevented) return;
    // Submit when the menu is not capturing the key.
    const wantSubmit = multiline ? (e.metaKey || e.ctrlKey) && e.key === "Enter" : e.key === "Enter";
    if (wantSubmit && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  const listboxId = `${uid}-listbox`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  const setEl = (el: HTMLInputElement | HTMLTextAreaElement | null) => {
    ref.current = el;
  };

  const shared = {
    ...inputProps,
    value,
    autoFocus,
    placeholder,
    disabled,
    "aria-label": ariaLabel,
    role: "combobox" as const,
    "aria-expanded": showMenu,
    "aria-controls": showMenu ? listboxId : undefined,
    "aria-activedescendant": showMenu ? optionId(activeIdx) : undefined,
    "aria-autocomplete": "list" as const,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      setCaret(e.target.selectionStart ?? 0);
      setActive(0);
      setDismissedStart(null);
    },
    onKeyUp: syncCaret,
    onClick: syncCaret,
    onKeyDown,
    onBlur,
  };

  return (
    <div className={cn("relative", className)}>
      {multiline ? (
        <textarea ref={setEl} {...shared} rows={rows} className={inputClassName} />
      ) : (
        <input ref={setEl} {...shared} type="text" className={inputClassName} />
      )}

      {showMenu && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-md border bg-[var(--popover)] p-1 shadow-lg"
          style={{ borderColor: "var(--border)" }}
        >
          {suggestions.map((s, i) => {
            const header = i === 0 || suggestions[i - 1].section !== s.section ? s.section : null;
            const Icon = SECTION_ICON[s.section];
            const label =
              s.section === "Everyone" ? "Everyone" : s.section === "People" ? s.person.displayName : s.ref.label;
            const key =
              s.section === "Everyone" ? "all" : "person" in s ? s.person.userId : s.ref.refId;
            const prefix = s.section === "Everyone" ? "@all · " : s.section === "People" ? "@" : s.section === "Projects" ? "#" : "";
            const isActive = i === activeIdx;
            return (
              <li key={`${s.section}:${key}`} role="presentation">
                {header && (
                  <div className="px-2 pb-0.5 pt-1 text-tiny font-medium uppercase tracking-wide text-text-tertiary">
                    {header === "Everyone" ? "Broadcast" : header}
                  </div>
                )}
                <button
                  type="button"
                  id={optionId(i)}
                  role="option"
                  aria-selected={isActive}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault() /* keep focus in the input */}
                  onClick={() => pick(s)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px]",
                    isActive ? "bg-surface text-text-primary" : "text-text-secondary",
                  )}
                >
                  <Icon size={13} className="shrink-0 text-text-tertiary" />
                  <span className="min-w-0 flex-1 truncate">
                    <span style={{ color: s.section === "Projects" ? undefined : "var(--blue-text)" }}>{prefix}</span>
                    {s.section === "Everyone" ? "notify the whole team" : label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
