"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  addRoomCommentAction,
  addRoomLinkAction,
  deleteRoomCommentAction,
  deleteRoomItemAction,
  updateRoomItemAction,
} from "@/app/(app)/partner-access/actions";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_FILES_BUCKET } from "@/lib/project-files/constants";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/lib/project-files/limits";
import {
  PartnerCommentThread,
  type RepoComment,
} from "@/components/partner-access/partner-comment-thread";

export type OwnerRepoItem = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type OwnerRepoShare = {
  id: string;
  title: string;
  projectTitle: string | null;
  kindSnapshot: string;
  sizeBytes: number | null;
  description: string | null;
};

function itemIcon(item: OwnerRepoItem) {
  if (item.kind === "link") return <LinkIcon className="h-4 w-4 text-[var(--muted-foreground)]" />;
  if (item.mimeType?.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-[var(--muted-foreground)]" />;
  if (item.mimeType?.startsWith("video/")) return <Film className="h-4 w-4 text-[var(--muted-foreground)]" />;
  return <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />;
}

export function RepositoryManager({
  roomId,
  items,
  shares,
  commentsByTarget,
  partnerLabel,
}: {
  roomId: string;
  items: OwnerRepoItem[];
  shares: OwnerRepoShare[];
  commentsByTarget: Record<string, RepoComment[]>;
  partnerLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkDesc, setLinkDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function addLink() {
    if (!linkTitle.trim() || !linkUrl.trim()) return;
    startTransition(async () => {
      const res = await addRoomLinkAction({
        roomId,
        title: linkTitle,
        url: linkUrl,
        description: linkDesc.trim() || null,
      });
      if (res.ok) {
        setLinkTitle("");
        setLinkUrl("");
        setLinkDesc("");
        setAdding(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const signRes = await fetch(`/api/room-items/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!signRes.ok) {
        const { error } = (await signRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(error || "Could not prepare upload");
      }
      const { path, token } = (await signRes.json()) as { path: string; token: string };
      const supabase = createClient();
      const bytes = await file.arrayBuffer();
      const { error: upErr } = await supabase.storage
        .from(PROJECT_FILES_BUCKET)
        .uploadToSignedUrl(path, token, bytes, { contentType: file.type });
      if (upErr) throw new Error(upErr.message);

      const finRes = await fetch(`/api/room-items/${roomId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          storagePath: path,
          title: file.name,
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      if (!finRes.ok) throw new Error("Saved file but could not finalize");
      toast.success("Added to repository");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function ownerComment(targetKind: "share" | "item", targetId: string) {
    return async (body: string) => {
      const res = await addRoomCommentAction({ roomId, targetKind, targetId, body });
      if (!res.ok) {
        toast.error(res.error);
        return null;
      }
      router.refresh();
      return res.comment as RepoComment;
    };
  }

  async function deleteComment(id: string) {
    const res = await deleteRoomCommentAction({ roomId, commentId: id });
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" />
          Add link
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploading ? "Uploading…" : "Upload file / media"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {adding && (
        <div className="space-y-2 rounded-md border border-[var(--border)] p-3">
          <Input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Link title" aria-label="Link title" />
          <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" aria-label="Link URL" className="font-mono text-xs" />
          <Textarea value={linkDesc} onChange={(e) => setLinkDesc(e.target.value)} rows={2} placeholder="Description (optional)" aria-label="Link description" />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending || !linkTitle.trim() || !linkUrl.trim()} onClick={addLink}>
              Add to repository
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && shares.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Add links, files, or media — or share project documents — and they&rsquo;ll
          show here for {partnerLabel} to view and comment on.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <OwnerItemRow
              key={`item-${item.id}`}
              roomId={roomId}
              item={item}
              comments={commentsByTarget[`item:${item.id}`] ?? []}
              onComment={ownerComment("item", item.id)}
              onDeleteComment={deleteComment}
            />
          ))}
          {shares.map((share) => (
            <li key={`share-${share.id}`} className="rounded-md border border-[var(--border)] p-3">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{share.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {share.projectTitle ?? "Project"} · {share.kindSnapshot}
                    {share.sizeBytes ? ` · ${formatBytes(share.sizeBytes)}` : ""} · shared doc
                  </div>
                  {share.description && (
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{share.description}</p>
                  )}
                  <PartnerCommentThread
                    comments={commentsByTarget[`share:${share.id}`] ?? []}
                    ownerLabel="You"
                    onSubmit={ownerComment("share", share.id)}
                    onDelete={deleteComment}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerItemRow({
  roomId,
  item,
  comments,
  onComment,
  onDeleteComment,
}: {
  roomId: string;
  item: OwnerRepoItem;
  comments: RepoComment[];
  onComment: (body: string) => Promise<RepoComment | null>;
  onDeleteComment: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.description ?? "");

  function save() {
    startTransition(async () => {
      const res = await updateRoomItemAction({
        roomId,
        itemId: item.id,
        title,
        description: desc.trim() || null,
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteRoomItemAction({ roomId, itemId: item.id });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  return (
    <li className="rounded-md border border-[var(--border)] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{itemIcon(item)}</span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Description" aria-label="Description" />
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={pending || !title.trim()} onClick={save}>
                  <Check className="h-3.5 w-3.5" /> Save
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">
                    {item.kind === "link" ? item.url : item.mimeType}
                    {item.sizeBytes ? ` · ${formatBytes(item.sizeBytes)}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setEditing(true)} aria-label="Edit" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <ConfirmDialog
                    title="Remove from repository?"
                    description="It disappears from the client's room."
                    confirmLabel="Remove"
                    destructive
                    onConfirm={remove}
                    trigger={(open) => (
                      <button type="button" onClick={open} disabled={pending} aria-label="Remove" className="text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  />
                </div>
              </div>
              {item.description && (
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{item.description}</p>
              )}
            </>
          )}
          <PartnerCommentThread
            comments={comments}
            ownerLabel="You"
            onSubmit={onComment}
            onDelete={onDeleteComment}
          />
        </div>
      </div>
    </li>
  );
}
