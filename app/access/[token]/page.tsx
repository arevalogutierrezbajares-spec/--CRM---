import { cache } from "react";
import type { Metadata } from "next";
import { ArrowRight, Lock, MessageSquare } from "lucide-react";
import { RoomActivityProvider } from "@/components/partner-access/room-activity-context";
import { HeroActionChips } from "@/components/partner-access/hero-action-chips";
import { Reveal } from "@/components/partner-access/reveal";
import { RoomPulse } from "@/components/partner-access/room-pulse";
import {
  getRoomDict,
  resolveRoomLocale,
  formatRoomRelative,
  roomDir,
} from "@/lib/partner-room-i18n";
import { RoomI18nProvider } from "@/components/partner-access/room-i18n";
import { SITE_URL } from "@/lib/site-url";
import { roomHeroVideo } from "@/lib/partner-room-videos";
import { RoomHeroVideo } from "@/components/partner-access/room-hero-video";
import { roomHeroImageUrl } from "@/lib/partner-room-hero-images";
import { RoomHeroGallery } from "@/components/partner-access/room-hero-gallery";
import { roomHeroPhotoSet } from "@/lib/partner-room-photos";
import { RoomHeroArchive } from "@/components/partner-access/room-hero-archive";
import {
  translateForRoom,
  localizeForRoom,
} from "@/lib/partner-room-translate.server";
import { TranslatedText } from "@/components/partner-access/translated-text";
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
import { RoomPresentations, type RoomDeck } from "@/components/partner-access/room-presentations";
import { HeroAurora } from "@/components/partner-access/hero-aurora";
import { LiveGreeting } from "@/components/partner-access/live-greeting";
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
    return { title: getRoomDict("es").meta.privateRoomTitle, robots };
  }

  const t = getRoomDict(access.room.locale);
  const title = access.room.name;
  const description = access.room.welcomeMessage ?? t.meta.description;
  const heroVideo = roomHeroVideo(access.room.heroVideoKey);
  const heroPhotos = roomHeroPhotoSet(access.room.heroVideoKey);
  const heroImage = roomHeroImageUrl(access.room);
  // Same precedence as the hero itself: video poster, else archive photo,
  // else generated image — and every room without hero media falls back to
  // the branded AGB card, so shared links always carry the AGB identity.
  const brandCard =
    access.room.locale === "es" ? "/og/agb-room.png" : "/og/agb-room-en.png";
  const ogImage = heroVideo
    ? { url: `${SITE_URL}${heroVideo.poster}`, width: 1280, height: 720 }
    : heroPhotos
      ? { url: `${SITE_URL}${heroPhotos.images[0].src}`, width: 1852, height: 1462 }
      : heroImage
        ? { url: `${SITE_URL}${heroImage}`, width: 2048, height: 1024 }
        : { url: `${SITE_URL}${brandCard}`, width: 1200, height: 630 };

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: t.meta.ogSiteName,
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
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
      <RoomI18nProvider locale={access.room.locale}>
        <div lang={access.room.locale} dir={roomDir(access.room.locale)}>
          <RoomSignIn
            token={token}
            roomName={access.room.name}
            needsPin={needsPin}
            needsIdentity={needsIdentity}
            claimableMembers={claimable}
            seatsLeft={seatsLeft}
          />
        </div>
      </RoomI18nProvider>
    );
  }

  await recordPublicPartnerRoomView({
    roomId: access.room.id,
    workspaceId: access.room.workspaceId,
    contactId: access.contact.id,
    memberId: member?.id ?? null,
    memberEmail: member?.email ?? null,
  }).catch(() => {});

  // Room language + a translate helper. Operator-authored content (labels,
  // steps, demo, welcome) is written in es/en; for pt/ru/ar guests it's
  // machine-translated and cached (no-op + instant for es/en). Null/empty
  // passes through unchanged so "no description" stays absent, not "".
  const locale = resolveRoomLocale(access.room.locale);
  const tr = (s: string | null | undefined): Promise<string> =>
    translateForRoom(s, locale, { workspaceId: access.room.workspaceId });
  const trNull = async (s: string | null | undefined): Promise<string | null> =>
    (s ?? "").trim() ? await tr(s) : (s ?? null);

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
      // Team comments are authored in es/en; translate for pt/ru/ar guests.
      body: c.authorKind !== "partner" ? await tr(c.body) : c.body,
      authorKind: c.authorKind,
      authorName: teamName(c.authorKind, c.authorName),
      createdAt: c.createdAt.toISOString(),
    });
  }

  const repoShares: RepoShareView[] = await Promise.all(shares.map(async (share) => {
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
      title: await tr(share.liveLabel ?? share.labelSnapshot),
      description: await trNull(share.description),
      projectTitle: share.projectTitle,
      kindSnapshot: share.kindSnapshot,
      permissions: share.permissions,
      sizeBytes: share.sizeBytes,
      mimeType: share.mimeType,
      isHtmlDeck,
      isLink: share.kindSnapshot === "link" && Boolean(share.urlSnapshot),
      urlSnapshot: share.urlSnapshot,
      canDownload:
        share.kindSnapshot === "file" &&
        Boolean(share.storagePath) &&
        share.permissions.includes("download"),
      section: share.roomSection,
    };
  }));

  // HTML decks get their own prominent "Presentaciones" surface; everything
  // else stays in the repository list.
  const roomDecks: RoomDeck[] = repoShares
    .filter((s) => s.isHtmlDeck)
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      projectTitle: s.projectTitle,
    }));
  const nonDeckShares = repoShares.filter((s) => !s.isHtmlDeck);

  const repoItemViews: RepoItemView[] = await Promise.all(
    repoItems.map(async (item) => ({
      id: item.id,
      title: await tr(item.title),
      description: await trNull(item.description),
      kind: item.kind,
      url: item.url,
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      category: item.category,
    })),
  );

  // Greet the signed-in guest by their own name; fall back to the contact's
  // first word only when nobody has claimed a seat (org names can read oddly,
  // but a personal greeting for the actual viewer always wins).
  const firstName =
    member?.displayName?.trim().split(/\s+/)[0] ??
    access.contact.name?.trim().split(/\s+/)[0] ??
    null;
  const heroVideo = roomHeroVideo(access.room.heroVideoKey);
  const heroPhotos = roomHeroPhotoSet(access.room.heroVideoKey);
  const heroImage = roomHeroImageUrl(access.room);
  // Full-bleed media behind the hero (preset video/photo set wins over a
  // generated image); when present, hero text goes white-on-gradient.
  const onHeroMedia = Boolean(heroVideo || heroPhotos || heroImage);

  // Team-authored messages are written in es/en; translate them for pt/ru/ar
  // guests. The guest's own messages (authorKind "partner") are left untouched.
  const localizedMessages = await Promise.all(
    messages.map(async (m) => ({
      ...m,
      body: m.authorKind !== "partner" ? await tr(m.body) : m.body,
    })),
  );
  const lastMessage =
    localizedMessages.length > 0
      ? localizedMessages[localizedMessages.length - 1]
      : null;

  // Room language → dictionary. Server-rendered strings read `t` directly;
  // client components read the same dict from RoomI18nProvider context.
  // (`locale` is defined above so translation is available while shaping data.)
  const dict = getRoomDict(locale);

  // Operator-authored welcome copy, machine-translated for pt/ru/ar guests.
  // localize* returns { display, original } so the hero can offer "show original".
  const welcome = await localizeForRoom(access.room.welcomeMessage, locale, {
    workspaceId: access.room.workspaceId,
  });

  // Next-step text and the featured demo's copy get the same treatment. Counts
  // (openSteps) use the untranslated list — only the displayed text is localized.
  const localizedNextSteps = await Promise.all(
    nextSteps.map(async (s) => ({ ...s, text: await tr(s.text) })),
  );
  const demoView = demoLink
    ? {
        ...demoLink,
        label: await tr(demoLink.label),
        description: await trNull(demoLink.description),
        accessNotes: await trNull(demoLink.accessNotes),
      }
    : null;

  return (
    <main lang={locale} dir={roomDir(locale)} className="min-h-screen bg-[var(--bg-page)]">
      <RoomI18nProvider locale={locale}>
      <RoomActivityProvider
        initialOpenSteps={openSteps.length}
        initialPendingSignatures={pendingSignatures}
      >
      {/* Presence heartbeat + periodic server-snapshot refresh while visible. */}
      <RoomPulse token={token} />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 py-5 md:px-8 md:py-8">
        <Reveal>
        <header
          className={`relative overflow-hidden rounded-2xl border p-6 md:p-9 ${
            onHeroMedia
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
          ) : heroPhotos ? (
            <RoomHeroArchive images={heroPhotos.images} caption={heroPhotos.caption} />
          ) : heroImage ? (
            <RoomHeroGallery images={[heroImage]} />
          ) : (
            <HeroAurora />
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
                  onHeroMedia ? "text-white/80" : "text-[var(--primary)]"
                }`}
              >
                <Lock className="h-3 w-3" />
                {dict.hero.eyebrow} · {dict.partner.publicLabel}
              </p>
              <LiveGreeting
                firstName={firstName}
                subline={dict.hero.subline}
                sublineOnVideo={onHeroMedia}
                className={`mt-2 text-3xl font-semibold tracking-tight md:text-4xl ${
                  onHeroMedia ? "text-white" : ""
                }`}
              />
              <p
                className={`mt-3 max-w-2xl text-base leading-7 ${
                  onHeroMedia ? "text-white/85" : "text-[var(--muted-foreground)]"
                }`}
              >
                <TranslatedText
                  display={welcome.display || dict.hero.welcomeFallback}
                  original={welcome.original}
                />
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {/* Live chips — they track step toggles and signatures on the
                  page without a reload (RoomActivityProvider). */}
              <HeroActionChips
                initialOpenSteps={openSteps.length}
                initialPendingSignatures={pendingSignatures}
                onVideo={onHeroMedia}
              />
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-colors ${
                  onHeroMedia
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
                        : onHeroMedia
                          ? "bg-white/40"
                          : "bg-[var(--muted-foreground)]/40"
                    }`}
                  />
                </span>
                {dict.hero.updated(formatRoomRelative(lastUpdated, locale))}
              </span>
            </div>
          </div>
        </header>
        </Reveal>

        {/* Messages get top billing: the latest exchange, one tap from replying. */}
        <Reveal delay={0.12}>
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
                {dict.messagesCta.lastMessagePrefix} ·{" "}
                {lastMessage.authorKind === "partner"
                  ? lastMessage.authorName ?? dict.common.you
                  : teamName(lastMessage.authorKind, lastMessage.authorName) ??
                    dict.common.team}{" "}
                · {formatRoomRelative(lastMessage.createdAt, locale)}
              </span>
              <span title={lastMessage.body} className="block truncate text-sm">
                {lastMessage.body}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {dict.messagesCta.emptyTitle}
              </span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                {dict.messagesCta.emptySub}
              </span>
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--primary)]">
            {lastMessage ? dict.messagesCta.reply : dict.messagesCta.write}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </a>
        </Reveal>

        {/* The alliance leads on mobile (warmth + who's here), then folds into
            the desktop sidebar. */}
        {(access.team.length > 0 || participants.length > 0) && (
          <Reveal delay={0.2} className="lg:hidden">
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
              nowMs={nowMs}
            />
          </Reveal>
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4 lg:order-1">
            {roomDecks.length > 0 && (
              <Reveal delay={0.16} inView>
                <RoomPresentations token={token} decks={roomDecks} />
              </Reveal>
            )}
            {demoView && (
              <Reveal delay={0.2} inView>
              <div id="demo" className="scroll-mt-6">
                <DemoAccessCard
                  label={demoView.label}
                  description={demoView.description}
                  url={demoView.url}
                  username={demoView.username}
                  password={demoView.password}
                  accessNotes={demoView.accessNotes}
                  variant="room"
                />
              </div>
              </Reveal>
            )}
            <Reveal delay={0.24} inView>
            <div id="repositorio" className="scroll-mt-6">
            <PublicRepository
              token={token}
              shares={nonDeckShares}
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
              ownerLabel={dict.common.team}
            />
            </div>
            </Reveal>

            {/* Messages section */}
            <Reveal inView>
            <div
              id="mensajes"
              className="scroll-mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)]"
            >
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <MessageSquare className="h-4 w-4 text-[var(--muted-foreground)]" />
                <div>
                  <h2 className="text-base font-semibold">{dict.messages.title}</h2>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {dict.messages.subtitle}
                  </p>
                </div>
              </div>
              <div className="p-4">
                <PublicRoomMessages
                  token={token}
                  ownerLabel={dict.common.team}
                  mentionCandidates={mentionCandidates}
                  initialMessages={localizedMessages.map((m) => ({
                    id: m.id,
                    body: m.body,
                    authorKind: m.authorKind,
                    authorName: teamName(m.authorKind, m.authorName),
                    createdAt: m.createdAt.toISOString(),
                  }))}
                  lastSeenAtIso={member?.lastViewedAt?.toISOString() ?? null}
                  nowMs={nowMs}
                />
              </div>
            </div>
            </Reveal>
          </div>

          {/* On mobile the aside leads (team + next steps first); on desktop it
              returns to the right column. */}
          <aside className="space-y-4 lg:order-2">
            <Reveal delay={0.28} className="hidden lg:block">
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
                nowMs={nowMs}
              />
            </Reveal>

            <Reveal delay={0.34}>
            <div
              id="pasos"
              className="scroll-mt-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              {/* Header + badge render inside the client component so the
                  pending count stays in sync as the partner checks steps. */}
              <PublicNextSteps token={token} initialSteps={localizedNextSteps} nowMs={nowMs} />
            </div>
            </Reveal>
          </aside>
        </section>

        <footer className="mt-2 flex flex-col items-center gap-2 border-t border-[var(--border)] pt-5 text-center text-xs text-[var(--muted-foreground)]">
          {/* The sign-in's Bolívar quote echoes here as the room's signature. */}
          <p className="font-serif text-[13px] italic text-[#B8913F]">
            «{dict.footer.bolivarQuote}» — {dict.footer.bolivarAttribution}
          </p>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            {dict.footer.confidential}
          </span>
          <span>{dict.footer.noForward}</span>
        </footer>
      </div>
      </RoomActivityProvider>
      </RoomI18nProvider>
    </main>
  );
}

function UnavailableRoom() {
  // No room resolved → no locale to key off. Default to Spanish (the room's
  // default language); the dead-link page is locale-agnostic by nature.
  const dict = getRoomDict("es");
  return (
    <main lang="es" className="min-h-screen bg-[var(--bg-page)]">
      <div className="mx-auto grid min-h-screen w-full max-w-2xl place-items-center px-5 py-10">
        <div className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--secondary)]">
            <Lock className="h-5 w-5 text-[var(--muted-foreground)]" />
          </div>
          <h1 className="mt-4 text-xl font-semibold">{dict.unavailable.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">
            {dict.unavailable.body}
          </p>
        </div>
      </div>
    </main>
  );
}
