"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  ExternalLink,
  Paperclip,
  Trash2,
  FileText,
  Link as LinkIcon,
  CornerDownRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getItemDetailAction,
  updateActionItemAction,
  updateTaskAction,
  addAttachmentAction,
  removeAttachmentAction,
} from "@/app/(app)/dashboard/item-actions";
import type { ItemDetail, ItemEntityType } from "@/db/queries/items";

type Project = { id: string; title: string };
type Member = { userId: string; displayName: string };
type Target = { entityType: ItemEntityType; id: string };

const Ctx = createContext<{
  openItem: (entityType: ItemEntityType, id: string) => void;
  projects: Project[];
  members: Member[];
} | null>(null);

export function useItemDrawer() {
  return useContext(Ctx);
}

const NONE = "__none__";
const PRIORITIES: { value: string; label: string }[] = [
  { value: "now", label: "Now" },
  { value: "next", label: "Next" },
  { value: "later", label: "Later" },
  { value: "backlog", label: "Backlog" },
];
const TASK_STATUSES: { value: string; label: string }[] = [
  { value: "pending", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
];

const ENTITY_NOUN: Record<ItemEntityType, string> = {
  action_item: "Action item",
  milestone: "Task",
  meeting: "Meeting",
};

export function ItemDrawerProvider({
  projects,
  members,
  children,
}: {
  projects: Project[];
  members: Member[];
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const openItem = useCallback(
    (entityType: ItemEntityType, id: string) => setTarget({ entityType, id }),
    [],
  );

  return (
    <Ctx.Provider value={{ openItem, projects, members }}>
      {children}
      <ItemDetailDrawer
        target={target}
        projects={projects}
        members={members}
        onOpenItem={openItem}
        onClose={() => setTarget(null)}
      />
    </Ctx.Provider>
  );
}

function ItemDetailDrawer({
  target,
  projects,
  members,
  onOpenItem,
  onClose,
}: {
  target: Target | null;
  projects: Project[];
  members: Member[];
  onOpenItem: (t: ItemEntityType, id: string) => void;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    getItemDetailAction({ entityType: target.entityType, id: target.id })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setDetail(res.detail);
        else toast.error(res.error);
      })
      .catch(() => !cancelled && toast.error("Could not load item"));
    return () => {
      cancelled = true;
    };
  }, [target, reloadKey]);

  // Derived (not setState-in-effect): show the spinner until the loaded detail
  // matches the requested target, so switching items never flashes stale data.
  const loading = Boolean(target) && (!detail || detail.id !== target?.id);

  return (
    <Sheet open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetDescription>
            {target ? ENTITY_NOUN[target.entityType] : ""}
          </SheetDescription>
          <SheetTitle className="truncate">{detail?.title ?? "Loading…"}</SheetTitle>
        </SheetHeader>

        <SheetBody>
          {loading || !detail ? (
            <div className="grid place-items-center py-16 text-text-tertiary">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <DrawerForm
              key={detail.id}
              detail={detail}
              projects={projects}
              members={members}
              onOpenItem={onOpenItem}
              onChanged={() => setReloadKey((k) => k + 1)}
            />
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function DrawerForm({
  detail,
  projects,
  members,
  onOpenItem,
  onChanged,
}: {
  detail: ItemDetail;
  projects: Project[];
  members: Member[];
  onOpenItem: (t: ItemEntityType, id: string) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const isAction = detail.entityType === "action_item";
  const isTask = detail.entityType === "milestone";
  const isMeeting = detail.entityType === "meeting";

  const [title, setTitle] = useState(detail.title);
  const [description, setDescription] = useState(detail.description ?? "");

  async function save(patch: Record<string, unknown>) {
    const res = isAction
      ? await updateActionItemAction({ id: detail.id, ...patch })
      : isTask
        ? await updateTaskAction({ id: detail.id, ...patch })
        : { ok: false as const, error: "Edit meetings on the meeting page." };
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onChanged();
    router.refresh();
  }

  const deepLink =
    isMeeting && detail.id
      ? `/meetings/${detail.id}`
      : detail.projectId
        ? `/projects/${detail.projectId}`
        : null;

  return (
    <div className="space-y-5">
      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="d-title">Title</Label>
        <Input
          id="d-title"
          value={title}
          disabled={isMeeting}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== detail.title && save({ title: title.trim() })}
        />
      </div>

      {/* Status / due / priority */}
      {!isMeeting && (
        <div className="grid grid-cols-2 gap-3">
          {isTask ? (
            <Field label="Status">
              <Select value={detail.status ?? "pending"} onValueChange={(v) => save({ status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Status">
              <Select
                value={detail.status === "done" ? "done" : "open"}
                onValueChange={(v) => save({ status: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Priority">
            <Select
              value={detail.priority ?? NONE}
              onValueChange={(v) => save({ priority: v === NONE ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Due date">
            <Input
              type="date"
              defaultValue={detail.dueDate ?? ""}
              onChange={(e) => save({ dueDate: e.target.value || null })}
            />
          </Field>

          <Field label="Project">
            <Select
              value={detail.projectId ?? NONE}
              onValueChange={(v) => save({ projectId: v === NONE ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {/* Tasks require a project; action items may be unassigned. */}
                {isAction && <SelectItem value={NONE}>None</SelectItem>}
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Assignee">
            <Select
              value={detail.assigneeId ?? NONE}
              onValueChange={(v) => save({ assigneeUserId: v === NONE ? null : v })}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>{m.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {/* Description (action items) / agenda + meeting meta */}
      {isAction && (
        <div className="space-y-1.5">
          <Label htmlFor="d-desc">Notes</Label>
          <Textarea
            id="d-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== (detail.description ?? "") && save({ description: description || null })}
          />
        </div>
      )}

      {/* "Part of" */}
      <PartOf detail={detail} deepLink={deepLink} />

      {/* Project docs */}
      {detail.projectDocs.length > 0 && (
        <Section title={`Docs in ${detail.projectTitle ?? "project"}`}>
          <ul className="space-y-1">
            {detail.projectDocs.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-[12.5px]">
                {d.kind === "link" ? <LinkIcon size={12} className="text-text-tertiary" /> : <FileText size={12} className="text-text-tertiary" />}
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="truncate text-[var(--blue-text)] hover:underline">{d.label}</a>
                ) : detail.projectId ? (
                  <Link href={`/projects/${detail.projectId}`} className="truncate text-text-primary hover:underline">{d.label}</Link>
                ) : (
                  <span className="truncate text-text-primary">{d.label}</span>
                )}
                <span className="ml-auto rounded bg-surface px-1 text-[9px] uppercase text-text-tertiary">{d.kind}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Direct attachments */}
      <Attachments detail={detail} onChanged={onChanged} />

      {/* Related items */}
      {detail.relatedItems.length > 0 && (
        <Section title={isMeeting ? "Tasks from this meeting" : "Sub-tasks"}>
          <ul className="space-y-1">
            {detail.relatedItems.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpenItem(r.entityType, r.id)}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-[12.5px] text-text-primary hover:bg-surface"
                >
                  <CornerDownRight size={12} className="text-text-tertiary" />
                  <span className="truncate">{r.title}</span>
                  {r.status && <span className="ml-auto rounded bg-surface px-1 text-[9px] text-text-tertiary">{r.status}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {detail.attendees.length > 0 && (
        <Section title="Attendees">
          <p className="text-[12.5px] text-text-secondary">{detail.attendees.join(", ")}</p>
        </Section>
      )}

      {isMeeting && (
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={`/meetings/${detail.id}`}>
            <ExternalLink size={14} /> Open full meeting
          </Link>
        </Button>
      )}
    </div>
  );
}

function PartOf({ detail, deepLink }: { detail: ItemDetail; deepLink: string | null }) {
  const chips: { label: string; href?: string }[] = [];
  if (detail.projectTitle) chips.push({ label: `Project: ${detail.projectTitle}`, href: detail.projectId ? `/projects/${detail.projectId}` : undefined });
  if (detail.initiativeTitle) chips.push({ label: `Initiative: ${detail.initiativeTitle}`, href: detail.initiativeId ? `/initiatives/${detail.initiativeId}` : undefined });
  if (detail.sprintName) chips.push({ label: `Sprint: ${detail.sprintName}` });
  if (detail.assigneeName) chips.push({ label: `Assignee: ${detail.assigneeName}` });
  if (detail.contactName) chips.push({ label: `Contact: ${detail.contactName}`, href: detail.contactId ? `/contacts/${detail.contactId}` : undefined });
  if (chips.length === 0 && !deepLink) return null;

  return (
    <Section title="Part of">
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c, i) =>
          c.href ? (
            <Link key={i} href={c.href} className="rounded-full bg-surface px-2 py-0.5 text-tiny text-text-secondary hover:text-text-primary">{c.label}</Link>
          ) : (
            <span key={i} className="rounded-full bg-surface px-2 py-0.5 text-tiny text-text-tertiary">{c.label}</span>
          ),
        )}
      </div>
    </Section>
  );
}

function Attachments({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  async function add() {
    if (!label.trim() || !url.trim()) {
      toast.error("Label and URL required.");
      return;
    }
    setAdding(true);
    const res = await addAttachmentAction({
      entityType: detail.entityType,
      entityId: detail.id,
      label: label.trim(),
      url: url.trim(),
    });
    setAdding(false);
    if (res.ok) {
      setLabel("");
      setUrl("");
      onChanged();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function remove(id: string) {
    const res = await removeAttachmentAction({ id });
    if (res.ok) {
      onChanged();
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Section title="Attachments">
      {detail.attachments.length > 0 && (
        <ul className="mb-2 space-y-1">
          {detail.attachments.map((a) => (
            <li key={a.id} className="group flex items-center gap-2 text-[12.5px]">
              <Paperclip size={12} className="text-text-tertiary" />
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate text-[var(--blue-text)] hover:underline">{a.label}</a>
              ) : (
                <span className="truncate text-text-primary">{a.label}</span>
              )}
              <button
                type="button"
                onClick={() => remove(a.id)}
                aria-label="Remove attachment"
                className="ml-auto rounded p-0.5 text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-[var(--destructive)]"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="h-8 text-[12.5px]" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="h-8 text-[12.5px]" />
        <Button type="button" size="sm" variant="outline" onClick={add} loading={adding}>Add</Button>
      </div>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-label text-text-secondary">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
