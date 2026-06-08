"use client";

import { useRef, useState, useTransition } from "react";
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
import { createLinkAction, updateLinkAction } from "@/app/(app)/projects/actions";
import { detectCategory, type LinkCategory } from "@/lib/project-links/detect-category";
import { brandForUrl } from "@/lib/project-links/host-brands";
import { validateLinkUrl } from "@/lib/project-links/validate";

const CATEGORY_OPTIONS: { value: LinkCategory; label: string }[] = [
  { value: "business", label: "Business" },
  { value: "marketing", label: "Marketing" },
  { value: "tech", label: "Tech" },
  { value: "ops", label: "Ops" },
  { value: "design", label: "Design" },
  { value: "finance", label: "Finance" },
  { value: "other", label: "Other" },
];

export type LinkModalInitial = {
  linkId: string;
  url: string;
  label: string;
  category: LinkCategory;
  description: string | null;
};

export function AddLinkModal({
  projectId,
  open,
  onOpenChange,
  initial,
  defaultCategory,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Present → edit mode. Absent → create mode. */
  initial?: LinkModalInitial;
  defaultCategory?: LinkCategory;
}) {
  // Remount the form on each open so useState initializers run fresh — avoids
  // resetting state from an effect (which triggers cascading renders).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <LinkForm
          key={`${initial?.linkId ?? "new"}:${defaultCategory ?? ""}`}
          projectId={projectId}
          onOpenChange={onOpenChange}
          initial={initial}
          defaultCategory={defaultCategory}
        />
      )}
    </Dialog>
  );
}

function LinkForm({
  projectId,
  onOpenChange,
  initial,
  defaultCategory,
}: {
  projectId: string;
  onOpenChange: (v: boolean) => void;
  initial?: LinkModalInitial;
  defaultCategory?: LinkCategory;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial);

  const [url, setUrl] = useState(initial?.url ?? "");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [category, setCategory] = useState<LinkCategory>(
    initial?.category ?? defaultCategory ?? "other",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  // Track whether the user has hand-edited label/category so autofill never
  // clobbers their intent (FR-DOC-2/3). In edit mode or with a preset category,
  // treat them as already set.
  const labelTouched = useRef(isEdit);
  const categoryTouched = useRef(isEdit || Boolean(defaultCategory));

  function onUrlChange(next: string) {
    setUrl(next);
    setError(null);
    const v = validateLinkUrl(next);
    if (!v.ok) return;
    // Autofill label + category from the URL unless the user already typed.
    if (!labelTouched.current) setLabel(brandForUrl(v.url));
    if (!categoryTouched.current) setCategory(detectCategory(v.url));
  }

  function submit() {
    const v = validateLinkUrl(url);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    startTransition(async () => {
      const res = isEdit
        ? await updateLinkAction({
            projectId,
            linkId: initial!.linkId,
            url,
            label,
            category,
            description,
          })
        : await createLinkAction({
            projectId,
            url,
            label,
            category,
            description,
          });
      if (res.ok) {
        toast.success(isEdit ? "Link updated" : "Link added");
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
          <DialogTitle>{isEdit ? "Edit link" : "Add link"}</DialogTitle>
          <DialogDescription>
            Link a Google Doc, Figma file, repo, dashboard — anything with a URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              autoFocus
              type="url"
              inputMode="url"
              placeholder="https://docs.google.com/…"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              aria-invalid={Boolean(error)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-label">Label</Label>
            <Input
              id="link-label"
              placeholder="Auto-filled from the URL"
              value={label}
              onChange={(e) => {
                labelTouched.current = true;
                setLabel(e.target.value);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                categoryTouched.current = true;
                setCategory(v as LinkCategory);
              }}
            >
              <SelectTrigger id="link-category">
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
            <Label htmlFor="link-description">Description (optional)</Label>
            <Textarea
              id="link-description"
              rows={2}
              placeholder="What's behind this link?"
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
          <Button type="button" onClick={submit} disabled={pending || !url.trim()}>
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add link"}
          </Button>
        </DialogFooter>
    </DialogContent>
  );
}
