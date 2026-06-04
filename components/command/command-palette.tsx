"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { toast } from "sonner";
import {
  Plus,
  Megaphone,
  LayoutGrid,
  CornerDownLeft,
  Search,
} from "lucide-react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { quickCaptureAction } from "@/app/(app)/dashboard/item-actions";
import { createPostAction } from "@/app/(app)/town-hall/actions";
import { paletteProjectsAction } from "@/app/(app)/dashboard/palette-actions";

const OPEN_EVENT = "open-command-palette";

/** Dispatch to open the palette from anywhere (e.g. the topbar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);

  // ⌘K / Ctrl-K + the custom open event.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // Lazy-load projects when first opened (setState in async callback — lint-safe).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    paletteProjectsAction()
      .then((p) => !cancelled && setProjects(p))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  async function capture() {
    if (!query.trim() || busy) return;
    setBusy(true);
    const res = await quickCaptureAction({ text: query });
    setBusy(false);
    if (res.ok) {
      toast.success(res.summary, { duration: 1800 });
      close();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function post() {
    if (!query.trim() || busy) return;
    setBusy(true);
    const res = await createPostAction({ body: query.trim() });
    setBusy(false);
    if (res.ok) {
      toast.success("Posted to Town Hall");
      close();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  const q = query.trim().toLowerCase();
  const navMatches = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 6);
  const projMatches = (q ? projects.filter((p) => p.title.toLowerCase().includes(q)) : projects).slice(0, 6);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      label="Command palette"
      shouldFilter={false}
      className="fixed left-1/2 top-[18%] z-[100] w-[min(560px,94vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
        <Search size={15} className="text-text-tertiary" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Capture a to-do, post to Town Hall, or jump to…"
          className="h-11 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <kbd className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">esc</kbd>
      </div>

      <Command.List className="max-h-[340px] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-tiny text-text-tertiary">
          Type to capture a to-do or search.
        </Command.Empty>

        {query.trim() && (
          <Command.Group heading="Create" className="text-tiny text-text-tertiary [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
            <PaletteItem icon={Plus} onSelect={capture} disabled={busy}>
              Add to-do: <span className="text-text-primary">“{query.trim()}”</span>
              <Hint>parses dates · @people · #project</Hint>
            </PaletteItem>
            <PaletteItem icon={Megaphone} onSelect={post} disabled={busy}>
              Post to Town Hall: <span className="text-text-primary">“{query.trim()}”</span>
            </PaletteItem>
          </Command.Group>
        )}

        {projMatches.length > 0 && (
          <Command.Group heading="Projects" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-tiny [&_[cmdk-group-heading]]:text-text-tertiary">
            {projMatches.map((p) => (
              <PaletteItem key={p.id} icon={LayoutGrid} onSelect={() => { router.push(`/projects/${p.id}`); close(); }}>
                {p.title}
              </PaletteItem>
            ))}
          </Command.Group>
        )}

        {navMatches.length > 0 && (
          <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-tiny [&_[cmdk-group-heading]]:text-text-tertiary">
            {navMatches.map((n) => (
              <PaletteItem key={n.href} icon={n.icon} onSelect={() => { router.push(n.href); close(); }}>
                {n.label}
              </PaletteItem>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function PaletteItem({
  icon: Icon,
  onSelect,
  disabled,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      disabled={disabled}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[13px] text-text-secondary data-[selected=true]:bg-surface data-[selected=true]:text-text-primary"
    >
      <Icon size={15} className="shrink-0 text-text-tertiary" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <CornerDownLeft size={12} className="shrink-0 text-text-tertiary opacity-0 data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="ml-1.5 text-tiny text-text-tertiary">· {children}</span>;
}
