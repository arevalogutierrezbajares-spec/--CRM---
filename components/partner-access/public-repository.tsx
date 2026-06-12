"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Download,
  FileSignature,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  Palette,
  PenLine,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { formatBytes } from "@/lib/project-files/limits";
import { formatRelativeEs } from "@/lib/utils";
import { repoSection, REPO_SECTION_OPTIONS } from "@/lib/partner-access";
import { PublicUploadForm } from "@/components/partner-access/public-upload-form";
import {
  SignatureModal,
  type SignatureResult,
} from "@/components/partner-access/signature-modal";
import {
  PartnerCommentThread,
  type RepoComment,
} from "@/components/partner-access/partner-comment-thread";

export type RepoSignature = {
  requestId: string;
  status: "pending" | "signed";
  message: string | null;
  signerName: string | null;
  signedAt: string | null;
  hasSignedPdf: boolean;
};

export type RepoShare = {
  id: string;
  title: string;
  description: string | null;
  projectTitle: string | null;
  kindSnapshot: string;
  permissions: string[];
  sizeBytes: number | null;
  isHtmlDeck: boolean;
  isLink: boolean;
  urlSnapshot: string | null;
  canDownload: boolean;
  section: string | null;
};

export type RepoItem = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  url: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  category: string | null;
};

export type RepoUpload = {
  id: string;
  label: string | null;
  originalFilename: string;
  createdAt: string;
};

function mediaKind(mime: string | null): "image" | "video" | "none" {
  if (!mime) return "none";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "none";
}

const KIND_LABEL: Record<string, string> = {
  file: "Documento",
  link: "Enlace",
  doc: "Documento",
  note: "Nota",
};
function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? "Documento";
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  documentos: FileText,
  contratos: FileSignature,
  contenido: Clapperboard,
  finanzas: Banknote,
  marca: Palette,
  informes: BarChart3,
};

type Entry =
  | { type: "item"; item: RepoItem }
  | { type: "share"; share: RepoShare };

