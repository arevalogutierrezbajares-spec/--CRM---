import { CheckSquare, FileText, Lock, MessageSquare, Upload } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import {
  countClaimedSeats,
  getPartnerRoomMember,
  getPublicPartnerRoomByToken,
  listClaimableRoomMembers,
  listClaimedRoomMembers,
  recordPublicPartnerRoomView,
} from "@/db/queries/partner-access";
import { listPartnerNextStepsByRoom } from "@/db/queries/partner-next-steps";
import { listPartnerUploadsByRoom } from "@/db/queries/partner-uploads";
import { listPartnerRoomMessages } from "@/db/queries/partner-messages";
import { listRoomItems, listRoomComments } from "@/db/queries/partner-repository";
import { partnerKindLabel } from "@/lib/partner-access";
import {
  getPartnerMemberIdFromCookies,
  isPartnerRoomUnlocked,
} from "@/lib/partner-room-gate.server";
import { materialType } from "@/lib/materials/material-type";
import { PublicUploadForm } from "@/components/partner-access/public-upload-form";
import { PublicNextSteps } from "@/components/partner-access/public-next-steps";
import { PublicRoomMessages } from "@/components/partner-access/public-room-messages";
import { RoomSignIn } from "@/components/partner-access/room-sign-in";
import { CoBrandLockup } from "@/components/partner-access/co-brand-lockup";
import { RoomPeople } from "@/components/partner-access/room-people";
import {
  PublicRepository,
  type RepoShare as RepoShareView,
  type RepoItem as RepoItemView,
} from "@/components/partner-access/public-repository";
import type { RepoComment as RepoCommentView } from "@/components/partner-access/partner-comment-thread";

export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

export default async function PublicAccessRoomPage({
  params,
}: {
  params: Params;
}) {
  const { token } = await params;
  const access = await getPublicPartnerRoomByToken({ token }).catch(() => null);
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

  const [nextSteps, partnerUploads, messages, repoItems, repoComments, participants] =
    await Promise.all([
      listPartnerNextStepsByRoom({ roomId: access.room.id }).catch(() => []),
      listPartnerUploadsByRoom({ roomId: access.room.id }).catch(() => []),
      listPartnerRoomMessages({ roomId: access.room.id }).catch(() => []),
      listRoomItems({ roomId: access.room.id }).catch(() => []),
      listRoomComments({ roomId: access.room.id }).catch(() => []),
      listClaimedRoomMembers({ roomId: access.room.id }).catch(() => []),
    ]);

  const mentionCandidates = [
    "Team",
    ...participants.map((p) => p.displayName).filter((n): n is string => Boolean(n)),
  ];

  const shares = access.shares;
  const lastShared = shares[0]?.sharedAt ?? access.room.updatedAt;
  const openSteps = nextSteps.filter((s) => !s.completedAt);
  // new Date().getTime() (not Date.now()) — the repo's purity lint bans Date.now
  // in render; this server-snapshot is passed to the client for overdue checks.
  const nowMs = new Date().getTime();

  const commentsByTarget: Record<string, RepoCommentView[]> = {};
  for (const c of repoComments) {
    const key = `${c.targetKind}:${c.targetId}`;
    (commentsByTarget[key] ??= []).push({
      id: c.id,
      body: c.body,
      authorKind: c.authorKind,
      authorName: c.authorName,
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
  }));

  const firstName = access.contact.name?.trim().split(/\s+/)[0] ?? null;
  const totalItems = shares.length + repoItemViews.length;

  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 md:px-8 md:py-8">
        <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 md:p-9">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 60%), radial-gradient(120% 80% at 100% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 55%)",
            }}
          />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <CoBrandLockup
                brandLogos={access.brandLogos}
                clientLogoUrl={access.contact.logoUrl}
                clientName={access.contact.name}
                size={64}
              />
              <p className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--primary)]">
                <Lock className="h-3 w-3" />
                Sala privada · {partnerKindLabel(access.room.partnerKind)}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                {firstName ? `Bienvenido, ${firstName}` : "Bienvenido"}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-foreground)]">
                {access.room.welcomeMessage ??
                  `Todo lo que estamos trabajando juntos vive aquí — documentos, novedades y una línea directa con el equipo. Estás en tu casa.`}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Stat label="En tu sala" value={totalItems} />
              {openSteps.length > 0 && <Stat label="Para ti" value={openSteps.length} />}
              <Stat label="Actualizado" value={formatRelative(lastShared)} />
            </div>
          </div>
        </header>

        {/* The alliance leads on mobile (warmth + who's here), then folds into
            the desktop sidebar. */}
        {(access.team.length > 0 || participants.length > 0) && (
          <div className="lg:hidden">
            <RoomPeople
              hosts={access.team.map((t) => ({
                id: t.id,
                displayName: t.displayName,
                title: t.title,
              }))}
              guests={participants}
              youId={member?.id ?? null}
            />
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4 lg:order-1">
            <PublicRepository
              token={token}
              shares={repoShares}
              items={repoItemViews}
              commentsByTarget={commentsByTarget}
              ownerLabel="El equipo"
            />
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
                <PublicRoomMessages
                  token={token}
                  ownerLabel="El equipo"
                  mentionCandidates={mentionCandidates}
                  initialMessages={messages.map((m) => ({
                    id: m.id,
                    body: m.body,
                    authorKind: m.authorKind,
                    authorName: m.authorName,
                    createdAt: m.createdAt.toISOString(),
                  }))}
                />
              </div>
            </div>

            {/* Partner uploads section */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <Upload className="h-4 w-4 text-[var(--muted-foreground)]" />
                <div>
                  <h2 className="text-base font-semibold">Enviar archivos</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    Envía documentos al equipo — contratos, firmas, recursos.
                  </p>
                </div>
              </div>
              <div className="p-4">
                <PublicUploadForm token={token} />
                {partnerUploads.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                      Enviados anteriormente
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {partnerUploads.map((u) => (
                        <li key={u.id} className="flex items-center gap-2 text-sm">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--muted-foreground)]" />
                          <span className="truncate">{u.label || u.originalFilename}</span>
                          <span className="ml-auto shrink-0 text-xs text-[var(--muted-foreground)]">
                            {formatRelative(u.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* On mobile the aside leads (team + next steps first); on desktop it
              returns to the right column. */}
          <aside className="space-y-4 lg:order-2">
            <div className="hidden lg:block">
              <RoomPeople
                hosts={access.team.map((t) => ({
                  id: t.id,
                  displayName: t.displayName,
                  title: t.title,
                }))}
                guests={participants}
                youId={member?.id ?? null}
              />
            </div>

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
              <div className="mt-3">
                <PublicNextSteps token={token} initialSteps={nextSteps} nowMs={nowMs} />
              </div>
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

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--background)]/60 px-4 py-2.5 backdrop-blur">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function UnavailableRoom() {
  return (
    <main className="min-h-screen bg-[var(--bg-page)]">
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
