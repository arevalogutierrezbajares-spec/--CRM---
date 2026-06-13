"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { setContactLogo } from "@/app/(app)/contacts/actions";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_FILES_BUCKET } from "@/lib/project-files/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Set a contact's brand logo: drag-and-drop / file upload (signed → finalize)
 * or paste a URL. The logo lives on the contact row, so it's the same image
 * the partner room shows — set it here and it appears there, and vice-versa.
 * If the contact has no own logo but inherits one from its organization, that
 * inherited logo is shown until an own logo is set.
 */
export function ContactLogoUploader({
  contactId,
  contactName,
  logoUrl,
  inheritedLogoUrl,
  inheritedFromName,
}: {
  contactId: string;
  contactName: string;
  logoUrl: string | null;
  inheritedLogoUrl?: string | null;
  inheritedFromName?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = logoUrl ?? inheritedLogoUrl ?? null;
  const isInherited = !logoUrl && !!inheritedLogoUrl;

  function save(next: string | null) {
    startTransition(async () => {
      const res = await setContactLogo(contactId, next);
      if (res.ok) {
        toast.success(next ? "Logo updated" : "Logo removed");
        setValue("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file (PNG, JPG, WEBP, SVG)");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const signRes = await fetch(`/api/contact-logo/${contactId}`, {
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

      const finRes = await fetch(`/api/contact-logo/${contactId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", storagePath: path }),
      });
      if (!finRes.ok) throw new Error("Saved file but could not finalize");

      toast.success("Logo uploaded");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const busy = pending || uploading;

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void upload(file);
        }}
        className={`flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition disabled:opacity-60 ${
          dragOver
            ? "border-[var(--primary)] bg-[var(--secondary)]"
            : "border-[var(--border)] hover:bg-[var(--secondary)]"
        }`}
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--border)] bg-white">
          {shown ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={shown} alt="Logo" className="max-h-full max-w-full object-contain p-1" />
          ) : (
            <ImageIcon className="h-5 w-5 text-[var(--muted-foreground)]" />
          )}
        </span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="flex items-center gap-1.5 font-medium">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload a logo"}
          </span>
          <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
            {isInherited
              ? `Inherited from ${inheritedFromName ?? "organization"} — upload to override`
              : "Drag & drop or click — PNG, JPG, WEBP, SVG up to 5 MB"}
          </span>
        </span>
        {logoUrl && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Remove logo"
            onClick={(e) => {
              e.stopPropagation();
              save(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                save(null);
              }
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--muted-foreground)] transition hover:bg-[var(--background)] hover:text-[var(--destructive)]"
          >
            <X className="h-4 w-4" />
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />

      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (value.trim()) save(value.trim());
            }
          }}
          placeholder="…or paste an image URL"
          aria-label="Logo URL"
          className="font-mono text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !value.trim()}
          onClick={() => save(value.trim())}
        >
          Use URL
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Shown for {contactName} across the app and in every partner room.
      </p>
    </div>
  );
}
