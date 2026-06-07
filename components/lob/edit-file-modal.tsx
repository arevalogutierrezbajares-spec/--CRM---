"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateLinkAction } from "@/app/(app)/lob/actions";
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

export type FileEditInitial = {
  linkId: string;
  label: string;
  category: LinkCategory;
  description: string | null;
  /** Read-only — shown so the user knows which file they're editing. */
  filename: string;
};

/**
 * Edit a file's metadata in place (rename / recategorize / describe) without
 * re-uploading. Reuses updateLinkAction — passing no `url` keeps it on the
 * file-safe path (the action only validates a URL when one is provided).
 */
export function EditFileModal({
  lobId,
  open,
  onOpenChange,
  initial,
}: {
  lobId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: FileEditInitial;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && initial && (
        <FileForm
          key={initial.linkId}
          lobId={lobId}
          onOpenChange={onOpenChange}
          initial={initial}
        />
      )}
    </Dialog>
  );
}

function FileForm({
  lobId,
  onOpenChange,
  initial,
}: {
  lobId: string;
  onOpenChange: (v: boolean) => void;
  initial: FileEditInitial;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState(initial.label);
  const [category, setCategory] = useState<LinkCategory>(initial.category);
  const [description, setDescription] = useState(initial.description ?? "");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!label.trim()) {
      setError("Give the file a name.");
      return;
    }
    startTransition(async () => {
      const res = await updateLinkAction({
        lobId,
        linkId: initial.linkId,
        label,
        category,
        description,
      });
      if (res.ok) {
        toast.success("Saved");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(res.error);
        toast.error(res.error);
      }
    });
  }

  return (
    <DialogContent
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Edit details</DialogTitle>
        <DialogDescription className="truncate">{initial.filename}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="file-label">Name</Label>
          <Input
            id="file-label"
            autoFocus
            value={label}
            onChange={(e) => {
              setError(null);
              setLabel(e.target.value);
            }}
            aria-invalid={Boolean(error)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="file-category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as LinkCategory)}>
            <SelectTrigger id="file-category">
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

        <div className="space-y-1.5">
          <Label htmlFor="file-description">Description (optional)</Label>
          <Textarea
            id="file-description"
            rows={2}
            placeholder="What's in this file?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-[var(--destructive)]">{error}</p>}
      </div>

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !label.trim()}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