export function PublicRepository({
  token,
  shares,
  items,
  uploads,
  commentsByTarget,
  signaturesByTarget = {},
  defaultSignerName = "",
  ownerLabel,
}: {
  token: string;
  shares: RepoShare[];
  items: RepoItem[];
  uploads: RepoUpload[];
  commentsByTarget: Record<string, RepoComment[]>;
  signaturesByTarget?: Record<string, RepoSignature>;
  defaultSignerName?: string;
  ownerLabel: string;
}) {
  // Server props + a local override of what was just signed this session —
  // display derives from override ?? prop (never seed-then-drift).
  const [signedNow, setSignedNow] = useState<Record<string, SignatureResult>>({});
  const [signing, setSigning] = useState<{ key: string; sig: RepoSignature; title: string } | null>(
    null,
  );

  function signatureFor(key: string): RepoSignature | null {
    const base = signaturesByTarget[key];
    if (!base) return null;
    const local = signedNow[key];
    if (local) {
      return {
        ...base,
        status: "signed",
        signerName: local.signerName,
        signedAt: local.signedAt,
        hasSignedPdf: local.hasSignedPdf,
      };
    }
    return base;
  }

  async function postComment(targetKind: "share" | "item", targetId: string, body: string) {
    const res = await fetch(`/api/access/${token}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetKind, targetId, body }),
    }).catch(() => null);
    if (!res || !res.ok) return null;
    return (await res.json()) as RepoComment;
  }

  const sections = REPO_SECTION_OPTIONS.map((option) => {
    const entries: Entry[] = [
      ...items
        .filter((item) => repoSection(item.category) === option.value)
        .map((item) => ({ type: "item" as const, item })),
      ...shares
        .filter((share) => repoSection(share.section) === option.value)
        .map((share) => ({ type: "share" as const, share })),
    ];
    return { ...option, entries };
  }).filter((section) => section.entries.length > 0);

  const total = shares.length + items.length;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">Repositorio</h2>
          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
            Todo lo compartido contigo, organizado por sección — y un buzón para
            enviarnos lo tuyo.
          </p>
        </div>
        <span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-xs tabular-nums text-[var(--secondary-foreground)]">
          {total}
        </span>
      </div>

      {total === 0 ? (
        <div className="px-4 pt-4">
          <p className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted-foreground)]">
            Aún no hay nada aquí. Los nuevos documentos y enlaces aparecerán en este espacio.
          </p>
        </div>
      ) : (
        sections.map((section) => {
          const Icon = SECTION_ICONS[section.value] ?? FileText;
          return (
            <section key={section.value} aria-label={section.label}>
              <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--secondary)]/40 px-4 py-2">
                <Icon className="h-3.5 w-3.5 text-[var(--primary)]" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  {section.label}
                </h3>
                <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                  {section.entries.length}
                </span>
              </div>
              <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
                {section.entries.map((entry) =>
                  entry.type === "item" ? (
                    <ItemRow
                      key={`item-${entry.item.id}`}
                      token={token}
                      item={entry.item}
                      comments={commentsByTarget[`item:${entry.item.id}`] ?? []}
                      signature={signatureFor(`item:${entry.item.id}`)}
                      onSign={(sig) =>
                        setSigning({ key: `item:${entry.item.id}`, sig, title: entry.item.title })
                      }
                      ownerLabel={ownerLabel}
                      onComment={(body) => postComment("item", entry.item.id, body)}
                    />
                  ) : (
                    <ShareRow
                      key={`share-${entry.share.id}`}
                      token={token}
                      share={entry.share}
                      comments={commentsByTarget[`share:${entry.share.id}`] ?? []}
                      signature={signatureFor(`share:${entry.share.id}`)}
                      onSign={(sig) =>
                        setSigning({ key: `share:${entry.share.id}`, sig, title: entry.share.title })
                      }
                      ownerLabel={ownerLabel}
                      onComment={(body) => postComment("share", entry.share.id, body)}
                    />
                  ),
                )}
              </ul>
            </section>
          );
        })
      )}

      {/* Send-files inbox — same repository, opposite direction. */}
      <section aria-label="Enviar archivos">
        <div
          className={`flex items-center gap-2 bg-[var(--secondary)]/40 px-4 py-2 ${
            total === 0 ? "mt-4 border-t border-[var(--border)]" : ""
          }`}
        >
          <Upload className="h-3.5 w-3.5 text-[var(--primary)]" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Enviar archivos
          </h3>
          {uploads.length > 0 && (
            <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
              {uploads.length}
            </span>
          )}
        </div>
        <div className="border-t border-[var(--border)] p-4">
          <p className="mb-3 text-xs text-[var(--muted-foreground)]">
            Envía documentos al equipo — contratos, firmas, recursos.
          </p>
          <PublicUploadForm token={token} />
          {uploads.length > 0 && (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Enviados anteriormente
              </p>
              <ul className="mt-2 space-y-1.5">
                {uploads.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 text-sm">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                    <span className="truncate">{u.label || u.originalFilename}</span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                      {formatRelativeEs(u.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {signing && (
        <SignatureModal
          token={token}
          requestId={signing.sig.requestId}
          documentTitle={signing.title}
          message={signing.sig.message}
          defaultName={defaultSignerName}
          onClose={() => setSigning(null)}
          onSigned={(result) => {
            setSignedNow((prev) => ({ ...prev, [signing.key]: result }));
            setSigning(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Per-entry signature state: amber "Firma requerida" + the sign CTA while
 * pending; green signed receipt (who + server timestamp) + stamped-PDF
 * download once done.
 */
function SignatureBlock({
  token,
  signature,
  onSign,
}: {
  token: string;
  signature: RepoSignature | null;
  onSign: (sig: RepoSignature) => void;
}) {
  if (!signature) return null;
  if (signature.status === "signed") {
    const when = signature.signedAt
      ? new Date(signature.signedAt).toLocaleString("es-VE", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Firmado{signature.signerName ? ` por ${signature.signerName}` : ""}
          {when ? ` · ${when}` : ""}
        </span>
        {signature.hasSignedPdf && (
          <a
            href={`/access/${token}/signed/${signature.requestId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--secondary)] sm:px-2 sm:py-1"
          >
            <Download className="h-3.5 w-3.5" />
            Documento firmado
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
        <FileSignature className="h-3.5 w-3.5" />
        Firma requerida
      </span>
      <button
        type="button"
        onClick={() => onSign(signature)}
        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-medium text-[var(--primary-foreground)] hover:opacity-90"
      >
        <PenLine className="h-3.5 w-3.5" />
        Firmar ahora
      </button>
    </div>
  );
}

