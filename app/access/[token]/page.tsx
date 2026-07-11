import { cache } from "react";
import type { Metadata } from "next";
import { ArrowRight, Lock, MessageSquare } from "lucide-react";
import { formatRelativeEs } from "@/lib/utils";
import { SITE_URL } from "@/lib/site-url";
import { roomHeroVideo } from "@/lib/partner-room-videos";
import { RoomHeroVideo } from "@/components/partner-access/room-hero-video";
import {
  countClaimedSeats,
  getPartnerRoomMember,
  getPublicPartnerRoomByToken,
  listClaimableRoomMembers,
  listClaimedRoomMembers,
  recordPublicPartnerRoomView,
} from "@/db/queries/partner-access";
import { listPartnerNextStepsByRoom } from "@/db/queries/partner-next-steps";
import { listSignatureRequestsByRoom } from "@/db/queries/partner-signatures";
import { listPartnerUploadsByRoom } from "@/db/queries/partner-uploads";
import { listPartnerRoomMessages } from "@/db/queries/partner-messages";
import { getDemoLinkById } from "@/db/queries/demo-links";
import { DemoAccessCard } from "@/components/demo-access/demo-access-card";
import { listRoomItems, listRoomComments } from "@/db/queries/partner-repository";
import { partnerKindLabel } from "@/lib/partner-access";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { materialType } from "@/lib/materials/material-type";
import { PublicNextSteps } from "@/components/partner-access/public-next-steps";
import { PublicRoomMessages } from "@/components/partner-access/public-room-messages";
import { RoomSignIn } from "@/components/partner-access/room-sign-in";
import { CoBrandLockup } from "@/components/partner-access/co-brand-lockup";
import { RoomPeople } from "@/components/partner-access/room-people";
import { founderProfileFor } from "@/lib/founder-photos";
import {
  PublicRepository,
  type RepoShare as RepoShareView,
  type RepoItem as RepoItemView,
} from "@/components/partner-access/public-repository";
import type { RepoComment as RepoCommentView } from "@/components/partner-access/partner-comment-thread";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

// Deduped per request: generateMetadata and the page share one DB lookup.
const getRoomAccess = cache((token: string) =>
  getPublicPartnerRoomByToken({ token }).catch(() => null),
);

/**
 * Link previews (WhatsApp/iMessage/Slack) show the room's own identity —
 * its name, welcome message, and hero-video poster — instead of the app-wide
 * AGB metadata. The room name is already visible on the sign-in gate, so this
 * exposes nothing the link alone doesn't. Private rooms stay out of search.
 */
export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { token } = await params;
  const access = await getRoomAccess(token);
  const robots = { index: false, follow: false };

  if (!access) {
    return { title: "Sala privada", robots };
  }

  const title = access.room.name;
  const description =
    access.room.welcomeMessage ??
    "Documentos, novedades y una línea directa con el equipo — todo en tu sala privada.";
  const heroVideo = roomHeroVideo(access.room.heroVideoKey);

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Sala privada",
      ...(heroVideo
        ? { images: [{ url: `${SITE_URL}${heroVideo.poster}`, width: 1280, height: 720 }] }
        : {}),
    },
    twitter: {
      card: heroVideo ? "summary_large_image" : "summary",
      title,
      description,
    },
  };
}

