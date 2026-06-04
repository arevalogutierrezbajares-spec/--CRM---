"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Megaphone,
  Code,
  Wrench,
  Palette,
  DollarSign,
  Link as LinkIcon,
  ExternalLink,
  Eye,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import type { ProjectLinkWithAuthor } from "@/db/queries/projects";
import type { LinkCategory } from "@/lib/project-links/detect-category";
import { brandForUrl } from "@/lib/project-links/host-brands";
import { formatBytes } from "@/lib/project-files/limits";
import { chipForFile } from "@/lib/project-files/allowed-types";
import {
  deleteLinkAction,
  deleteFileAction,
  getFileSignedUrlAction,
  reorderLinksAction,
} from "@/app/(app)/projects/actions";
import { formatRelative } from "@/lib/utils";
import { AddLinkModal, type LinkModalInitial } from "./add-link-modal";
import { FilePreviewModal, type PreviewFile } from "./file-preview-modal";
import { UploadTray } from "./upload-tray";

const CATEGORIES: LinkCategory[] = [
  "business",
  "marketing",
  "tech",
  "ops",
  "design",
  "finance",
  "other",
];

const META: Record<
  LinkCategory,
  { label: string; icon: LucideIcon; color: string; emptyHint: string }
> = {
  business: {
    label: "Business",
    icon: Briefcase,
    color: "var(--green-text)",
    emptyHint: "Product briefs, pricing docs, deals, agreements.",
  },
  marketing: {
    label: "Marketing",
    icon: Megaphone,
    color: "var(--red-text)",
    emptyHint: "Landing page, brand guide, social links, decks.",
  },
  tech: {
    label: "Tech",
    icon: Code,
    color: "var(--blue-text)",
    emptyHint: "Repo, deploy URLs, architecture docs, dashboards.",
  },
  ops: {
    label: "Ops",
    icon: Wrench,
    color: "var(--amber-text)",
    emptyHint: "Wikis, trackers, scheduling.",
  },
  design: {
    label: "Design",
    icon: Palette,
    color: "var(--purple-text)",
    emptyHint: "Figma, mockups, boards.",
  },
  finance: {
    label: "Finance",
    icon: DollarSign,
    color: "var(--teal-text)",
    emptyHint: "Invoices, accounting, banking.",
  },
  other: {
    label: "Other",
    icon: LinkIcon,
    color: "var(--text-secondary)",
    emptyHint: "Anything else.",
  },
};

