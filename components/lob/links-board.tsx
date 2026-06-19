"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Share2,
  ChevronUp,
  ChevronDown,
  FileText,
  FilePlus,
  LayoutGrid,
  List as ListIcon,
  Search,
  ArrowUpDown,
  SquarePen,
  type LucideIcon,
} from "lucide-react";
import { DashCard } from "@/components/dashboard/shared/dash-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import type {
  ProjectLinkWithAuthor,
  ProjectLinkView,
} from "@/db/queries/lines-of-business";
import type { LinkCategory } from "@/lib/project-links/detect-category";
import { brandForUrl } from "@/lib/project-links/host-brands";
import { formatBytes } from "@/lib/project-files/limits";
import { chipForFile, isEditableTextFile } from "@/lib/project-files/allowed-types";
import {
  deleteLinkAction,
  deleteFileAction,
  getFileSignedUrlAction,
  reorderLinksAction,
} from "@/app/(app)/lob/actions";
import { formatRelative } from "@/lib/utils";
import { createDocAction } from "@/app/(app)/lob/docs-actions";
import { AddLinkModal, type LinkModalInitial } from "./add-link-modal";
import { EditFileModal, type FileEditInitial } from "./edit-file-modal";
import { FilePreviewModal, type PreviewFile } from "./file-preview-modal";
import { DocCommentsPanel } from "./doc-comments-panel";
import type { MemberOption } from "@/components/town-hall/types";
import {
  EditFileContentModal,
  type EditFileTarget,
} from "./edit-file-content-modal";
import { UploadTray } from "./upload-tray";
import {
  ShareLinkModal,
  type ShareContactOption,
  type ShareableProjectLink,
} from "@/components/partner-access/share-link-modal";

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

type SortKey = "name" | "type" | "edited";

/** Short type label for the List view's Type column. */
function typeLabel(l: ProjectLinkView): string {
  if (l.kind === "file") return chipForFile(l.originalFilename ?? "", l.mimeType ?? "");
  if (l.kind === "doc") return "DOC";
  if (l.kind === "link") return "LINK";
  return "NOTE";
}

function editedTime(l: ProjectLinkView): number {
  return l.editedAt ? new Date(l.editedAt).getTime() : 0;
}

