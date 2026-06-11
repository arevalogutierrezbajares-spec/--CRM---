/**
 * Admin-only preview that renders the partner room exactly as the partner
 * sees it — without needing the public access token. Auth-gated.
 */
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarClock,
  CheckSquare,
  Clapperboard,
  Download,
  Eye,
  FileSignature,
  FileText,
  Film,
  ImageIcon,
  LinkIcon,
  Lock,
  MessageSquare,
  Palette,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/current-user";
import { repoSection, REPO_SECTION_OPTIONS } from "@/lib/partner-access";
import { roomHeroVideo } from "@/lib/partner-room-videos";
import { RoomHeroVideo } from "@/components/partner-access/room-hero-video";
import { getPartnerAccessRoom } from "@/db/queries/partner-access";
import { listPartnerNextStepsByRoom } from "@/db/queries/partner-next-steps";
import { listPartnerUploadsByRoom } from "@/db/queries/partner-uploads";
import { listPartnerRoomMessages } from "@/db/queries/partner-messages";
import { listRoomItems } from "@/db/queries/partner-repository";
import { resolveRoomBrandLogos } from "@/db/queries/partner-access";
import { CoBrandLockup } from "@/components/partner-access/co-brand-lockup";
import { RoomPeople } from "@/components/partner-access/room-people";
import { partnerKindLabel } from "@/lib/partner-access";
import { formatRelative, formatRelativeEs } from "@/lib/utils";

const SECTION_ICONS: Record<string, LucideIcon> = {
  documentos: FileText,
  contratos: FileSignature,
  contenido: Clapperboard,
  finanzas: Banknote,
  marca: Palette,
  informes: BarChart3,
};

type Params = Promise<{ id: string }>;