export default async function PublicAccessRoomPage({
  params,
}: {
  params: Params;
}) {
  const { token } = await params;
  const access = await getRoomAccess(token);
  if (!access) return <UnavailableRoom />;

  const unlocked = await isPartnerRoomUnlocked(access.room);
  const memberId = await getPartnerMemberIdFromCookies(access.room.id);
  const member = memberId
    ? await getPartnerRoomMember({
        roomId: access.room.id,
        memberId,
      }).catch(() => null)
    : null;

  // Managed rooms (a seat limit is set) require the guest to sign in; a passcode
  // adds a PIN step. Both happen on the branded sign-in screen.
  const needsPin = Boolean(access.room.passcodeHash) && !unlocked;
  const needsIdentity = access.room.seatLimit !== null && !member;
  if (needsPin || needsIdentity) {
    const [claimable, claimed] = await Promise.all([
      needsIdentity
        ? listClaimableRoomMembers({ roomId: access.room.id }).catch(() => [])
        : Promise.resolve([]),
      access.room.seatLimit !== null
        ? countClaimedSeats({ roomId: access.room.id }).catch(() => 0)
        : Promise.resolve(0),
    ]);
    const seatsLeft =
      access.room.seatLimit !== null
        ? Math.max(0, access.room.seatLimit - claimed)
        : null;
    return (
      <RoomSignIn
        token={token}
        roomName={access.room.name}
        needsPin={needsPin}
        needsIdentity={needsIdentity}
        claimableMembers={claimable}
        seatsLeft={seatsLeft}
      />
    );
  }

  await recordPublicPartnerRoomView({
    roomId: access.room.id,
    workspaceId: access.room.workspaceId,
    contactId: access.contact.id,
    memberId: member?.id ?? null,
    memberEmail: member?.email ?? null,
  }).catch(() => {});

  const [
    nextSteps,
    partnerUploads,
    messages,
    repoItems,
    repoComments,
    participants,
    signatureRequests,
  ] = await Promise.all([
    listPartnerNextStepsByRoom({ roomId: access.room.id }).catch(() => []),
    listPartnerUploadsByRoom({ roomId: access.room.id }).catch(() => []),
    listPartnerRoomMessages({ roomId: access.room.id }).catch(() => []),
    listRoomItems({ roomId: access.room.id }).catch(() => []),
    listRoomComments({ roomId: access.room.id }).catch(() => []),
    listClaimedRoomMembers({ roomId: access.room.id }).catch(() => []),
    listSignatureRequestsByRoom({ roomId: access.room.id }).catch(() => []),
  ]);

  // Featured product demo, if the room has one attached.
  const demoLink = access.room.demoLinkId
    ? await getDemoLinkById({
        id: access.room.demoLinkId,
        workspaceId: access.room.workspaceId,
      }).catch(() => null)
    : null;

  // Signature state per repository entry; voided requests stay invisible.
  const signaturesByTarget: Record<
    string,
    {
      requestId: string;
      status: "pending" | "signed";
      message: string | null;
      signerName: string | null;
      signedAt: string | null;
      hasSignedPdf: boolean;
    }
  > = {};
  for (const r of signatureRequests) {
    if (r.status === "voided") continue;
    signaturesByTarget[`${r.targetKind}:${r.targetId}`] = {
      requestId: r.id,
      status: r.status === "signed" ? "signed" : "pending",
      message: r.message,
      signerName: r.signature?.signerName ?? null,
      signedAt: r.signature?.signedAt?.toISOString() ?? null,
      hasSignedPdf: Boolean(r.signature?.signedPdfPath),
    };
  }
  const pendingSignatures = signatureRequests.filter((r) => r.status === "pending").length;

  const mentionCandidates = [
    "Equipo",
    ...participants.map((p) => p.displayName).filter((n): n is string => Boolean(n)),
  ];

  const shares = access.shares;
  const openSteps = nextSteps.filter((s) => !s.completedAt);
  // new Date().getTime() (not Date.now()) — the repo's purity lint bans Date.now
  // in render; this server-snapshot is passed to the client for overdue checks.
  const nowMs = new Date().getTime();

  // "Actualizado" reflects the newest thing the partner can actually see —
  // shares, messages, and repository items — not just the last share.
  const lastUpdated = new Date(
    Math.max(
      shares[0]?.sharedAt?.getTime() ?? 0,
      messages[messages.length - 1]?.createdAt.getTime() ?? 0,
      ...repoItems.map((item) => item.createdAt.getTime()),
      access.room.updatedAt.getTime(),
    ),
  );
  const isFreshUpdate = nowMs - lastUpdated.getTime() < 7 * 24 * 60 * 60 * 1000;

  const commentsByTarget: Record<string, RepoCommentView[]> = {};
  // Team-authored content shows the founder's partner-facing name instead of
  // the raw account handle ("tg.2000" → "Tomás Gutiérrez").
  const teamName = (kind: string, name: string | null) =>
    kind !== "partner" && name
      ? founderProfileFor(name)?.displayName ?? name
      : name;

  for (const c of repoComments) {
    const key = `${c.targetKind}:${c.targetId}`;
    (commentsByTarget[key] ??= []).push({
      id: c.id,
      body: c.body,
      authorKind: c.authorKind,
      authorName: teamName(c.authorKind, c.authorName),
      createdAt: c.createdAt.toISOString(),
    });
  }

  const repoShares: RepoShareView[] = shares.map((share) => {
    const isHtmlDeck =
      share.kindSnapshot === "file" &&
      Boolean(share.storagePath) &&
      materialType(
        share.kindSnapshot,
        share.mimeType,
        share.originalFilename ?? share.labelSnapshot,
      ).key === "html";
    return {
      id: share.id,
      title: share.liveLabel ?? share.labelSnapshot,
      description: share.description,
      projectTitle: share.projectTitle,
      kindSnapshot: share.kindSnapshot,
      permissions: share.permissions,
      sizeBytes: share.sizeBytes,
      isHtmlDeck,
      isLink: share.kindSnapshot === "link" && Boolean(share.urlSnapshot),
      urlSnapshot: share.urlSnapshot,
      canDownload:
        share.kindSnapshot === "file" &&
        Boolean(share.storagePath) &&
        share.permissions.includes("download"),
      section: share.roomSection,
    };
  });

  const repoItemViews: RepoItemView[] = repoItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    kind: item.kind,
    url: item.url,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    category: item.category,
  }));

  // Greet the signed-in guest by their own name; fall back to the contact's
  // first word only when nobody has claimed a seat (org names can read oddly,
  // but a personal greeting for the actual viewer always wins).
  const firstName =
    member?.displayName?.trim().split(/\s+/)[0] ??
    access.contact.name?.trim().split(/\s+/)[0] ??
    null;
  const heroVideo = roomHeroVideo(access.room.heroVideoKey);
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;

  return (
    <main lang="es" className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 md:px-8 md:py-8">
        <header
          className={`relative overflow-hidden rounded-2xl border p-6 md:p-9 ${
            heroVideo
              ? "flex min-h-[280px] flex-col justify-end border-black/20 md:min-h-[340px]"
              : "border-[var(--border)] bg-[var(--card)]"
          }`}
        >
          {heroVideo ? (
            <RoomHeroVideo
              mp4={heroVideo.mp4}
              webm={heroVideo.webm}
              poster={heroVideo.poster}
            />
          ) : (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 60%), radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 55%)",
              }}
            />
          )}
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <CoBrandLockup
                brandLogos={access.brandLogos}
                clientLogoUrl={access.contact.logoUrl}
                clientName={access.contact.name}
                size={64}
              />
              <p
                className={`mt-5 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] ${
                  heroVideo ? "text-white/80" : "text-[var(--primary)]"
                }`}
              >
                <Lock className="h-3 w-3" />
                Sala privada · {partnerKindLabel(access.room.partnerKind)}
              </p>
              <h1
                className={`mt-2 text-3xl font-semibold tracking-tight md:text-4xl ${
                  heroVideo ? "text-white" : ""
                }`}
              >
                {firstName
                  ? `Te damos la bienvenida, ${firstName}`
                  : "Te damos la bienvenida"}
              </h1>
              <p
                className={`mt-3 max-w-2xl text-base leading-7 ${
                  heroVideo ? "text-white/85" : "text-[var(--muted-foreground)]"
                }`}
              >
                {access.room.welcomeMessage ??
                  `Todo lo que estamos trabajando juntos vive aquí — documentos, novedades y una línea directa con el equipo. Estás en tu casa.`}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {openSteps.length > 0 && (
                <a
                  href="#pasos"
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                    heroVideo
                      ? "border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-white/80"
                      : "border-[var(--border)] bg-[var(--background)]/60 backdrop-blur hover:bg-[var(--secondary)] focus-visible:ring-[var(--ring)]"
                  }`}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400/90 text-[11px] font-semibold tabular-nums text-amber-950">
                    {openSteps.length}
                  </span>
                  {openSteps.length === 1 ? "paso para ti" : "pasos para ti"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}
              {pendingSignatures > 0 && (
                <a
                  href="#repositorio"
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                    heroVideo
                      ? "border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-white/80"
                      : "border-[var(--border)] bg-[var(--background)]/60 backdrop-blur hover:bg-[var(--secondary)] focus-visible:ring-[var(--ring)]"
                  }`}
                >
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400/90 text-[11px] font-semibold tabular-nums text-amber-950">
                    {pendingSignatures}
                  </span>
                  {pendingSignatures === 1 ? "firma pendiente" : "firmas pendientes"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors ${
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

        {/* Messages get top billing: the latest exchange, one tap from replying. */}
        <a
          href="#mensajes"
          className="group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 transition-colors hover:border-[var(--primary)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--primary)]/10">
            <MessageSquare className="h-4 w-4 text-[var(--primary)]" />
          </span>
          {lastMessage ? (
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-[var(--muted-foreground)]">
                Último mensaje ·{" "}
                {lastMessage.authorKind === "partner"
                  ? lastMessage.authorName ?? "Tú"
                  : teamName(lastMessage.authorKind, lastMessage.authorName) ??
                    "El equipo"}{" "}
                · {formatRelativeEs(lastMessage.createdAt)}
              </span>
              <span title={lastMessage.body} className="block truncate text-sm">
                {lastMessage.body}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                ¿Preguntas o ideas? Escríbenos.
              </span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                El equipo responde aquí mismo, en tu sala.
              </span>
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--primary)]">
            {lastMessage ? "Responder" : "Escribir"}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </a>

        {/* The alliance leads on mobile (warmth + who's here), then folds into
            the desktop sidebar. */}
        {(access.team.length > 0 || participants.length > 0) && (
          <div className="lg:hidden">
            <RoomPeople
              hosts={access.team.map((t) => {
                const founder = founderProfileFor(t.displayName, t.email);
                return {
                  id: t.id,
                  displayName: founder?.displayName ?? t.displayName,
                  title: t.title ?? founder?.title ?? null,
                  photoUrl: founder?.photoUrl ?? null,
                };
              })}
              guests={participants}
              youId={member?.id ?? null}
            />
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4 lg:order-1">
            {demoLink && (
              <div id="demo" className="scroll-mt-6">
                <DemoAccessCard
                  label={demoLink.label}
                  description={demoLink.description}
                  url={demoLink.url}
                  username={demoLink.username}
                  password={demoLink.password}
                  accessNotes={demoLink.accessNotes}
                  variant="room"
                />
              </div>
            )}
            <div id="repositorio" className="scroll-mt-6">
            <PublicRepository
              token={token}
              shares={repoShares}
              items={repoItemViews}
              uploads={partnerUploads.map((u) => ({
                id: u.id,
                label: u.label,
                originalFilename: u.originalFilename,
                createdAt: u.createdAt.toISOString(),
              }))}
              commentsByTarget={commentsByTarget}
              signaturesByTarget={signaturesByTarget}
              defaultSignerName={member?.displayName ?? ""}
              ownerLabel="El equipo"
            />
            </div>

            {/* Messages section */}
            <div
              id="mensajes"
              className="scroll-mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)]"
            >
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
                <PublicRoomMessages
                  token={token}
                  ownerLabel="El equipo"
                  mentionCandidates={mentionCandidates}
                  initialMessages={messages.map((m) => ({
                    id: m.id,
                    body: m.body,
                    authorKind: m.authorKind,
                    authorName: teamName(m.authorKind, m.authorName),
                    createdAt: m.createdAt.toISOString(),
                  }))}
                />
              </div>
            </div>
          </div>

          {/* On mobile the aside leads (team + next steps first); on desktop it
              returns to the right column. */}
          <aside className="space-y-4 lg:order-2">
            <div className="hidden lg:block">
              <RoomPeople
                hosts={access.team.map((t) => {
                  const founder = founderProfileFor(t.displayName, t.email);
                  return {
                    id: t.id,
                    displayName: founder?.displayName ?? t.displayName,
                    title: t.title ?? founder?.title ?? null,
                    photoUrl: founder?.photoUrl ?? null,
                  };
                })}
                guests={participants}
                youId={member?.id ?? null}
              />
            </div>

            <div
              id="pasos"
              className="scroll-mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              {/* Header + badge render inside the client component so the
                  pending count stays in sync as the partner checks steps. */}
              <PublicNextSteps token={token} initialSteps={nextSteps} nowMs={nowMs} />
            </div>
          </aside>
        </section>

        <footer className="mt-2 flex flex-col items-center gap-1 border-t border-[var(--border)] pt-5 text-center text-xs text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Privado y confidencial — compartido solo contigo.
          </span>
          <span>Esta sala es privada. Por favor, no reenvíes el enlace.</span>
        </footer>
      </div>
    </main>
  );
}

function UnavailableRoom() {
  return (
    <main lang="es" className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)]">
            <Lock className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">Acceso no disponible</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            Esta sala pudo haber expirado, estar en pausa o haber sido reemplazada
            por un nuevo enlace. Pide a quien te lo compartió el enlace más reciente.
          </p>
        </div>
      </div>
    </main>
  );
}
