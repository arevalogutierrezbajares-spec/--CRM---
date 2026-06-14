"use client";

/**
 * Fast date control — a formatted pill that opens a lightweight popover:
 *   • a text box you type into (5/20, eta:5/20, +2w, today) with a live preview
 *   • quick picks (Today, +1w, +2w, +1mo, Clear)
 *   • a compact, custom month mini-calendar (not the native OS picker)
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmtChip, fmtFull, parseSmartDate, toIso } from "@/lib/roadmap-dates";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthMatrix(view: Date): Array<Array<Date | null>> {
  const first = new Date(view.getFullYear(), view.getMonth(), 1);
  const startDow = first.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function DateField({
  value,
  onChange,
  placeholder = "set date",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [view, setView] = useState<Date>(() =>
    value ? new Date(value + "T00:00:00") : new Date(),
  );
  const ref = useRef<HTMLDivElement>(null);
  const preview = text.trim() ? parseSmartDate(text) : null;
  const todayIso = toIso(new Date());

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) commitTextThenClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);

  const choose = (iso: string | null) => {
    onChange(iso);
    setText("");
    setOpen(false);
  };
  const commitTextThenClose = () => {
    if (text.trim()) {
      const iso = parseSmartDate(text);
      if (iso) onChange(iso);
    }
    setText("");
    setOpen(false);
  };
  const relative = (fn: (d: Date) => void) => {
    const d = new Date();
    fn(d);
    choose(toIso(d));
  };

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setText("");
          setView(value ? new Date(value + "T00:00:00") : new Date());
        }}
        className={`rounded-full border px-2 py-0.5 text-[12px] tabular-nums transition-colors ${value ? "text-text-primary" : "text-text-tertiary"} hover:border-text-tertiary`}
        style={{ borderColor: "var(--border-default)" }}
      >
        {fmtChip(value) ?? placeholder}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-[230px] rounded-lg border bg-card p-2 shadow-xl"
          style={{ borderColor: "var(--border-default)" }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (preview) choose(preview);
              } else if (e.key === "Escape") {
                setText("");
                setOpen(false);
              }
            }}
            placeholder="type 5/20, +2w, today…"
            className="w-full rounded border bg-surface px-2 py-1 text-[12.5px] outline-none"
            style={{ borderColor: "var(--border-default)" }}
          />
          <div className="mt-1 h-4 text-tiny">
            {text.trim() ? (
              preview ? (
                <span className="text-[var(--green-mid)]">→ {fmtFull(preview)}</span>
              ) : (
                <span className="text-[var(--red-mid)]">unrecognized date</span>
              )
            ) : (
              <span className="text-text-tertiary">Enter to set · or pick below</span>
            )}
          </div>

          {/* quick picks */}
          <div className="mt-1 flex flex-wrap gap-1">
            {[
              ["Today", () => relative(() => {})],
              ["+1w", () => relative((d) => d.setDate(d.getDate() + 7))],
              ["+2w", () => relative((d) => d.setDate(d.getDate() + 14))],
              ["+1mo", () => relative((d) => d.setMonth(d.getMonth() + 1))],
            ].map(([label, fn]) => (
              <button
                key={label as string}
                type="button"
                onClick={fn as () => void}
                className="rounded border px-1.5 py-0.5 text-[11px] text-text-secondary hover:text-text-primary hover:bg-surface"
                style={{ borderColor: "var(--border-default)" }}
              >
                {label as string}
              </button>
            ))}
            {value && (
              <button
                type="button"
                onClick={() => choose(null)}
                className="rounded border px-1.5 py-0.5 text-[11px] text-text-tertiary hover:text-[var(--red-mid)]"
                style={{ borderColor: "var(--border-default)" }}
              >
                Clear
              </button>
            )}
          </div>

          {/* compact month calendar */}
          <div className="mt-2">
            <div className="flex items-center justify-between px-0.5 mb-1">
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
                className="text-text-tertiary hover:text-text-primary"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[12px] font-medium">
                {view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
                className="text-text-tertiary hover:text-text-primary"
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="text-[10px] text-text-tertiary">
                  {w}
                </div>
              ))}
              {monthMatrix(view).flat().map((d, i) => {
                if (!d) return <div key={i} />;
                const iso = toIso(d);
                const isSel = iso === value;
                const isToday = iso === todayIso;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => choose(iso)}
                    className="grid place-items-center h-6 rounded text-[11.5px] tabular-nums hover:bg-surface"
                    style={
                      isSel
                        ? { background: "var(--blue-mid)", color: "#fff" }
                        : isToday
                          ? { boxShadow: "inset 0 0 0 1px var(--blue-mid)" }
                          : undefined
                    }
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
