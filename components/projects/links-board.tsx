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
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  FileText,
  FilePlus,
  type LucideIcon,
} from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import type {
  ProjectLinkWithAuthor,
  ProjectLinkView,
} from "@/db/queries/projects";
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
import { createDocAction } from "@/app/(app)/projects/docs-actions";
import { AddLinkModal, type LinkModalInitial } from "./add-link-modal";
import { EditFileModal, type FileEditInitial } from "./edit-file-modal";
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
  links: ProjectLinkView[];
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
  const [fileEditing, setFileEditing] = useState<FileEditInitial | undefined>(undefined);
  const [fileModalOpen, setFileModalOpen] = useState(false);
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
    const map = new Map<LinkCategory, ProjectLinkView[]>();
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
    const category = ((CATEGORIES as string[]).includes(l.category)
      ? l.category
      : "other") as LinkCategory;
    if (l.kind === "file" || l.kind === "doc") {
      setFileEditing({
        linkId: l.id,
        label: l.label,
        category,
        description: l.description,
        filename: l.originalFilename ?? l.label,
      });
      setFileModalOpen(true);
      return;
    }
    setEditing({
      linkId: l.id,
      url: l.url ?? "",
      label: l.label,
      category,
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

  function openDoc(l: ProjectLinkView) {
    router.push(`/projects/${projectId}/docs/${l.id}`);
  }

  function newDoc(category?: LinkCategory) {
    startTransition(async () => {
      const res = await createDocAction({ projectId, category });
      if (res.ok) {
        router.push(`/projects/${projectId}/docs/${res.id}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function preview(l: ProjectLinkView) {
    if (l.kind === "file" && !l.attached) {
      toast.error("File missing — re-upload to restore it.");
      return;
    }
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
                  attached={l.attached}
                  canEdit={canEditRow(l)}
                  isFirst={i === 0}
                  isLast={i === list.length - 1}
                  disabled={pending}
                  onEdit={() => openEdit(l)}
                  onDelete={() => remove(l)}
                  onPreview={() => preview(l)}
                  onOpenDoc={() => openDoc(l)}
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => newDoc()}
              disabled={pending}
            >
              <FilePlus size={14} />
              New doc
            </Button>
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

        <EditFileModal
          projectId={projectId}
          open={fileModalOpen}
          onOpenChange={setFileModalOpen}
          initial={fileEditing}
        />

        <FilePreviewModal
          file={previewFile}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          url={previewUrl}
          error={previewError}
          loading={previewLoading}
          onEditDetails={(() => {
            if (!previewFile) return undefined;
            const l = links.find((x) => x.id === previewFile.linkId);
            if (!l || !canEditRow(l)) return undefined;
            return () => {
              setPreviewOpen(false);
              openEdit(l);
            };
          })()}
        />
      </div>
    </UploadTray>
  );
}

function LinkRow({
  link: l,
  accent,
  attached,
  canEdit,
  isFirst,
  isLast,
  disabled,
  onEdit,
  onDelete,
  onPreview,
  onOpenDoc,
  onMoveUp,
  onMoveDown,
}: {
  link: ProjectLinkView;
  accent: string;
  attached: boolean;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onOpenDoc: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const isFile = l.kind === "file";
  const isDoc = l.kind === "doc";
  const brand = !isFile && !isDoc && l.url ? brandForUrl(l.url) : null;
  const chip = isFile
    ? chipForFile(l.originalFilename ?? "", l.mimeType ?? "")
    : isDoc
      ? "DOC"
      : null;

  const labelBlock = (
    <div className="min-w-0 flex-1">
      <div
        className={`text-[12.5px] truncate flex items-center gap-1.5 ${
          attached ? "text-text-primary" : "text-text-tertiary"
        }`}
      >
        {chip && (
          <span
            className={`shrink-0 rounded px-1 text-[9px] font-medium tabular-nums ${
              attached
                ? "bg-surface text-text-secondary"
                : "bg-surface text-text-tertiary line-through"
            }`}
          >
            {chip}
          </span>
        )}
        <span className="truncate">{l.label}</span>
        {!attached ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded bg-[var(--amber-bg,rgba(180,120,20,0.12))] px-1 text-[9px] font-medium text-[var(--amber-text)]"
            title={
              isFile
                ? "File missing from storage — re-upload to restore."
                : "No file or link attached."
            }
          >
            <AlertTriangle size={9} />
            {isFile ? "Missing" : "No file"}
          </span>
        ) : isFile ? (
          <Eye
            size={10}
            className="text-text-tertiary opacity-0 group-hover:opacity-100"
          />
        ) : isDoc ? (
          <FileText
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
        style={{ background: accent, opacity: attached ? 1 : 0.35 }}
      />
      {isDoc ? (
        <button
          type="button"
          onClick={onOpenDoc}
          disabled={disabled}
          className="min-w-0 flex-1 text-left"
        >
          {labelBlock}
        </button>
      ) : isFile ? (
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
          <button
            type="button"
            onClick={onEdit}
            disabled={disabled}
            aria-label={`Edit ${l.label}`}
            className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
          >
            <Pencil size={12} />
          </button>
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