export function LinksBoard({
  projectId,
  links,
  currentUserId,
  currentUserRole,
}: {
  projectId: string;
  links: ProjectLinkWithAuthor[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LinkModalInitial | undefined>(undefined);
  const [modalCategory, setModalCategory] = useState<LinkCategory | undefined>(
    undefined,
  );
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isPrivileged = currentUserRole === "owner" || currentUserRole === "admin";
  const canEditRow = (l: ProjectLinkWithAuthor) =>
    isPrivileged || l.createdBy === currentUserId;

  // Group links by category, each sorted by sortOrder.
  const byCategory = useMemo(() => {
    const map = new Map<LinkCategory, ProjectLinkWithAuthor[]>();
    for (const c of CATEGORIES) map.set(c, []);
    for (const l of links) {
      const cat = (CATEGORIES as string[]).includes(l.category)
        ? (l.category as LinkCategory)
        : "other";
      map.get(cat)!.push(l);
    }
    for (const c of CATEGORIES) {
      map.get(c)!.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [links]);

  function openCreate(category?: LinkCategory) {
    setEditing(undefined);
    setModalCategory(category);
    setModalOpen(true);
  }

  function openEdit(l: ProjectLinkWithAuthor) {
    setEditing({
      linkId: l.id,
      url: l.url ?? "",
      label: l.label,
      category: ((CATEGORIES as string[]).includes(l.category)
        ? l.category
        : "other") as LinkCategory,
      description: l.description,
    });
    setModalCategory(undefined);
    setModalOpen(true);
  }

  function remove(l: ProjectLinkWithAuthor) {
    startTransition(async () => {
      const res =
        l.kind === "file"
          ? await deleteFileAction({ projectId, linkId: l.id })
          : await deleteLinkAction({ projectId, linkId: l.id });
      if (res.ok) {
        toast.success(l.kind === "file" ? "File removed" : "Link removed");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function preview(l: ProjectLinkWithAuthor) {
    setPreviewFile({
      linkId: l.id,
      label: l.label,
      filename: l.originalFilename ?? l.label,
      mime: l.mimeType ?? "",
    });
    setPreviewUrl(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewOpen(true);
    // Resolve the short-lived signed URL in the event handler (not an effect).
    startTransition(async () => {
      const res = await getFileSignedUrlAction({ linkId: l.id });
      if (res.ok) setPreviewUrl(res.url);
      else setPreviewError(res.error);
      setPreviewLoading(false);
    });
  }

  function move(category: LinkCategory, index: number, dir: -1 | 1) {
    const list = byCategory.get(category)!;
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const reordered = [...list];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    startTransition(async () => {
      const res = await reorderLinksAction({
        projectId,
        category,
        orderedLinkIds: reordered.map((l) => l.id),
      });
      if (res.ok) {
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const primary: LinkCategory[] = ["business", "marketing", "tech"];
  const secondary: LinkCategory[] = ["ops", "design", "finance", "other"];

  function renderCard(category: LinkCategory) {
    const meta = META[category];
    const Icon = meta.icon;
    const list = byCategory.get(category)!;

    return (
      <DashCard key={category}>
        <div className="flex items-center justify-between mb-2.5">
          <div
            className="flex items-center gap-1.5 text-label"
            style={{ color: meta.color }}
          >
            <Icon size={14} />
            <span>{meta.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-tiny text-text-tertiary tabular-nums">
              {list.length}
            </span>
            <button
              type="button"
              onClick={() => openCreate(category)}
              disabled={pending}
              aria-label={`Add ${meta.label} link`}
              className="rounded p-0.5 text-text-tertiary hover:text-text-primary hover:bg-surface transition-colors"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        {list.length === 0 ? (
          <p className="text-tiny text-text-tertiary py-2">{meta.emptyHint}</p>
        ) : (
          <ul className="space-y-1">
            {list.map((l, i) => (
              <li key={l.id}>
                <LinkRow
                  link={l}
                  accent={meta.color}
                  canEdit={canEditRow(l)}
                  isFirst={i === 0}
                  isLast={i === list.length - 1}
                  disabled={pending}
                  onEdit={() => openEdit(l)}
                  onDelete={() => remove(l)}
                  onPreview={() => preview(l)}
                  onMoveUp={() => move(category, i, -1)}
                  onMoveDown={() => move(category, i, 1)}
                />
              </li>
            ))}
          </ul>
        )}
      </DashCard>
    );
  }

  const hasSecondary = secondary.some((c) => byCategory.get(c)!.length > 0);

  return (
    <UploadTray
      projectId={projectId}
      onUploaded={() => router.refresh()}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-label text-text-secondary">Links & Documents</h2>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => openCreate()}
            disabled={pending}
          >
            <Plus size={14} />
            Add link
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {primary.map(renderCard)}
        </div>

        {hasSecondary && (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
            {secondary
              .filter((c) => byCategory.get(c)!.length > 0)
              .map(renderCard)}
          </div>
        )}

        <AddLinkModal
          projectId={projectId}
          open={modalOpen}
          onOpenChange={setModalOpen}
          initial={editing}
          defaultCategory={modalCategory}
        />

        <FilePreviewModal
          file={previewFile}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          url={previewUrl}
          error={previewError}
          loading={previewLoading}
        />
      </div>
    </UploadTray>
  );
}

function LinkRow({
  link: l,
  accent,
  canEdit,
  isFirst,
  isLast,
  disabled,
  onEdit,
  onDelete,
  onPreview,
  onMoveUp,
  onMoveDown,
}: {
  link: ProjectLinkWithAuthor;
  accent: string;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isFile = l.kind === "file";
  const brand = !isFile && l.url ? brandForUrl(l.url) : null;
  const chip = isFile ? chipForFile(l.originalFilename ?? "", l.mimeType ?? "") : null;

  const labelBlock = (
    <div className="min-w-0 flex-1">
      <div className="text-[12.5px] text-text-primary truncate flex items-center gap-1.5">
        {chip && (
          <span className="shrink-0 rounded bg-surface px-1 text-[9px] font-medium text-text-secondary tabular-nums">
            {chip}
          </span>
        )}
        <span className="truncate">{l.label}</span>
        {isFile ? (
          <Eye
            size={10}
            className="text-text-tertiary opacity-0 group-hover:opacity-100"
          />
        ) : (
          l.url && (
            <ExternalLink
              size={10}
              className="text-text-tertiary opacity-0 group-hover:opacity-100"
            />
          )
        )}
      </div>
      {brand && brand.toLowerCase() !== l.label.toLowerCase() && (
        <div className="text-tiny text-text-tertiary">{brand}</div>
      )}
      {isFile && (
        <div className="text-tiny text-text-tertiary">
          {l.sizeBytes != null && <span>{formatBytes(l.sizeBytes)}</span>}
          {l.createdByName && (
            <span> · uploaded by {l.createdByName}</span>
          )}
          {l.createdAt && <span> · {formatRelative(l.createdAt)}</span>}
        </div>
      )}
      {l.description && (
        <div className="text-tiny text-text-tertiary line-clamp-2">
          {l.description}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-surface transition-colors">
      <div
        className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
        style={{ background: accent }}
      />
      {isFile ? (
        <button
          type="button"
          onClick={onPreview}
          disabled={disabled}
          className="min-w-0 flex-1 text-left"
        >
          {labelBlock}
        </button>
      ) : l.url ? (
        <a
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1"
        >
          {labelBlock}
        </a>
      ) : (
        labelBlock
      )}

      {canEdit && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={disabled || isFirst}
            aria-label={`Move ${l.label} up`}
            className="rounded p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-30"
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={disabled || isLast}
            aria-label={`Move ${l.label} down`}
            className="rounded p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-30"
          >
            <ChevronDown size={12} />
          </button>
          {!isFile && (
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              aria-label={`Edit ${l.label}`}
              className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
            >
              <Pencil size={12} />
            </button>
          )}
          <ConfirmDialog
            title={isFile ? "Remove this file?" : "Remove this link?"}
            description={`"${l.label}" will be removed from this project${isFile ? " and deleted from storage" : ""}.`}
            confirmLabel="Remove"
            destructive
            onConfirm={onDelete}
            trigger={(open) => (
              <button
                type="button"
                onClick={open}
                disabled={disabled}
                aria-label={`Delete ${l.label}`}
                className="rounded p-0.5 text-text-tertiary hover:text-[var(--destructive)]"
              >
                <Trash2 size={12} />
              </button>
            )}
          />
        </div>
      )}
    </div>
  );
}
