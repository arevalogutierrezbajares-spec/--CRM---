"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  setRoomBrandLogosAction,
  setRoomClientLogoAction,
} from "@/app/(app)/partner-access/actions";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_FILES_BUCKET } from "@/lib/project-files/constants";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { BrandLogo } from "@/db/queries/partner-access";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;

/**
 * Owner control for a room's co-branding: shows the auto-derived project logos
 * (your side) and lets you set the client's logo by drag-and-drop upload or URL.
 */
export function ClientLogoControl({
  roomId,
  contactId,
  contactName,
  clientLogoUrl,
  brandLogos,
  availableBrands,
  selectedBrandLobIds,
}: {
  roomId: string;
  contactId: string | null;
  contactName: string | null;
  clientLogoUrl: string | null;
  brandLogos: BrandLogo[];
  availableBrands: BrandLogo[];
  selectedBrandLobIds: string[] | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAuto = !selectedBrandLobIds || selectedBrandLobIds.length === 0;
  const selected = new Set(selectedBrandLobIds ?? []);

  function setBrands(next: string[] | null) {
    startTransition(async () => {
      const res = await setRoomBrandLogosAction({ roomId, brandLobIds: next });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  function toggleBrand(lobId: string) {
    const next = new Set(selected);
    if (next.has(lobId)) next.delete(lobId);
    else next.add(lobId);
    setBrands(next.size === 0 ? null : Array.from(next));
  }

  if (!contactId) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Attach a contact to this room to add their logo.
      </p>
    );
  }
  const cid = contactId;

  function saveUrl(next: string | null) {
    startTransition(async () => {
      const res = await setRoomClientLogoAction({ roomId, contactId: cid, logoUrl: next });
      if (res.ok) {
        toast.success(next ? "Client logo updated" : "Client logo removed");
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
      const signRes = await fetch(`/api/contact-logo/${cid}`, {
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

      const finRes = await fetch(`/api/contact-logo/${cid}`, {
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
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Your brand logos
          </p>
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            {isAuto ? "Auto" : `${selected.size} chosen`}
          </span>
        </div>

        {/* What's showing now */}
        {brandLogos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {brandLogos.map((logo) => (
              <span
                key={logo.lobId}
                className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-white p-1"
                title={logo.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.logoUrl} alt={`${logo.title} logo`} className="max-h-full max-w-full object-contain" />
              </span>
            ))}
          </div>
        )}

        {availableBrands.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Add a logo to a business or project and it can be shown here.
          </p>
        ) : (
          <div className="mt-2 space-y-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--secondary)]">
              <Checkbox
                checked={isAuto}
                onCheckedChange={() => setBrands(null)}
                aria-label="Auto — from shared documents"
                disabled={pending}
              />
              <span>
                Auto
                <span className="ml-1 text-xs text-[var(--muted-foreground)]">
                  — match the projects you share
                </span>
              </span>
            </label>
            {availableBrands.map((brand) => (
              <label
                key={brand.lobId}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-[var(--secondary)]"
              >
                <Checkbox
                  checked={!isAuto && selected.has(brand.lobId)}
                  onCheckedChange={() => toggleBrand(brand.lobId)}
                  aria-label={brand.title}
                  disabled={pending}
                />
                <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-full border border-[var(--border)] bg-white p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.logoUrl} alt="" className="max-h-full max-w-full object-contain" />
                </span>
                <span className="truncate">{brand.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          {contactName ? `${contactName}'s logo` : "Client logo"}
        </p>

        {/* Dropzone */}
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
          className={`mt-1.5 flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition disabled:opacity-60 ${
            dragOver
              ? "border-[var(--primary)] bg-[var(--secondary)]"
              : "border-[var(--border)] hover:bg-[var(--secondary)]"
          }`}
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--border)] bg-[var(--card)]">
            {clientLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={clientLogoUrl} alt="Client logo" className="max-h-full max-w-full object-contain p-1" />
            ) : (
              <ImageIcon className="h-5 w-5 text-[var(--muted-foreground)]" />
            )}
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : clientLogoUrl ? "Replace logo" : "Upload a logo"}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
              Drag &amp; drop or click — PNG, JPG, WEBP, SVG up to 5 MB
            </span>
          </span>
          {clientLogoUrl && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Remove client logo"
              onClick={(e) => {
                e.stopPropagation();
                saveUrl(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  saveUrl(null);
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

        {/* URL fallback */}
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (value.trim()) saveUrl(value.trim());
              }
            }}
            placeholder="…or paste an image URL"
            aria-label="Client logo URL"
            className="font-mono text-xs"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !value.trim()}
            onClick={() => saveUrl(value.trim())}
          >
            Use URL
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
          Shown to {contactName ?? "the client"} in every room.
        </p>
      </div>
    </div>
  );
}
