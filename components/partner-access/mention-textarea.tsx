"use client";

import { useRef, useState } from "react";

/**
 * A textarea with lightweight @mention autocomplete for room chat. Typing "@"
 * followed by letters opens a candidate dropdown (room members + "Team");
 * picking inserts the full name. Enter (no shift) submits unless the dropdown
 * is open, in which case Enter accepts the highlighted candidate.
 */
export function MentionTextarea({
  value,
  onChange,
  onSubmit,
  candidates,
  placeholder,
  ariaLabel,
  className,
  rows = 2,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  candidates: string[];
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [anchor, setAnchor] = useState(0);

  const matches = open
    ? candidates
        .filter((c) => c.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : [];

  function recompute(text: string, caret: number) {
    const upto = text.slice(0, caret);
    const m = /(^|\s)@([\p{L}\d'’.-]*)$/u.exec(upto);
    if (m) {
      setOpen(true);
      setQuery(m[2]);
      setActive(0);
      setAnchor(caret - m[2].length - 1); // position of the '@'
    } else {
      setOpen(false);
    }
  }

  function pick(name: string) {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, anchor);
    const after = value.slice(caret);
    const next = `${before}@${name} ${after}`;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      const pos = before.length + name.length + 2;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative flex-1">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          recompute(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (open && matches.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(matches[active]);
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute bottom-full z-10 mb-1 w-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)] shadow-md">
          {matches.map((name, i) => (
            <li key={name}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(name);
                }}
                className={`block w-full px-3 py-1.5 text-left text-sm ${
                  i === active ? "bg-[var(--secondary)]" : "hover:bg-[var(--secondary)]"
                }`}
              >
                @{name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Render a message body with @mentions emphasized. */
export function renderWithMentions(body: string) {
  const parts = body.split(/(@[\p{L}\d'’.-]+)/u);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="font-medium text-[var(--primary)]">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
