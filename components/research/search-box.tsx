"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";

export function SearchBox() {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(sp.get("q") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(sp.toString());
    if (value) next.set("q", value);
    else next.delete("q");
    startTransition(() => router.push(`/research?${next.toString()}`));
  }

  function clear() {
    setValue("");
    const next = new URLSearchParams(sp.toString());
    next.delete("q");
    startTransition(() => router.push(`/research?${next.toString()}`));
  }

  return (
    <form onSubmit={submit} className="relative flex-1 max-w-md">
      <Search
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search notes…"
        className="w-full rounded-md border bg-card px-9 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-5 w-5 place-items-center rounded text-text-tertiary hover:bg-surface"
          aria-label="Clear search"
        >
          <X size={11} />
        </button>
      )}
      {pending && (
        <span className="absolute right-7 top-1/2 -translate-y-1/2 text-tiny text-text-tertiary">
          …
        </span>
      )}
    </form>
  );
}
