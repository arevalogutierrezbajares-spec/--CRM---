"use client";

/**
 * Tech Board — a roadmap-style enhancement list for one product. Add/triage
 * enhancements (Idea → Planned → Building → Shipped), set priority, link to a
 * roadmap initiative, and see everything from the roadmap tagged this product.
 * Items captured via #func tags show a source backlink.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, Plus, X } from "lucide-react";
import { productMeta, type ProductId } from "@/lib/products";
import {
  createEnhancement,
  deleteEnhancement,
  updateEnhancement,
} from "@/app/(app)/tech/actions";
import type { ProductRoadmapItem } from "@/db/queries/enhancements";

export type EnhancementDTO = {
  id: string;
  title: string;
  detail: string | null;
  status: string;
  priority: string;
  source: string;
  sourceLabel: string | null;
  sourceUrl: string | null;
  linkedInitiativeId: string | null;
  linkedInitiativeTitle: string | null;
  linkedMilestoneTitle: string | null;
};

const STATUS_ORDER = ["idea", "planned", "building", "shipped", "declined"] as const;
const STATUS_META: Record<string, { label: string; color: string }> = {
  idea: { label: "Ideas", color: "var(--text-tertiary)" },
  planned: { label: "Planned", color: "var(--blue-mid)" },
  building: { label: "Building", color: "var(--amber-mid)" },
  shipped: { label: "Shipped", color: "var(--green-mid)" },
  declined: { label: "Declined", color: "var(--red-mid)" },
};
const PRIORITY_META: Record<string, { label: string; color: string }> = {
  now: { label: "Now", color: "var(--red-mid)" },
  next: { label: "Next", color: "var(--blue-mid)" },
  later: { label: "Later", color: "var(--text-tertiary)" },
};
const PRIORITY_CYCLE = ["now", "next", "later"];
const SOURCE_LABEL: Record<string, string> = {
  townhall: "Town Hall",
  doc: "Doc",
  mcp: "MCP",
  action_item: "Action item",
  manual: "Manual",
  roadmap: "Roadmap",
};

export function TechBoard({
  product,
  enhancements: initial,
  roadmapItems,
  initiatives,
}: {
  product: ProductId;
  enhancements: EnhancementDTO[];
  roadmapItems: ProductRoadmapItem[];
  initiatives: Array<{ id: string; title: string }>;
}) {
  const [items, setItems] = useState<EnhancementDTO[]>(initial);
  const [draft, setDraft] = useState("");
  const [draftPriority, setDraftPriority] = useState("next");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const meta = productMeta(product)!;

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    const temp: EnhancementDTO = {
      id: `__tmp_${Math.random().toString(36).slice(2)}`,
      title,
      detail: null,
      status: "idea",
      priority: draftPriority,
      source: "manual",
      sourceLabel: null,
      sourceUrl: null,
      linkedInitiativeId: null,
      linkedInitiativeTitle: null,
      linkedMilestoneTitle: null,
    };
    setItems((p) => [temp, ...p]);
    startTransition(async () => {
      const r = await createEnhancement({ product, title, priority: draftPriority });
      if (r.id) setItems((p) => p.map((x) => (x.id === temp.id ? { ...x, id: r.id! } : x)));
      router.refresh();
    });
  };

  const patch = (id: string, p: Partial<EnhancementDTO>, server: Parameters<typeof updateEnhancement>[1]) => {
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));
    startTransition(async () => {
      await updateEnhancement(id, server);
      router.refresh();
    });
  };
  const remove = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    startTransition(async () => {
      await deleteEnhancement(id);
      router.refresh();
    });
  };

  const grouped = useMemo(() => {
    const byStatus = new Map<string, EnhancementDTO[]>();
    for (const s of STATUS_ORDER) byStatus.set(s, []);
    for (const e of items) (byStatus.get(e.status) ?? byStatus.get("idea")!).push(e);
    // priority sort within a status
    const rank = (p: string) => PRIORITY_CYCLE.indexOf(p);
    for (const arr of byStatus.values()) arr.sort((a, b) => rank(a.priority) - rank(b.priority));
    return byStatus;
  }, [items]);

  const summary = useMemo(() => {
    const open = items.filter((e) => e.status !== "shipped" && e.status !== "declined").length;
    const captured = items.filter((e) => e.source !== "manual").length;
    const now = items.filter((e) => e.priority === "now" && e.status !== "shipped").length;
    return { total: items.length, open, captured, now };
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div
        className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border bg-card px-4 py-2.5"
        style={{ borderColor: "var(--border-default)" }}
      >
        <Stat n={summary.total} label="enhancements" color={meta.color} />
        <Stat n={summary.open} label="open" />
        <Stat n={summary.now} label="priority now" tone={summary.now ? "red" : undefined} />
        <Stat n={summary.captured} label="captured via #func" />
        <span className="ml-auto text-tiny text-text-tertiary">
          Capture anywhere with <code className="text-[11px]">#{meta.hashtag}</code>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Enhancements */}
        <div className="space-y-4">
        {/* Add */}
        <div className="flex items-center gap-2 rounded-lg border bg-card p-2" style={{ borderColor: "var(--border-default)" }}>
          <Plus size={15} style={{ color: meta.color }} className="shrink-0" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={`Add an enhancement for ${meta.label}…`}
            className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:text-text-tertiary"
          />
          <PriorityChip value={draftPriority} onChange={setDraftPriority} />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="rounded-md px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-40"
            style={{ background: meta.color }}
          >
            Add
          </button>
        </div>

        {STATUS_ORDER.map((status) => {
          const arr = grouped.get(status) ?? [];
          if (status === "declined" && arr.length === 0) return null;
          const sm = STATUS_META[status];
          return (
            <section key={status}>
              <div className="mb-1 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: sm.color }} />
                <h3 className="text-[13px] font-semibold text-text-primary">{sm.label}</h3>
                <span className="rounded-full bg-surface px-1.5 py-px text-tiny tabular-nums text-text-secondary">{arr.length}</span>
              </div>
              {arr.length === 0 ? (
                <p className="px-1 pb-2 text-tiny text-text-tertiary">Nothing here yet.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--border-default)" }}>
                  {arr.map((e, i) => (
                    <Row
                      key={e.id}
                      e={e}
                      first={i === 0}
                      initiatives={initiatives}
                      onTitle={(t) => patch(e.id, { title: t }, { title: t })}
                      onDetail={(d) => patch(e.id, { detail: d }, { detail: d })}
                      onPriority={(pr) => patch(e.id, { priority: pr }, { priority: pr as never })}
                      onStatus={(st) => patch(e.id, { status: st }, { status: st as never })}
                      onLink={(initId) =>
                        patch(
                          e.id,
                          { linkedInitiativeId: initId, linkedInitiativeTitle: initiatives.find((x) => x.id === initId)?.title ?? null },
                          { linkedInitiativeId: initId },
                        )
                      }
                      onRemove={() => remove(e.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Roadmap linkage panel */}
      <aside className="space-y-2">
        <div className="rounded-lg border bg-card p-3" style={{ borderColor: "var(--border-default)" }}>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">
            From the roadmap · {meta.label}
          </h3>
          {roadmapItems.length === 0 ? (
            <p className="text-tiny text-text-tertiary">
              No roadmap deliverables tagged {meta.label} yet. Tag them with the project chip in the roadmap.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {roadmapItems.map((r) => (
                <li key={r.id} className="text-[12.5px]">
                  <div className="flex items-start gap-1.5">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.status === "done" ? "var(--green-mid)" : "var(--blue-mid)" }} />
                    <div className="min-w-0">
                      <div className="truncate text-text-primary">{r.title}</div>
                      <div className="truncate text-tiny text-text-tertiary">
                        {r.initiativeTitle ?? "—"}
                        {r.dueDate ? ` · ${new Date(r.dueDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                        {r.project === "all" ? " · all" : ""}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <a href="/roadmap" className="mt-2 inline-flex items-center gap-1 text-tiny text-text-secondary hover:text-text-primary">
            Open roadmap <ExternalLink size={11} />
          </a>
        </div>
      </aside>
      </div>
    </div>
  );
}

function Stat({ n, label, tone, color }: { n: number; label: string; tone?: "red"; color?: string }) {
  const c = tone === "red" ? "var(--red-mid)" : color ?? "var(--text-primary)";
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[16px] font-semibold tabular-nums" style={{ color: c }}>{n}</span>
      <span className="text-[12px] text-text-tertiary">{label}</span>
    </span>
  );
}

function PriorityChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const m = PRIORITY_META[value] ?? PRIORITY_META.next;
  return (
    <button
      type="button"
      onClick={() => onChange(PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(value) + 1) % PRIORITY_CYCLE.length])}
      title="Cycle priority"
      className="shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-semibold"
      style={{ borderColor: m.color, color: m.color }}
    >
      {m.label}
    </button>
  );
}

function Row({
  e,
  first,
  initiatives,
  onTitle,
  onDetail,
  onPriority,
  onStatus,
  onLink,
  onRemove,
}: {
  e: EnhancementDTO;
  first: boolean;
  initiatives: Array<{ id: string; title: string }>;
  onTitle: (t: string) => void;
  onDetail: (d: string | null) => void;
  onPriority: (p: string) => void;
  onStatus: (s: string) => void;
  onLink: (initId: string | null) => void;
  onRemove: () => void;
}) {
  const [title, setTitle] = useState(e.title);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(e.detail ?? "");
  const srcMuted = e.source !== "manual";
  return (
    <div style={{ borderTop: first ? undefined : "1px solid var(--border-default)" }}>
    <div className="group flex flex-wrap items-center gap-2 px-2.5 py-1.5 hover:bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={e.detail ? "Show/hide detail" : "Add detail"}
        className="shrink-0 text-text-tertiary hover:text-text-primary"
      >
        <ChevronRight size={13} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s", color: e.detail ? "var(--blue-mid)" : undefined }} />
      </button>
      <PriorityChip value={e.priority} onChange={onPriority} />
      <input
        value={title}
        onChange={(ev) => setTitle(ev.target.value)}
        onBlur={() => title.trim() && title !== e.title && onTitle(title.trim())}
        className="min-w-[8rem] flex-1 bg-transparent text-[13px] text-text-primary outline-none"
      />
      {srcMuted && (
        <span
          title={`Captured from ${SOURCE_LABEL[e.source] ?? e.source}${e.sourceLabel ? `: ${e.sourceLabel}` : ""}`}
          className="shrink-0 rounded-full border px-1.5 py-px text-[10px] text-text-tertiary"
          style={{ borderColor: "var(--border-default)" }}
        >
          {e.sourceUrl ? (
            <a href={e.sourceUrl} className="hover:underline" target="_blank" rel="noreferrer">
              {SOURCE_LABEL[e.source] ?? e.source}
            </a>
          ) : (
            (SOURCE_LABEL[e.source] ?? e.source)
          )}
        </span>
      )}
      {/* roadmap link */}
      <select
        value={e.linkedInitiativeId ?? ""}
        onChange={(ev) => onLink(ev.target.value || null)}
        title="Link to a roadmap milestone"
        className="shrink-0 max-w-[140px] truncate rounded border bg-card px-1 py-0.5 text-[11px] text-text-secondary"
        style={{ borderColor: "var(--border-default)" }}
      >
        <option value="">Link roadmap…</option>
        {initiatives.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
          </option>
        ))}
      </select>
      {/* status */}
      <select
        value={e.status}
        onChange={(ev) => onStatus(ev.target.value)}
        className="shrink-0 rounded border bg-card px-1 py-0.5 text-[11px] text-text-secondary"
        style={{ borderColor: "var(--border-default)" }}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {STATUS_META[s].label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        title="Delete"
        className="shrink-0 text-text-tertiary hover:text-[var(--red-mid)] opacity-0 group-hover:opacity-100"
      >
        <X size={13} />
      </button>
    </div>
      {open && (
        <div className="px-2.5 pb-2 pl-9">
          <textarea
            value={detail}
            onChange={(ev) => setDetail(ev.target.value)}
            onBlur={() => detail !== (e.detail ?? "") && onDetail(detail.trim() || null)}
            placeholder="Add detail / context…"
            rows={2}
            className="w-full rounded border bg-card px-2 py-1 text-[12.5px] outline-none placeholder:text-text-tertiary"
            style={{ borderColor: "var(--border-default)" }}
          />
        </div>
      )}
    </div>
  );
}
