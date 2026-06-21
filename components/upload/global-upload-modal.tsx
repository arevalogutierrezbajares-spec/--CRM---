"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Upload, X, FileUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { preValidateFile, uploadProjectFile } from "@/lib/project-files/upload-client";
import {
  createUploadUrlAction,
  finalizeFileUploadAction,
} from "@/app/(app)/lob/actions";
import { ACCEPT_ATTR } from "@/lib/project-files/allowed-types";
import { formatBytes } from "@/lib/project-files/limits";
import type { LinkCategory } from "@/lib/project-links/detect-category";

const OPEN_EVENT = "open-global-upload";

/**
 * Open the global upload modal from anywhere (sidebar button, ⌘K palette, a
 * project page). Pass a projectId to pre-select the destination project.
 */
export function openGlobalUpload(projectId?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { projectId } }));
}

const CATEGORY_OPTIONS: { value: LinkCategory; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "marketing", label: "Marketing" },
  { value: "tech", label: "Tech" },
  { value: "ops", label: "Ops" },
  { value: "design", label: "Design" },
  { value: "finance", label: "Finance" },
  { value: "other", label: "Other" },
];

type Project = { id: string; title: string };

type QueueItem = {
  id: string;
  file: File;
  label: string;
  category: LinkCategory;
  error: string | null;
  status: "ready" | "uploading" | "done" | "failed";
};

function defaultLabel(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "") || name;
}

/**
 * Global "upload a doc and link it to a project" modal. Reuses the existing
 * project-files upload pipeline (signed URL → direct Supabase PUT → finalize)
 * but inverts the flow: capture the file first, then pick the project — so you
 * never have to navigate into a project before you can drop a document.
 *
 * Mounted once in the (app) layout; opened via openGlobalUpload().
 */
export function GlobalUploadModal({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [lastUploadedTo, setLastUploadedTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onOpen(e: Event) {
      const pre = (e as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (pre) setProjectId(pre);
      setLastUploadedTo(null);
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: QueueItem[] = [];
    for (const file of Array.from(files)) {
      const pre = preValidateFile(file);
      next.push({
        id: crypto.randomUUID(),
        file,
        label: defaultLabel(file.name),
        category: "other",
        error: pre.ok ? null : pre.error,
        status: "ready",
      });
    }
    if (next.length) {
      setLastUploadedTo(null);
      setItems((prev) => [...prev, ...next]);
    }
  }, []);

  function patch(id: string, p: Partial<QueueItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }

  function reset() {
    setItems([]);
    setDragging(false);
    dragDepth.current = 0;
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const readyCount = items.filter((it) => !it.error && it.status === "ready").length;

  function uploadAll() {
    if (!projectId) {
      toast.error("Pick a project to link these files to first.");
      return;
    }
    const valid = items.filter((it) => !it.error && it.status === "ready");
    if (valid.length === 0) return;
    startTransition(async () => {
      let okCount = 0;
      for (const it of valid) {
        patch(it.id, { status: "uploading" });
        const res = await uploadProjectFile({
          lobId: projectId,
          file: it.file,
          label: it.label,
          category: it.category,
          actions: {
            createUploadUrl: createUploadUrlAction,
            finalizeUpload: finalizeFileUploadAction,
          },
        });
        if (res.ok) {
          patch(it.id, { status: "done" });
          okCount++;
        } else {
          patch(it.id, { status: "failed", error: res.error });
        }
      }
      if (okCount > 0) {
        toast.success(
          `Uploaded ${okCount} file${okCount > 1 ? "s" : ""} to ${selectedProject?.title ?? "project"}`,
        );
        setLastUploadedTo(projectId);
        router.refresh();
      }
      // Keep failures visible; drop the successes.
      setItems((prev) => prev.filter((it) => it.status !== "done"));
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            Drop files, then link them to a project. They appear on the project&apos;s files board.
          </DialogDescription>
        </DialogHeader>

        {/* Project picker — the destination link. */}
        <div className="space-y-1.5">
          <label className="text-label text-text-secondary">Link to project</label>
          {projects.length === 0 ? (
            <p className="text-tiny text-text-tertiary">
              No projects yet — create one first, then upload here.
            </p>
          ) : (
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger aria-label="Project">
                <SelectValue placeholder="Select a project…" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Drop zone / file picker. */}
        <div
          className={`relative rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragging
              ? "border-[var(--ring)] bg-surface"
              : "border-[var(--border)]"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="flex flex-col items-center gap-2 text-text-secondary">
            <Upload size={24} className="text-text-tertiary" />
            <div className="text-sm">Drop files here</div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
            >
              <FileUp size={14} />
              Choose files
            </Button>
          </div>
        </div>

        {/* Queue. */}
        {items.length > 0 && (
          <div className="max-h-[240px] space-y-2 overflow-y-auto rounded-md border border-[var(--border)] p-3">
            <div className="text-label text-text-secondary">Upload queue</div>
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 rounded bg-surface px-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={it.label}
                      disabled={it.status !== "ready"}
                      onChange={(e) => patch(it.id, { label: e.target.value })}
                      className="h-7 text-xs"
                      aria-label={`Label for ${it.file.name}`}
                    />
                    <Select
                      value={it.category}
                      disabled={it.status !== "ready"}
                      onValueChange={(v) => patch(it.id, { category: v as LinkCategory })}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs" aria-label="Category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-0.5 text-tiny text-text-tertiary">
                    {it.file.name} · {formatBytes(it.file.size)}
                    {it.status === "uploading" && " · uploading…"}
                  </div>
                  {it.error && (
                    <div
                      className="mt-0.5 flex items-center gap-1 text-tiny text-[var(--destructive)]"
                      role="alert"
                    >
                      <AlertCircle size={11} />
                      {it.error}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))}
                  disabled={it.status === "uploading"}
                  aria-label={`Remove ${it.file.name} from queue`}
                  className="rounded p-1 text-text-tertiary hover:text-text-primary"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Success confirmation with a jump-to-project link. */}
        {lastUploadedTo && items.length === 0 && (
          <Link
            href={`/lob/${lastUploadedTo}`}
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-surface px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
          >
            <CheckCircle2 size={15} className="text-[var(--risk-green,#1A5C2A)]" />
            Uploaded — view on{" "}
            <span className="font-medium text-text-primary">
              {projects.find((p) => p.id === lastUploadedTo)?.title ?? "project"}
            </span>
            →
          </Link>
        )}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-tiny text-text-tertiary hover:text-text-primary"
          >
            Close
          </button>
          <Button
            type="button"
            size="sm"
            onClick={uploadAll}
            disabled={pending || readyCount === 0 || !projectId}
          >
            {pending ? "Uploading…" : `Upload${readyCount ? ` (${readyCount})` : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
