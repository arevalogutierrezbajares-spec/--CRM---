"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

export function ContactsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const initial = sp.get("q") ?? "";
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setValue(sp.get("q") ?? "");
    });
    return () => cancelAnimationFrame(raf);
  }, [sp]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function commit(next: string) {
    const params = new URLSearchParams(sp.toString());
    if (next.trim()) params.set("q", next.trim());
    else params.delete("q");
    const q = params.toString();
    startTransition(() => {
      router.push(q ? `${pathname}?${q}` : pathname);
    });
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(next), 180);
  }

  function clear() {
    setValue("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    commit("");
    inputRef.current?.focus();
  }

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={onChange}
        placeholder="Search name, org, phone, @handle…"
        className="h-9 w-full rounded-md border border-[var(--input)] bg-transparent pl-8 pr-16 text-sm shadow-xs transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        aria-label="Search contacts"
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--muted)]/40 px-1.5 py-0.5 text-[10px] font-mono text-[var(--muted-foreground)] sm:inline-block">
          /
        </kbd>
      )}
    </div>
  );
}