function ItemRow({
  token,
  item,
  comments,
  signature,
  onSign,
  ownerLabel,
  onComment,
}: {
  token: string;
  item: RepoItem;
  comments: RepoComment[];
  signature: RepoSignature | null;
  onSign: (sig: RepoSignature) => void;
  ownerLabel: string;
  onComment: (body: string) => Promise<RepoComment | null>;
}) {
  const mk = mediaKind(item.mimeType);
  return (
    <li className="p-4 transition-colors hover:bg-[var(--secondary)]/25">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--secondary)]">
          {item.kind === "link" ? (
            <LinkIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
          ) : mk === "image" ? (
            <ImageIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
          ) : mk === "video" ? (
            <Film className="h-4 w-4 text-[var(--muted-foreground)]" />
          ) : (
            <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h4 className="text-sm font-medium">{item.title}</h4>
            {item.kind === "link" && item.url ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--secondary)] sm:px-2 sm:py-1"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Abrir
              </a>
            ) : item.kind === "file" && mk === "none" ? (
              <a
                href={`/access/${token}/item/${item.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--secondary)] sm:px-2 sm:py-1"
              >
                <Download className="h-3.5 w-3.5" />
                Abrir
              </a>
            ) : null}
          </div>
          {item.sizeBytes ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {formatBytes(item.sizeBytes)}
            </p>
          ) : null}
          {item.description && (
            <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">
              {item.description}
            </p>
          )}

          <SignatureBlock token={token} signature={signature} onSign={onSign} />

          {item.kind === "file" && mk === "image" && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/access/${token}/item/${item.id}`}
              alt={item.title}
              className="mt-2 max-h-72 rounded-lg border border-[var(--border)] object-contain"
            />
          )}
          {item.kind === "file" && mk === "video" && (
            <video
              controls
              src={`/access/${token}/item/${item.id}`}
              className="mt-2 max-h-72 w-full rounded-lg border border-[var(--border)]"
            />
          )}

          <PartnerCommentThread
            comments={comments}
            ownerLabel={ownerLabel}
            onSubmit={onComment}
          />
        </div>
      </div>
    </li>
  );
}

function ShareRow({
  token,
  share,
  comments,
  signature,
  onSign,
  ownerLabel,
  onComment,
}: {
  token: string;
  share: RepoShare;
  comments: RepoComment[];
  signature: RepoSignature | null;
  onSign: (sig: RepoSignature) => void;
  ownerLabel: string;
  onComment: (body: string) => Promise<RepoComment | null>;
}) {
  return (
    <li className="p-4 transition-colors hover:bg-[var(--secondary)]/25">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--secondary)]">
          {share.isLink ? (
            <LinkIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
          ) : (
            <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-medium">{share.title}</h4>
              <p className="text-xs text-[var(--muted-foreground)]">
                {share.projectTitle ?? "Proyecto"} · {kindLabel(share.kindSnapshot)}
                {share.sizeBytes ? ` · ${formatBytes(share.sizeBytes)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {share.isLink && share.urlSnapshot && (
                <a
                  href={`/access/${token}/open/${share.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--secondary)] sm:px-2 sm:py-1"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Abrir
                </a>
              )}
              {share.isHtmlDeck && (
                <a
                  href={`/access/${token}/deck/${share.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-2 text-xs hover:bg-[var(--secondary)] sm:px-2 sm:py-1"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Ver presentación
                </a>
              )}
              {share.canDownload && (
                <a
                  href={`/access/${token}/download/${share.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-2 text-xs text-[var(--primary-foreground)] hover:opacity-90 sm:px-2 sm:py-1"
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar
                </a>
              )}
            </div>
          </div>
          {share.description && (
            <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">
              {share.description}
            </p>
          )}
          <SignatureBlock token={token} signature={signature} onSign={onSign} />
          <PartnerCommentThread
            comments={comments}
            ownerLabel={ownerLabel}
            onSubmit={onComment}
          />
        </div>
      </div>
    </li>
  );
}