export default async function PartnerRoomPreviewPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;

  const [detail, nextSteps, uploads, items] = await Promise.all([
    getPartnerAccessRoom({ workspaceId: user.workspaceId, roomId: id }),
    listPartnerNextStepsByRoom({ roomId: id }),
    listPartnerUploadsByRoom({ roomId: id }),
    listRoomItems({ roomId: id }),
  ]);
  const messages = detail ? await listPartnerRoomMessages({ roomId: id }) : [];

  if (!detail) notFound();

  const { room } = detail;
  const shares = detail.shares.filter((s) => !s.revokedAt);
  const openSteps = nextSteps.filter((s) => !s.completedAt);
  const heroVideo = roomHeroVideo(room.heroVideoKey);
  const repoSections = REPO_SECTION_OPTIONS.map((option) => ({
    ...option,
    items: items.filter((it) => repoSection(it.category) === option.value),
    shares: shares.filter((s) => repoSection(s.roomSection) === option.value),
  })).filter((section) => section.items.length + section.shares.length > 0);
  const repoTotal = shares.length + items.length;

  // Mirror the public page: freshness considers shares, messages, and items.
  const lastUpdated = new Date(
    Math.max(
      shares[0]?.sharedAt?.getTime() ?? 0,
      messages[messages.length - 1]?.createdAt.getTime() ?? 0,
      ...items.map((item) => item.createdAt.getTime()),
      room.updatedAt.getTime(),
    ),
  );
  const isFreshUpdate =
    new Date().getTime() - lastUpdated.getTime() < 7 * 24 * 60 * 60 * 1000;
  const brandLogos = await resolveRoomBrandLogos({
    workspaceId: user.workspaceId,
    brandLobIds: room.brandLobIds ?? null,
    shares,
  });

  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      {/* Admin banner */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            Admin preview — a close approximation of the partner&rsquo;s room
            {room.passcodeHash
              ? " (they enter a 4-digit code first)"
              : ""}
            . The live page also offers self-identification and an interactive deck viewer.
          </span>
        </div>
        <Link
          href={`/partner-access/rooms/${id}`}
          className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
        >
          ← Back to room
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 md:px-8 md:py-8">
        <header
          className={`relative overflow-hidden rounded-xl border p-5 md:p-7 ${
            heroVideo
              ? "border-black/20 lg:min-h-[300px] lg:flex lg:flex-col lg:justify-end"
              : "border-[var(--border)] bg-[var(--card)]"
          }`}
        >
          {heroVideo && (
            <RoomHeroVideo
              mp4={heroVideo.mp4}
              webm={heroVideo.webm}
              poster={heroVideo.poster}
            />
          )}
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <CoBrandLockup
                brandLogos={brandLogos}
                clientLogoUrl={detail.contact.logoUrl}
                clientName={detail.contact.name}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{partnerKindLabel(room.partnerKind)}</Badge>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs ${
                    heroVideo ? "text-white/80" : "text-[var(--muted-foreground)]"
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" />
                  Sala privada
                </span>
              </div>
              <h1
                className={`mt-4 text-3xl font-semibold tracking-tight md:text-4xl ${
                  heroVideo ? "text-white" : ""
                }`}
              >
                {room.name}
              </h1>
              <p
                className={`mt-3 max-w-2xl text-sm leading-6 ${
                  heroVideo ? "text-white/85" : "text-[var(--muted-foreground)]"
                }`}
              >
                {room.welcomeMessage ?? "A curated view of the project materials, context, and next steps shared with you."}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {openSteps.length > 0 && (
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium ${
                    heroVideo
                      ? "border-white/25 bg-white/10 text-white backdrop-blur"
                      : "border-[var(--border)] bg-[var(--background)]/60 backdrop-blur"
                  }`}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400/90 text-[11px] font-semibold tabular-nums text-amber-950">
                    {openSteps.length}
                  </span>
                  {openSteps.length === 1 ? "paso para ti" : "pasos para ti"}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm ${
                  heroVideo
                    ? "border-white/25 bg-white/10 text-white backdrop-blur"
                    : "border-[var(--border)] bg-[var(--background)]/60 backdrop-blur"
                }`}
              >
                <span className="relative flex h-2 w-2" aria-hidden>
                  {isFreshUpdate && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      isFreshUpdate
                        ? "bg-emerald-400"
                        : heroVideo
                          ? "bg-white/40"
                          : "bg-[var(--muted-foreground)]/40"
                    }`}
                  />
                </span>
                Actualizado {formatRelativeEs(lastUpdated)}
              </span>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {/* Shared materials */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <div>
                  <h2 className="text-base font-semibold">Repositorio</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Only the items explicitly shared for this room are visible —
                    grouped by section, as the partner sees them.
                  </p>
                </div>
                <Badge variant="secondary">{repoTotal}</Badge>
              </div>
              {repoTotal === 0 ? (
                <div className="px-4 pt-4">
                  <p className="rounded-lg border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted-foreground)]">
                    No active materials shared.
                  </p>
                </div>
              ) : (
                repoSections.map((section) => {
                  const Icon = SECTION_ICONS[section.value] ?? FileText;
                  return (
                    <section key={section.value} aria-label={section.label}>
                      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--secondary)]/40 px-4 py-2">
                        <Icon className="h-3.5 w-3.5 text-[var(--primary)]" />
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                          {section.label}
                        </h3>
                        <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                          {section.items.length + section.shares.length}
                        </span>
                      </div>
                      <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
                        {section.items.map((item) => (
                          <li key={`item-${item.id}`} className="p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--secondary)]">
                                    {item.kind === "link" ? (
                                      <LinkIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
                                    ) : item.mimeType?.startsWith("image/") ? (
                                      <ImageIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
                                    ) : item.mimeType?.startsWith("video/") ? (
                                      <Film className="h-4 w-4 text-[var(--muted-foreground)]" />
                                    ) : (
                                      <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                                    )}
                                  </span>
                                  <div className="min-w-0">
                                    <h4 className="truncate text-sm font-medium">{item.title}</h4>
                                    <p className="text-xs text-[var(--muted-foreground)]">
                                      {item.kind === "link" ? "Enlace" : "Documento"} · room item
                                    </p>
                                  </div>
                                </div>
                                {item.description && (
                                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                              {item.kind === "link" && item.url && (
                                <div className="flex shrink-0 items-center gap-2">
                                  <Button asChild variant="outline" size="sm">
                                    <a href={item.url} target="_blank" rel="noopener noreferrer">
                                      <ArrowUpRight className="h-4 w-4" />
                                      Open
                                    </a>
                                  </Button>
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                        {section.shares.map((share) => (
                          <li key={`share-${share.id}`} className="p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[var(--secondary)]">
                                    <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                                  </span>
                                  <div className="min-w-0">
                                    <h4 className="truncate text-sm font-medium">
                                      {share.liveLabel ?? share.labelSnapshot}
                                    </h4>
                                    <p className="text-xs text-[var(--muted-foreground)]">
                                      {share.projectTitle ?? "Project"} · {share.kindSnapshot}
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {share.permissions.map((permission) => (
                                    <span
                                      key={permission}
                                      className="inline-flex items-center gap-1 rounded-md bg-[var(--secondary)] px-2 py-1 text-[11px] text-[var(--secondary-foreground)]"
                                    >
                                      <ShieldCheck className="h-3 w-3" />
                                      {permission}
                                    </span>
                                  ))}
                                  {share.expiresAt && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-[var(--amber-bg)] px-2 py-1 text-[11px] text-[var(--amber-text)]">
                                      <CalendarClock className="h-3 w-3" />
                                      expires {formatRelative(share.expiresAt)}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                {share.permissions.includes("download") && (
                                  <Button variant="outline" size="sm" disabled>
                                    <Download className="h-4 w-4" />
                                    Download
                                  </Button>
                                )}
                                {share.kindSnapshot === "link" && share.urlSnapshot && (
                                  <Button asChild variant="outline" size="sm">
                                    <a href={share.urlSnapshot} target="_blank" rel="noopener noreferrer">
                                      <ArrowUpRight className="h-4 w-4" />
                                      Open
                                    </a>
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}

              {/* Send-files inbox — lives inside the repository, like the live page. */}
              <section aria-label="Enviar archivos">
                <div
                  className={`flex items-center gap-2 bg-[var(--secondary)]/40 px-4 py-2 ${
                    repoTotal === 0 ? "mt-4 border-t border-[var(--border)]" : ""
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
                  <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--secondary)]/40 p-6 text-center opacity-60 select-none">
                    <Upload className="mx-auto h-6 w-6 text-[var(--muted-foreground)]" />
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                      Upload form visible to partner on the live link
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted-foreground)]">Not interactive in admin preview</p>
                  </div>
                  {uploads.length > 0 && (
                    <div className="mt-4 border-t border-[var(--border)] pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">Enviados anteriormente</p>
                      <ul className="mt-2 space-y-1.5">
                        {uploads.map((u) => (
                          <li key={u.id} className="flex items-center gap-2 text-sm">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                            <span className="truncate">{u.label || u.originalFilename}</span>
                            <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">{formatRelativeEs(u.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            </div>

            {/* Messages section */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <MessageSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
                <div>
                  <h2 className="text-base font-semibold">Mensajes</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Preguntas, notas y novedades entre tú y el equipo.
                  </p>
                </div>
              </div>
              <div className="p-4">
                {messages.length === 0 ? (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Aún no hay mensajes.
                  </p>
                ) : (
                  <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                    {messages.map((message) => {
                      const fromPartner = message.authorKind === "partner";
                      return (
                        <li
                          key={message.id}
                          className={fromPartner ? "flex justify-end" : "flex"}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 ${
                              fromPartner
                                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                                : "bg-[var(--secondary)]"
                            }`}
                          >
                            <div
                              className={`text-[11px] ${
                                fromPartner
                                  ? "text-[var(--primary-foreground)] opacity-70"
                                  : "text-[var(--muted-foreground)]"
                              }`}
                            >
                              {message.authorName ?? (fromPartner ? "Partner" : "El equipo")} ·{" "}
                              {formatRelativeEs(message.createdAt)}
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
                              {message.body}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                  Composer visible to partner on the live link — not interactive in admin preview.
                </p>
              </div>
            </div>

          </div>

          <aside className="space-y-4">
            <RoomPeople
              hosts={detail.team.map((t) => ({
                id: t.id,
                displayName: t.displayName,
                title: t.title,
              }))}
              guests={detail.members
                .filter((m) => m.email)
                .map((m) => ({
                  id: m.id,
                  displayName: m.displayName,
                  roleLabel: m.roleLabel,
                  lastViewedAt: m.lastViewedAt,
                }))}
              youId={null}
            />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-center gap-2">
                <CheckSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
                <h2 className="text-base font-semibold">Próximos pasos</h2>
                {openSteps.length > 0 && (
                  <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {openSteps.length} pendiente{openSteps.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              {nextSteps.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">Aún no hay próximos pasos.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {nextSteps.map((step) => (
                    <li key={step.id} className="flex items-start gap-2 rounded-lg border border-[var(--border)] p-3">
                      <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${step.completedAt ? "border-green-500 bg-green-500 text-white" : "border-[var(--border)]"}`}>
                        {step.completedAt && <span className="text-[10px]">✓</span>}
                      </div>
                      <div>
                        <p className={`text-sm ${step.completedAt ? "line-through text-[var(--muted-foreground)]" : ""}`}>{step.text}</p>
                        {step.dueAt && (
                          <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Para {formatRelative(step.dueAt)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}


