"use client";

import { useState, useTransition } from "react";
import { Download, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils";
import { formatBytes } from "@/lib/project-files/limits";
import type { PartnerUpload } from "@/db/queries/partner-uploads";
import { deletePartnerUploadAction } from "@/app/(app)/partner-access/actions";

async function getDownloadUrl(uploadId: string): Promise<string | null> {
  // hits the existing materials route to get a signed download URL
  const res = await fetch(`/api/partner-uploads/${uploadId}/download`);
  if (!res.ok) return null;
  const data = await res.json() as { url?: string };
  return data.url ?? null;
}

export function PartnerUploadsPanel({
  roomId,
  initialUploads,
}: {
  roomId: string;
  initialUploads: PartnerUpload[];
}) {
  const [uploads, setUploads] = useState(initialUploads);
  const [isPending, startTransition] = useTransition();

  function handleDelete(uploadId: string) {
    startTransition(async () => {
      const res = await deletePartnerUploadAction({ roomId, uploadId });
      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.id !== uploadId));
      } else {
        toast.error(res.error);
      }
    });
  }

  async function handleDownload(upload: PartnerUpload) {
    const url = await getDownloadUrl(upload.id).catch(() => null);
    if (!url) {
      toast.error("Couldn't get the download link. Try again.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = upload.originalFilename;
    a.click();
  }

  if (uploads.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--border)] p-4 text-center">
        <FileUp className="mx-auto h-6 w-6 text-[var(--muted-foreground)]" />
        <p className="mt-2 text-sm font-medium">Nothing uploaded yet</p>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          When the partner uploads files, they appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {uploads.map((upload) => (
        <li
          key={upload.id}
          className="flex items-start justify-between gap-2 rounded-md border border-[var(--border)] p-3"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">
                {upload.label || upload.originalFilename}
              </span>
              {upload.downloadedAt && (
                <Badge variant="success" className="text-[10px]">downloaded</Badge>
              )}
            </div>
            {upload.note && (
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{upload.note}</p>
            )}
            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
              {upload.sizeBytes ? `${formatBytes(upload.sizeBytes)} · ` : ""}
              uploaded {formatRelative(upload.createdAt)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownload(upload)}
              className="h-7 px-2"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDelete(upload.id)}
              disabled={isPending}
              className="h-7 px-2 text-[var(--muted-foreground)] hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
