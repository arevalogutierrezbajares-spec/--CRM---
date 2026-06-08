"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { Upload, X, FileUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  preValidateFile,
  uploadProjectFile,
} from "@/lib/project-files/upload-client";
import { ACCEPT_ATTR } from "@/lib/project-files/allowed-types";
import { formatBytes } from "@/lib/project-files/limits";
import type { LinkCategory } from "@/lib/project-links/detect-category";

const CATEGORY_OPTIONS: { value: LinkCategory; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "marketing", label: "Marketing" },
  { value: "tech", label: "Tech" },
  { value: "ops", label: "Ops" },
  { value: "design", label: "Design" },
  { value: "finance", label: "Finance" },
  { value: "other", label: "Other" },
];

type TrayItem = {
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
 * FR-DOC-20 — wraps the links area. Dropping files anywhere over it opens a
 * drop overlay; dropped files queue into a stacked tray with editable label +
 * category, per-file validation, and an "Upload all" action.
 */
export function UploadTray({
  lobId,
  onUploaded,
  children,
}: {
  lobId: string;
  onUploaded: () => void;
  children: React.ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<TrayItem[]>([]);
  const [pending, startTransition] = useTransition();
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: TrayItem[] = [];
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
    if (next.length) setItems((prev) => [...prev, ...next]);
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  function patch(id: string, p: Partial<TrayItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)));
  }

  function uploadAll() {
    const valid = items.filter((it) => !it.error && it.status === "ready");
    if (valid.length === 0) return;
    startTransition(async () => {
      let okCount = 0;
      for (const it of valid) {
        patch(it.id, { status: "uploading" });
        const res = await uploadProjectFile({
          lobId,
          file: it.file,
          label: it.label,
          category: it.category,
        });
        if (res.ok) {
          patch(it.id, { status: "done" });
          okCount++;
          onUploaded();
        } else {
          patch(it.id, { status: "failed", error: res.error });
        }
      }
      if (okCount > 0) toast.success(`Uploaded ${okCount} file${okCount > 1 ? "s" : ""}`);
      // Clear successfully-uploaded rows; keep failures visible.
      setItems((prev) => prev.filter((it) => it.status !== "done"));
    });
  }

  const readyCount = items.filter((it) => !it.error && it.status === "ready").length;

  return (
    <div
      className="relative"
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
      onDrop={onDrop}
    >
      {children}

      <div className="mt-2">
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
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={pending}
        >
          <FileUp size={14} />
          Upload files
        </Button>
      </div>

      {items.length > 0 && (
        <div className="mt-2 space-y-2 rounded-md border border-[var(--border)] p-3">
          <div className="text-label text-text-secondary">Upload queue</div>
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2 rounded bg-surface px-2 py-1.5"
            >
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
                  {it.status === "done" && " · done"}
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
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setItems([])}
              disabled={pending}
              className="text-tiny text-text-tertiary hover:text-text-primary"
            >
              Clear
            </button>
            <Button type="button" size="sm" onClick={uploadAll} disabled={pending || readyCount === 0}>
              {pending ? "Uploading…" : `Upload all (${readyCount})`}
            </Button>
          </div>
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--ring)] bg-[var(--background)]/85">
          <div className="flex flex-col items-center gap-2 text-text-secondary">
            <Upload size={28} />
            <span className="text-sm font-medium">Drop files to upload</span>
          </div>
        </div>
      )}
    </div>
  );
}