export function LinksBoard({
  lobId,
  links,
  currentUserId,
  currentUserRole,
  members = [],
  shareContacts = [],
}: {
  lobId: string;
  links: ProjectLinkView[];
  currentUserId: string;
  currentUserRole: "owner" | "admin" | "member";
  /** Workspace roster for the @mention composer on comments. */
  members?: MemberOption[];
  shareContacts?: ShareContactOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [sharingLink, setSharingLink] = useState<ShareableProjectLink | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editContentFile, setEditContentFile] = useState<EditFileTarget | null>(null);
  const [editContentOpen, setEditContentOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "edited",
    dir: "desc",
  });

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
          ? await deleteFileAction({ lobId, linkId: l.id })
          : await deleteLinkAction({ lobId, linkId: l.id });
      if (res.ok) {
        toast.success(l.kind === "file" ? "File removed" : "Link removed");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function openShare(l: ProjectLinkView) {
    setSharingLink({
      id: l.id,
      label: l.label,
      kind: l.kind,
    });
    setShareOpen(true);
  }

  function openDoc(l: ProjectLinkView) {
    router.push(`/lob/${lobId}/docs/${l.id}`);
  }

  function newDoc(category?: LinkCategory) {
    startTransition(async () => {
      const res = await createDocAction({ lobId, category });
      if (res.ok) {
        router.push(`/lob/${lobId}/docs/${res.id}`);
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

  // Deep-link: /lob/[id]?doc=<linkId> (used by comment-mention notifications)
  // opens that file's preview, or routes to a doc's editor. Fires once per id.
  const handledDocParam = useRef<string | null>(null);
  useEffect(() => {
    const docParam = searchParams.get("doc");
    if (!docParam || handledDocParam.current === docParam) return;
    const l = links.find((x) => x.id === docParam);
    if (!l) return;
    handledDocParam.current = docParam;
    // Defer the open one frame so the state updates aren't synchronous in the
    // effect body (cascading-render rule), matching the rest of this module.
    const raf = requestAnimationFrame(() => {
      if (l.kind === "doc") openDoc(l);
      else preview(l);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, links]);

  function openEditContent(l: ProjectLinkView) {
    setEditContentFile({
      linkId: l.id,
      label: l.label,
      filename: l.originalFilename ?? l.label,
    });
    setEditContentOpen(true);
  }

  // Clicking an item's name opens the right surface for its kind.
  function openItem(l: ProjectLinkView) {
    if (l.kind === "doc") openDoc(l);
    else if (l.kind === "file") preview(l);
    else if (l.url) window.open(l.url, "_blank", "noopener,noreferrer");
  }

  function isFileEditable(l: ProjectLinkView) {
    return l.kind === "file" && isEditableTextFile(l.originalFilename ?? l.label);
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  }

  // Flat, searchable, sortable rows for the List view (all categories merged).
  const listRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? links.filter(
          (l) =>
            l.label.toLowerCase().includes(q) ||
            (l.originalFilename ?? "").toLowerCase().includes(q),
        )
      : links;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sort.key === "name") cmp = a.label.localeCompare(b.label);
      else if (sort.key === "type") cmp = typeLabel(a).localeCompare(typeLabel(b));
      else cmp = editedTime(a) - editedTime(b);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [links, query, sort]);

  function move(category: LinkCategory, index: number, dir: -1 | 1) {
    const list = byCategory.get(category)!;
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const reordered = [...list];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    startTransition(async () => {
      const res = await reorderLinksAction({
        lobId,
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
                  onShare={() => openShare(l)}
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

  const sortHeader = (label: string, k: SortKey) => (
    <th className="px-3 py-2 text-left">
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 font-medium ${
          sort.key === k
            ? "text-text-secondary"
            : "text-text-tertiary hover:text-text-secondary"
        }`}
      >
        {label}
        {sort.key === k ? (
          sort.dir === "asc" ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )
        ) : (
          <ArrowUpDown size={11} className="opacity-40" />
        )}
      </button>
    </th>
  );

  function renderList() {
    return (
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-label">
              {sortHeader("Name", "name")}
              {sortHeader("Type", "type")}
              {sortHeader("Edited", "edited")}
              <th className="px-3 py-2 text-left font-medium text-text-tertiary">
                By
              </th>
              <th className="w-px px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {listRows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-tiny text-text-tertiary"
                >
                  {query
                    ? "No files or links match your search."
                    : "Nothing here yet — add a link, upload a file, or start a doc."}
                </td>
              </tr>
            ) : (
              listRows.map((l) => {
                const chip = typeLabel(l);
                return (
                  <tr
                    key={l.id}
                    className="group border-b border-[var(--border)] last:border-0 hover:bg-surface"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => openItem(l)}
                        disabled={pending}
                        className="flex min-w-0 max-w-full items-center gap-1.5 text-left"
                      >
                        <span
                          className={`shrink-0 rounded px-1 text-[9px] font-medium tabular-nums ${
                            l.attached
                              ? "bg-surface text-text-secondary"
                              : "bg-surface text-text-tertiary line-through"
                          }`}
                        >
                          {chip}
                        </span>
                        <span
                          className={`truncate ${
                            l.attached ? "text-text-primary" : "text-text-tertiary"
                          }`}
                        >
                          {l.label}
                        </span>
                        {!l.attached && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-[var(--amber-bg,rgba(180,120,20,0.12))] px-1 text-[9px] font-medium text-[var(--amber-text)]">
                            <AlertTriangle size={9} />
                            {l.kind === "file" ? "Missing" : "No file"}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-tiny text-text-tertiary tabular-nums">
                      {chip}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-tiny text-text-tertiary">
                      {l.editedAt ? formatRelative(new Date(l.editedAt)) : "—"}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-tiny text-text-tertiary">
                      {l.editedByName ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {isFileEditable(l) && canEditRow(l) && (
                          <button
                            type="button"
                            onClick={() => openEditContent(l)}
                            disabled={pending}
                            aria-label={`Edit ${l.label} content`}
                            className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
                          >
                            <SquarePen size={13} />
                          </button>
                        )}
                        {canEditRow(l) && (
                          <>
                            <button
                              type="button"
                              onClick={() => openShare(l)}
                              disabled={pending}
                              aria-label={`Share ${l.label}`}
                              className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
                            >
                              <Share2 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(l)}
                              disabled={pending}
                              aria-label={`Edit ${l.label} details`}
                              className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
                            >
                              <Pencil size={13} />
                            </button>
                            <ConfirmDialog
                              title={l.kind === "file" ? "Remove this file?" : "Remove this link?"}
                              description={`"${l.label}" will be removed from this project${l.kind === "file" ? " and deleted from storage" : ""}.`}
                              confirmLabel="Remove"
                              destructive
                              onConfirm={() => remove(l)}
                              trigger={(open) => (
                                <button
                                  type="button"
                                  onClick={open}
                                  disabled={pending}
                                  aria-label={`Delete ${l.label}`}
                                  className="rounded p-0.5 text-text-tertiary hover:text-[var(--destructive)]"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const hasSecondary = secondary.some((c) => byCategory.get(c)!.length > 0);

  return (
    <UploadTray
      lobId={lobId}
      onUploaded={() => router.refresh()}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-label text-text-secondary">Links & Documents</h2>
          <div className="flex flex-wrap items-center gap-2">
            {view === "list" && (
              <div className="relative">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  aria-label="Search files and links"
                  className="h-8 w-40 rounded-md border border-[var(--border)] bg-transparent pl-7 pr-2 text-[13px] outline-none focus:border-text-tertiary"
                />
              </div>
            )}
            <div className="flex items-center rounded-md border border-[var(--border)] p-0.5">
              <button
                type="button"
                onClick={() => setView("grid")}
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                className={`rounded p-1 transition-colors ${
                  view === "grid"
                    ? "bg-surface text-text-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <LayoutGrid size={14} />
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label="List view"
                aria-pressed={view === "list"}
                className={`rounded p-1 transition-colors ${
                  view === "list"
                    ? "bg-surface text-text-primary"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                <ListIcon size={14} />
              </button>
            </div>
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

        {view === "list" ? (
          renderList()
        ) : (
          <>
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
          </>
        )}

        <AddLinkModal
          lobId={lobId}
          open={modalOpen}
          onOpenChange={setModalOpen}
          initial={editing}
          defaultCategory={modalCategory}
        />

        <EditFileModal
          lobId={lobId}
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
          onEditContent={(() => {
            if (!previewFile) return undefined;
            const l = links.find((x) => x.id === previewFile.linkId);
            if (!l || !canEditRow(l) || !isFileEditable(l)) return undefined;
            return () => {
              setPreviewOpen(false);
              openEditContent(l);
            };
          })()}
          comments={
            previewFile ? (
              <DocCommentsPanel
                key={previewFile.linkId}
                linkId={previewFile.linkId}
                members={members}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                className="w-full"
              />
            ) : undefined
          }
        />

        <EditFileContentModal
          key={editContentFile?.linkId ?? "none"}
          lobId={lobId}
          file={editContentFile}
          open={editContentOpen}
          onOpenChange={setEditContentOpen}
          onSaved={() => router.refresh()}
        />

        <ShareLinkModal
          key={sharingLink?.id ?? "partner-share"}
          projectId={lobId}
          link={sharingLink}
          contacts={shareContacts}
          open={shareOpen}
          onOpenChange={(nextOpen) => {
            setShareOpen(nextOpen);
            if (!nextOpen) setSharingLink(null);
          }}
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
  onShare,
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
  onShare: () => void;
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
            onClick={onShare}
            disabled={disabled}
            aria-label={`Share ${l.label}`}
            className="rounded p-0.5 text-text-tertiary hover:text-text-primary"
          >
            <Share2 size={12} />
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
