"use client";

/**
 * Demo Links (Platform Management): the launchpad for product demos.
 * Each entry is a deep link (e.g. CaneyCloud's `?guia=demo-rapido` guided
 * tours), the demo-account credentials needed to get in, or both — so
 * "send a demo" is one copy away. Workspace-shared, full CRUD inline,
 * one-click seed of the CaneyCloud tour catalog when empty.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  KeyRound,
  MonitorPlay,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createDemoLinkAction,
  deleteDemoLinkAction,
  seedCaneyDemoLinksAction,
  updateDemoLinkAction,
  type DemoLinkInput,
} from "@/app/(app)/platforms/demo-links-actions";
import type { DemoLinkRow } from "@/db/queries/demo-links";
import { PLATFORMS } from "@/lib/platforms/config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const fieldCls =
  "h-9 w-full rounded-md border bg-transparent px-2.5 text-[13px] text-text-primary outline-none focus:ring-1 focus:ring-[var(--ring)]";
const areaCls =
  "w-full rounded-md border bg-transparent px-2.5 py-2 text-[13px] text-text-primary outline-none focus:ring-1 focus:ring-[var(--ring)]";

const PLATFORM_NAMES: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p.id, p.name]),
);

function platformName(id: string) {
  return PLATFORM_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

async function copyText(value: string, what: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Clipboard blocked by the browser");
  }
}

const EMPTY_FORM: DemoLinkInput = {
  platformId: "caneycloud",
  label: "",
  description: "",
  url: "",
  username: "",
  password: "",
  accessNotes: "",
};

export function DemoLinksSection({ items }: { items: DemoLinkRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DemoLinkInput>(EMPTY_FORM);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(row: DemoLinkRow) {
    setEditingId(row.id);
    setForm({
      platformId: row.platformId,
      label: row.label,
      description: row.description ?? "",
      url: row.url ?? "",
      username: row.username ?? "",
      password: row.password ?? "",
      accessNotes: row.accessNotes ?? "",
    });
    setDialogOpen(true);
  }

  function submit() {
    startTransition(async () => {
      const res = editingId
        ? await updateDemoLinkAction({ id: editingId, ...form })
        : await createDemoLinkAction(form);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(editingId ? "Demo link updated" : "Demo link added");
      setDialogOpen(false);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteDemoLinkAction({ id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Demo link removed");
      router.refresh();
    });
  }

  function seed() {
    startTransition(async () => {
      const res = await seedCaneyDemoLinksAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.added} CaneyCloud demo links added`);
      router.refresh();
    });
  }

  const byPlatform = new Map<string, DemoLinkRow[]>();
  for (const item of items) {
    const list = byPlatform.get(item.platformId) ?? [];
    list.push(item);
    byPlatform.set(item.platformId, list);
  }

  return (
    <section
      className="rounded-lg border bg-card p-4 space-y-4"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[15px] font-medium text-text-primary">
            <MonitorPlay className="h-4 w-4" /> Demo links
          </h2>
          <p className="text-[12px] text-text-secondary">
            Shareable product demos — each entry carries the link, the demo
            account it needs, or both. Send the link; the guided tour starts
            on load.
          </p>
        </div>
        <div className="flex gap-2">
          {!byPlatform.has("caneycloud") && (
            <Button size="sm" variant="outline" onClick={seed} disabled={pending}>
              <Sparkles className="h-3.5 w-3.5" /> Seed CaneyCloud tours
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" /> Add demo
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-[13px] text-text-secondary">
          No demos yet. Seed the CaneyCloud guided tours or add your first
          demo link.
        </p>
      ) : (
        [...byPlatform.entries()].map(([platformId, rows]) => (
          <div key={platformId} className="space-y-2">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
              {platformName(platformId)}
            </h3>
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-md border px-3 py-2.5"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-[13px] font-medium text-text-primary">
                        {row.label}
                      </p>
                      {row.description && (
                        <p className="text-[12px] text-text-secondary">
                          {row.description}
                        </p>
                      )}
                      {(row.username || row.password) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <Badge variant="outline" className="gap-1">
                            <KeyRound className="h-3 w-3" /> demo account
                          </Badge>
                          {row.username && (
                            <button
                              type="button"
                              onClick={() => copyText(row.username!, "Username")}
                              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] text-text-secondary hover:text-text-primary"
                              title="Copy username"
                            >
                              {row.username} <Copy className="h-3 w-3" />
                            </button>
                          )}
                          {row.password && (
                            <button
                              type="button"
                              onClick={() => copyText(row.password!, "Password")}
                              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] text-text-secondary hover:text-text-primary"
                              title="Copy password"
                            >
                              •••••• <Copy className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                      {row.accessNotes && (
                        <p className="text-[11px] italic text-text-secondary">
                          {row.accessNotes}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {row.url && (
                        <>
                          <Button asChild size="sm">
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open demo <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyText(row.url!, "Demo link")}
                            title="Copy demo link"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(row)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <ConfirmDialog
                        trigger={(open) => (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={open}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        title="Delete this demo link?"
                        description="It disappears for the whole workspace."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={() => remove(row.id)}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit demo link" : "Add demo link"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-[12px] text-text-secondary">
                Platform
                <select
                  value={form.platformId}
                  onChange={(e) => setForm({ ...form, platformId: e.target.value })}
                  className={fieldCls}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="space-y-1 text-[12px] text-text-secondary">
                Label *
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className={fieldCls}
                  placeholder="Demo rápido (5 min)"
                />
              </label>
            </div>
            <label className="block space-y-1 text-[12px] text-text-secondary">
              Description
              <input
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={fieldCls}
                placeholder="Who it's for / what it shows"
              />
            </label>
            <label className="block space-y-1 text-[12px] text-text-secondary">
              Demo link
              <input
                value={form.url ?? ""}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className={fieldCls}
                placeholder="https://caneycloud.com/today?guia=demo-rapido"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-[12px] text-text-secondary">
                Demo username
                <input
                  value={form.username ?? ""}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className={fieldCls}
                  placeholder="owner@posadabolivar.example"
                />
              </label>
              <label className="space-y-1 text-[12px] text-text-secondary">
                Demo password
                <input
                  value={form.password ?? ""}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={fieldCls}
                  placeholder="(demo account only)"
                />
              </label>
            </div>
            <label className="block space-y-1 text-[12px] text-text-secondary">
              Access notes
              <textarea
                value={form.accessNotes ?? ""}
                onChange={(e) => setForm({ ...form, accessNotes: e.target.value })}
                className={areaCls}
                rows={2}
                placeholder="Log in first — the tour starts on load."
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {editingId ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </section>
  );
}
