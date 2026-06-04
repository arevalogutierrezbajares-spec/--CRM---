"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { toast } from "sonner";
import {
  Plus,
  Megaphone,
  LayoutGrid,
  FileText,
  User,
  Target,
  Clock,
  CornerDownLeft,
  Search,
} from "lucide-react";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { GOTO_CHIP } from "@/lib/shortcuts";
import { quickCaptureAction } from "@/app/(app)/dashboard/item-actions";
import { createPostAction } from "@/app/(app)/town-hall/actions";
import { paletteDataAction, type PaletteData, type PaletteEntity } from "@/app/(app)/dashboard/palette-actions";

const OPEN_EVENT = "open-command-palette";

/** Dispatch to open the palette from anywhere (e.g. the topbar search button). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const EMPTY: PaletteData = { recent: [], projects: [], docs: [], people: [], objectives: [] };

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<PaletteData>(EMPTY);

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

  // Lazy-load everything navigable on first open (setState in async callback).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    paletteDataAction()
      .then((d) => !cancelled && setData(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const go = useCallback(
    (href: string) => {
      router.push(href);
      close();
    },
    [router, close],
  );

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
  const match = (e: PaletteEntity) => !q || e.label.toLowerCase().includes(q);
  const navMatches = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(q)).slice(0, 8);

  const projects = q ? data.projects.filter(match).slice(0, 6) : [];
  const docs = q ? data.docs.filter(match).slice(0, 6) : [];
  const people = q ? data.people.filter(match).slice(0, 5) : [];
  const objectives = q ? data.objectives.filter(match).slice(0, 5) : [];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : close())}
      label="Command palette"
      shouldFilter={false}
      className="fixed left-1/2 top-[16%] z-[100] w-[min(600px,94vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3">
        <Search size={15} className="text-text-tertiary" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search anything — or capture a to-do…"
          className="h-11 flex-1 bg-transparent text-[14px] text-text-primary outline-none placeholder:text-text-tertiary"
        />
        <kbd className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-text-tertiary">esc</kbd>
      </div>

      <Command.List className="max-h-[380px] overflow-y-auto p-1.5">
        <Command.Empty className="px-3 py-6 text-center text-tiny text-text-tertiary">
          No matches.
        </Command.Empty>

        {/* Create — always offered when there's text (fallback never dead-ends). */}
        {query.trim() && (
          <Group heading="Create">
            <Row icon={Plus} onSelect={capture} disabled={busy}>
              Add to-do: <span className="text-text-primary">“{query.trim()}”</span>
            </Row>
            <Row icon={Megaphone} onSelect={post} disabled={busy}>
              Post to Town Hall: <span className="text-text-primary">“{query.trim()}”</span>
            </Row>
          </Group>
        )}

        {/* Recents — shown before you type. */}
        {!q && data.recent.length > 0 && (
          <Group heading="Recent">
            {data.recent.map((e) => (
              <Row key={e.id} icon={Clock} onSelect={() => go(e.href)}>{e.label}</Row>
            ))}
          </Group>
        )}

        {projects.length > 0 && (
          <Group heading="Projects">
            {projects.map((e) => (
              <Row key={e.id} icon={LayoutGrid} onSelect={() => go(e.href)}>{e.label}</Row>
            ))}
          </Group>
        )}
        {docs.length > 0 && (
          <Group heading="Documents">
            {docs.map((e) => (
              <Row key={e.id} icon={FileText} sub={e.sub} onSelect={() => go(e.href)}>{e.label}</Row>
            ))}
          </Group>
        )}
        {people.length > 0 && (
          <Group heading="People">
            {people.map((e) => (
              <Row key={e.id} icon={User} sub={e.sub} onSelect={() => go(e.href)}>{e.label}</Row>
            ))}
          </Group>
        )}
        {objectives.length > 0 && (
          <Group heading="Priorities">
            {objectives.map((e) => (
              <Row key={e.id} icon={Target} sub={e.sub} onSelect={() => go(e.href)}>{e.label}</Row>
            ))}
          </Group>
        )}

        {navMatches.length > 0 && (
          <Group heading="Go to">
            {navMatches.map((n) => (
              <Row key={n.href} icon={n.icon} chip={GOTO_CHIP[n.href]} onSelect={() => go(n.href)}>
                {n.label}
              </Row>
            ))}
          </Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-tiny [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-text-tertiary"
    >
      {children}
    </Command.Group>
  );
}

function Row({
  icon: Icon,
  onSelect,
  disabled,
  sub,
  chip,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onSelect: () => void;
  disabled?: boolean;
  sub?: string;
  chip?: string;
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
      {sub && <span className="shrink-0 truncate text-tiny text-text-tertiary">{sub}</span>}
      {chip ? (
        <kbd className="shrink-0 rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">{chip}</kbd>
      ) : (
        <CornerDownLeft size={12} className="shrink-0 text-text-tertiary opacity-0 data-[selected=true]:opacity-100" />
      )}
    </Command.Item>
  );
}
