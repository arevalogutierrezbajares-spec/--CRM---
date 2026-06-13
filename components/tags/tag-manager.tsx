"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag as TagIcon, Trash2, Check, Plus, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createTagAction,
  updateTagAction,
  deleteTagAction,
  mergeTagsAction,
} from "@/app/(app)/contacts/tags-actions";

type Tag = {
  id: string;
  name: string;
  kind: "venture" | "custom";
  color?: string | null;
  category?: string | null;
};

const UNCATEGORIZED = "Other";
const DEFAULT_COLOR = "#6b7280";

/**
 * Manage the workspace tag dictionary: rename, recolor, categorize, delete, and
 * merge duplicates into one. Keeps the tag set short and meaningful.
 */
export function TagManager({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Venture tags are seeded + load-bearing (the pill bar) — show them locked.
  const ventureTags = useMemo(() => tags.filter((t) => t.kind === "venture"), [tags]);
  const customTags = useMemo(() => tags.filter((t) => t.kind !== "venture"), [tags]);

  const groups = useMemo(() => {
    const byCat = new Map<string, Tag[]>();
    for (const t of customTags) {
      const key = t.category?.trim() || UNCATEGORIZED;
      const arr = byCat.get(key);
      if (arr) arr.push(t);
      else byCat.set(key, [t]);
    }
    for (const arr of byCat.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return [...byCat.entries()].sort(([a], [b]) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b);
    });
  }, [customTags]);

  function refresh() {
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <TagIcon className="h-3.5 w-3.5" /> Manage tags
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage tags</DialogTitle>
          <DialogDescription>
            Rename, recolor, categorize, delete, or merge tags. Changes apply
            everywhere they&apos;re used.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {ventureTags.length > 0 && (
            <div className="space-y-1.5">
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                <Lock className="h-2.5 w-2.5" /> Venture · seeded
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ventureTags.map((t) => (
                  <Badge key={t.id} variant="secondary" className="text-xs">
                    {t.color && (
                      <span
                        aria-hidden
                        className="mr-1.5 inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                    )}
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {groups.map(([category, groupTags]) => (
            <div key={category} className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                {category}
              </p>
              {groupTags.map((t) => (
                <TagRow key={t.id} tag={t} allTags={tags} onChanged={refresh} />
              ))}
            </div>
          ))}
          {customTags.length === 0 && (
            <p className="text-sm text-[var(--muted-foreground)]">
              No custom tags yet — add one below.
            </p>
          )}
        </div>

        <NewTagRow onCreated={refresh} />
      </DialogContent>
    </Dialog>
  );
}

function TagRow({
  tag,
  allTags,
  onChanged,
}: {
  tag: Tag;
  allTags: Tag[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(tag.name);
  const [category, setCategory] = useState(tag.category ?? "");
  const [color, setColor] = useState(tag.color ?? DEFAULT_COLOR);

  const dirty =
    name.trim() !== tag.name ||
    (category.trim() || null) !== (tag.category ?? null) ||
    color !== (tag.color ?? DEFAULT_COLOR);

  function save() {
    startTransition(async () => {
      const res = await updateTagAction({ id: tag.id, name, color, category });
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteTagAction(tag.id);
      if (res.ok) onChanged();
      else toast.error(res.error);
    });
  }

  function merge(targetId: string) {
    if (!targetId) return;
    startTransition(async () => {
      const res = await mergeTagsAction({ fromId: tag.id, toId: targetId });
      if (res.ok) {
        toast.success("Tags merged");
        onChanged();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Tag color"
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-7 flex-1 text-xs"
        aria-label="Tag name"
      />
      <Input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Category"
        className="h-7 w-24 text-xs"
        aria-label="Tag category"
      />
      {dirty && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          disabled={pending}
          onClick={save}
          aria-label="Save tag"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      )}
      <select
        aria-label="Merge into"
        defaultValue=""
        disabled={pending}
        onChange={(e) => merge(e.target.value)}
        className="h-7 w-16 shrink-0 rounded border border-[var(--border)] bg-transparent text-[10px]"
        title="Merge into another tag"
      >
        <option value="">Merge…</option>
        {allTags
          .filter((o) => o.id !== tag.id)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
      </select>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0 text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
        disabled={pending}
        onClick={remove}
        aria-label="Delete tag"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function NewTagRow({ onCreated }: { onCreated: () => void }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);

  function create() {
    if (!name.trim()) return;
    startTransition(async () => {
      const res = await createTagAction({ name, color, category });
      if (res.ok) {
        setName("");
        setCategory("");
        setColor(DEFAULT_COLOR);
        onCreated();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5 border-t border-[var(--border)] pt-3">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="New tag color"
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0.5"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            create();
          }
        }}
        placeholder="New tag name"
        className="h-7 flex-1 text-xs"
        aria-label="New tag name"
      />
      <Input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="Category"
        className="h-7 w-24 text-xs"
        aria-label="New tag category"
      />
      <Button
        type="button"
        size="sm"
        className="h-7 shrink-0 gap-1 text-xs"
        disabled={pending || !name.trim()}
        onClick={create}
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </Button>
    </div>
  );
}
