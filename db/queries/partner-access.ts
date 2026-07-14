import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { pgErrorCode } from "@/lib/server-action-guard";
import {
  createPartnerAccessToken,
  encryptRoomToken,
  hashPartnerAccessToken,
} from "@/lib/partner-access-token.server";
import {
  hashPartnerRoomPasscode,
  verifyPasscodeAgainstHash,
  PARTNER_PASSCODE_LOCK_MINUTES,
  PARTNER_PASSCODE_MAX_ATTEMPTS,
} from "@/lib/partner-room-gate.server";
import type { RoomLocale } from "@/lib/partner-room-i18n";
import type {
  PartnerKind,
  PartnerPermission,
  PartnerRoomStatus,
  PartnerShareChannel,
} from "@/lib/partner-access";

export type PartnerAccessRoom = typeof schema.partnerRooms.$inferSelect & {
  shareCount: number;
  memberCount: number;
  /** Signature request state for the board (dashboard query only). */
  pendingSignatures?: number;
  signedSignatures?: number;
  /** True when surfaced via the contact's organization (room belongs to the org). */
  viaOrg?: boolean;
};

export type PartnerAccessShare = typeof schema.partnerShares.$inferSelect & {
  contactName: string | null;
  projectTitle: string | null;
  liveLabel: string | null;
  roomName: string | null;
  sharedByName: string | null;
  meetingTitle: string | null;
  lobLogoUrl: string | null;
  lobLogoUrlDark: string | null;
};

export type PartnerAccessOverview = {
  rooms: PartnerAccessRoom[];
  shares: PartnerAccessShare[];
};

export type PartnerAccessRoomMember =
  typeof schema.partnerRoomMembers.$inferSelect;

export type PartnerAccessRoomEvent =
  typeof schema.partnerAccessEvents.$inferSelect & {
    actorName: string | null;
    shareLabel: string | null;
  };

export type PartnerAccessRoomDetail = {
  room: PartnerAccessRoom;
  contact: {
    id: string | null;
    name: string | null;
    organization: string | null;
    logoUrl: string | null;
  };
  createdByName: string | null;
  shares: PartnerAccessShare[];
  members: PartnerAccessRoomMember[];
  events: PartnerAccessRoomEvent[];
  team: RoomTeamMember[];
};

export async function listPartnerAccessForContact(opts: {
  workspaceId: string;
  contactId: string;
  /**
   * When set, also surface rooms/shares belonging to the contact's organization
   * (an org-type contact). Lets every linked teammate see the shared org room.
   */
  orgContactId?: string;
}): Promise<PartnerAccessOverview> {
  const contactIds =
    opts.orgContactId && opts.orgContactId !== opts.contactId
      ? [opts.contactId, opts.orgContactId]
      : [opts.contactId];

  const rooms = await db
    .select()
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, opts.workspaceId),
        inArray(schema.partnerRooms.primaryContactId, contactIds),
      ),
    )
    .orderBy(desc(schema.partnerRooms.updatedAt));

  const roomIds = rooms.map((room) => room.id);

  const [shares, members] = await Promise.all([
    db
      .select({
        share: schema.partnerShares,
        contactName: schema.contacts.name,
        projectTitle: schema.linesOfBusiness.title,
        liveLabel: schema.projectLinks.label,
        roomName: schema.partnerRooms.name,
        sharedByName: schema.users.displayName,
        meetingTitle: schema.meetings.title,
        lobLogoUrl: schema.linesOfBusiness.logoUrl,
        lobLogoUrlDark: schema.linesOfBusiness.logoUrlDark,
      })
      .from(schema.partnerShares)
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.partnerShares.contactId))
      .leftJoin(schema.linesOfBusiness, eq(schema.linesOfBusiness.id, schema.partnerShares.lobId))
      .leftJoin(
        schema.projectLinks,
        eq(schema.projectLinks.id, schema.partnerShares.projectLinkId),
      )
      .leftJoin(schema.partnerRooms, eq(schema.partnerRooms.id, schema.partnerShares.roomId))
      .leftJoin(schema.users, eq(schema.users.id, schema.partnerShares.sharedBy))
      .leftJoin(schema.meetings, eq(schema.meetings.id, schema.partnerShares.meetingId))
      .where(
        and(
          eq(schema.partnerShares.workspaceId, opts.workspaceId),
          inArray(schema.partnerShares.contactId, contactIds),
        ),
      )
      .orderBy(desc(schema.partnerShares.sharedAt)),
    roomIds.length
      ? db
          .select({
            roomId: schema.partnerRoomMembers.roomId,
            id: schema.partnerRoomMembers.id,
          })
          .from(schema.partnerRoomMembers)
          .where(inArray(schema.partnerRoomMembers.roomId, roomIds))
      : Promise.resolve([]),
  ]);

  const shareCountByRoom = new Map<string, number>();
  const memberCountByRoom = new Map<string, number>();
  for (const row of shares) {
    if (!row.share.roomId) continue;
    shareCountByRoom.set(row.share.roomId, (shareCountByRoom.get(row.share.roomId) ?? 0) + 1);
  }
  for (const member of members) {
    memberCountByRoom.set(member.roomId, (memberCountByRoom.get(member.roomId) ?? 0) + 1);
  }

  return {
    rooms: rooms.map((room) => ({
      ...room,
      shareCount: shareCountByRoom.get(room.id) ?? 0,
      memberCount: memberCountByRoom.get(room.id) ?? 0,
      viaOrg: room.primaryContactId !== opts.contactId,
    })),
    shares: shares.map((row) => ({
      ...row.share,
      contactName: row.contactName,
      projectTitle: row.projectTitle,
      liveLabel: row.liveLabel,
      roomName: row.roomName,
      sharedByName: row.sharedByName,
      meetingTitle: row.meetingTitle,
      lobLogoUrl: row.lobLogoUrl,
      lobLogoUrlDark: row.lobLogoUrlDark,
    })),
  };
}

/** Per-room signature request tallies for the board's status chips. */
async function countSignaturesByRoom(
  roomIds: string[],
): Promise<Map<string, { pending: number; signed: number }>> {
  const counts = new Map<string, { pending: number; signed: number }>();
  if (!roomIds.length) return counts;
  const rows = await db
    .select({
      roomId: schema.partnerSignatureRequests.roomId,
      status: schema.partnerSignatureRequests.status,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.partnerSignatureRequests)
    .where(inArray(schema.partnerSignatureRequests.roomId, roomIds))
    .groupBy(
      schema.partnerSignatureRequests.roomId,
      schema.partnerSignatureRequests.status,
    );
  for (const row of rows) {
    const entry = counts.get(row.roomId) ?? { pending: 0, signed: 0 };
    if (row.status === "pending") entry.pending += row.count;
    if (row.status === "signed") entry.signed += row.count;
    counts.set(row.roomId, entry);
  }
  return counts;
}

export async function listPartnerAccessDashboard(opts: {
  workspaceId: string;
}): Promise<PartnerAccessOverview> {
  const rooms = await db
    .select()
    .from(schema.partnerRooms)
    .where(eq(schema.partnerRooms.workspaceId, opts.workspaceId))
    .orderBy(desc(schema.partnerRooms.updatedAt));

  const roomIds = rooms.map((room) => room.id);

  const [shares, members] = await Promise.all([
    db
      .select({
        share: schema.partnerShares,
        contactName: schema.contacts.name,
        projectTitle: schema.linesOfBusiness.title,
        liveLabel: schema.projectLinks.label,
        roomName: schema.partnerRooms.name,
        sharedByName: schema.users.displayName,
        meetingTitle: schema.meetings.title,
        lobLogoUrl: schema.linesOfBusiness.logoUrl,
        lobLogoUrlDark: schema.linesOfBusiness.logoUrlDark,
      })
      .from(schema.partnerShares)
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.partnerShares.contactId))
      .leftJoin(schema.linesOfBusiness, eq(schema.linesOfBusiness.id, schema.partnerShares.lobId))
      .leftJoin(
        schema.projectLinks,
        eq(schema.projectLinks.id, schema.partnerShares.projectLinkId),
      )
      .leftJoin(schema.partnerRooms, eq(schema.partnerRooms.id, schema.partnerShares.roomId))
      .leftJoin(schema.users, eq(schema.users.id, schema.partnerShares.sharedBy))
      .leftJoin(schema.meetings, eq(schema.meetings.id, schema.partnerShares.meetingId))
      .where(eq(schema.partnerShares.workspaceId, opts.workspaceId))
      .orderBy(desc(schema.partnerShares.sharedAt)),
    roomIds.length
      ? db
          .select({
            roomId: schema.partnerRoomMembers.roomId,
            id: schema.partnerRoomMembers.id,
          })
          .from(schema.partnerRoomMembers)
          .where(inArray(schema.partnerRoomMembers.roomId, roomIds))
      : Promise.resolve([]),
  ]);
  const signatureCounts = await countSignaturesByRoom(roomIds).catch(
    () => new Map<string, { pending: number; signed: number }>(),
  );

  const shareCountByRoom = new Map<string, number>();
  const memberCountByRoom = new Map<string, number>();
  for (const row of shares) {
    if (!row.share.roomId) continue;
    shareCountByRoom.set(row.share.roomId, (shareCountByRoom.get(row.share.roomId) ?? 0) + 1);
  }
  for (const member of members) {
    memberCountByRoom.set(member.roomId, (memberCountByRoom.get(member.roomId) ?? 0) + 1);
  }

  return {
    rooms: rooms.map((room) => ({
      ...room,
      shareCount: shareCountByRoom.get(room.id) ?? 0,
      memberCount: memberCountByRoom.get(room.id) ?? 0,
      pendingSignatures: signatureCounts.get(room.id)?.pending ?? 0,
      signedSignatures: signatureCounts.get(room.id)?.signed ?? 0,
    })),
    shares: shares.map((row) => ({
      ...row.share,
      contactName: row.contactName,
      projectTitle: row.projectTitle,
      liveLabel: row.liveLabel,
      roomName: row.roomName,
      sharedByName: row.sharedByName,
      meetingTitle: row.meetingTitle,
      lobLogoUrl: row.lobLogoUrl,
      lobLogoUrlDark: row.lobLogoUrlDark,
    })),
  };
}

export async function getPartnerAccessRoom(opts: {
  workspaceId: string;
  roomId: string;
}): Promise<PartnerAccessRoomDetail | null> {
  const [roomRow] = await db
    .select({
      room: schema.partnerRooms,
      contactId: schema.contacts.id,
      contactName: schema.contacts.name,
      contactOrganization: schema.contacts.organization,
      contactLogoUrl: schema.contacts.logoUrl,
      createdByName: schema.users.displayName,
    })
    .from(schema.partnerRooms)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.partnerRooms.primaryContactId))
    .leftJoin(schema.users, eq(schema.users.id, schema.partnerRooms.createdBy))
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, opts.workspaceId),
        eq(schema.partnerRooms.id, opts.roomId),
      ),
    )
    .limit(1);

  if (!roomRow) return null;

  const [shares, members, events, team] = await Promise.all([
    db
      .select({
        share: schema.partnerShares,
        contactName: schema.contacts.name,
        projectTitle: schema.linesOfBusiness.title,
        liveLabel: schema.projectLinks.label,
        roomName: schema.partnerRooms.name,
        sharedByName: schema.users.displayName,
        meetingTitle: schema.meetings.title,
        lobLogoUrl: schema.linesOfBusiness.logoUrl,
        lobLogoUrlDark: schema.linesOfBusiness.logoUrlDark,
      })
      .from(schema.partnerShares)
      .leftJoin(schema.contacts, eq(schema.contacts.id, schema.partnerShares.contactId))
      .leftJoin(schema.linesOfBusiness, eq(schema.linesOfBusiness.id, schema.partnerShares.lobId))
      .leftJoin(
        schema.projectLinks,
        eq(schema.projectLinks.id, schema.partnerShares.projectLinkId),
      )
      .leftJoin(schema.partnerRooms, eq(schema.partnerRooms.id, schema.partnerShares.roomId))
      .leftJoin(schema.users, eq(schema.users.id, schema.partnerShares.sharedBy))
      .leftJoin(schema.meetings, eq(schema.meetings.id, schema.partnerShares.meetingId))
      .where(
        and(
          eq(schema.partnerShares.workspaceId, opts.workspaceId),
          eq(schema.partnerShares.roomId, opts.roomId),
        ),
      )
      .orderBy(desc(schema.partnerShares.sharedAt)),
    db
      .select()
      .from(schema.partnerRoomMembers)
      .where(
        and(
          eq(schema.partnerRoomMembers.workspaceId, opts.workspaceId),
          eq(schema.partnerRoomMembers.roomId, opts.roomId),
        ),
      ),
    db
      .select({
        event: schema.partnerAccessEvents,
        actorName: schema.users.displayName,
        shareLabel: schema.partnerShares.labelSnapshot,
      })
      .from(schema.partnerAccessEvents)
      .leftJoin(schema.users, eq(schema.users.id, schema.partnerAccessEvents.actorUserId))
      .leftJoin(schema.partnerShares, eq(schema.partnerShares.id, schema.partnerAccessEvents.shareId))
      .where(
        and(
          eq(schema.partnerAccessEvents.workspaceId, opts.workspaceId),
          eq(schema.partnerAccessEvents.roomId, opts.roomId),
        ),
      )
      .orderBy(desc(schema.partnerAccessEvents.createdAt))
      .limit(50),
    listRoomTeam({ roomId: opts.roomId }),
  ]);

  return {
    room: {
      ...roomRow.room,
      shareCount: shares.length,
      memberCount: members.length,
    },
    contact: {
      id: roomRow.contactId,
      name: roomRow.contactName,
      organization: roomRow.contactOrganization,
      logoUrl: roomRow.contactLogoUrl,
    },
    createdByName: roomRow.createdByName,
    shares: shares.map((row) => ({
      ...row.share,
      contactName: row.contactName,
      projectTitle: row.projectTitle,
      liveLabel: row.liveLabel,
      roomName: row.roomName,
      sharedByName: row.sharedByName,
      meetingTitle: row.meetingTitle,
      lobLogoUrl: row.lobLogoUrl,
      lobLogoUrlDark: row.lobLogoUrlDark,
    })),
    members,
    events: events.map((row) => ({
      ...row.event,
      actorName: row.actorName,
      shareLabel: row.shareLabel,
    })),
    team,
  };
}

export async function updatePartnerRoomDetails(input: {
  workspaceId: string;
  actorId: string;
  roomId: string;
  name: string;
  partnerKind: PartnerKind;
  locale?: RoomLocale;
  summary?: string | null;
  welcomeMessage?: string | null;
  expiresAt?: Date | null;
}) {
  const name = input.name.trim();
  if (!name) return { ok: false as const, error: "Room name is required" };

  const now = new Date();
  const room = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.partnerRooms)
      .set({
        name,
        partnerKind: input.partnerKind,
        ...(input.locale ? { locale: input.locale } : {}),
        summary: input.summary?.trim() || null,
        welcomeMessage: input.welcomeMessage?.trim() || null,
        expiresAt: input.expiresAt ?? null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.partnerRooms.workspaceId, input.workspaceId),
          eq(schema.partnerRooms.id, input.roomId),
        ),
      )
      .returning();

    if (!updated) return null;

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: updated.id,
      contactId: updated.primaryContactId,
      actorUserId: input.actorId,
      eventType: "room_updated",
      metadata: {
        partnerKind: input.partnerKind,
        expiresAt: input.expiresAt?.toISOString() ?? null,
      },
    });

    return updated;
  });

  if (!room) return { ok: false as const, error: "Room not found" };
  return { ok: true as const, room };
}

export async function updatePartnerRoomStatus(input: {
  workspaceId: string;
  actorId: string;
  roomId: string;
  status: PartnerRoomStatus;
}) {
  const [existing] = await db
    .select()
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .limit(1);

  if (!existing) return { ok: false as const, error: "Room not found" };
  if (existing.status === input.status) {
    return { ok: true as const, room: existing };
  }

  const now = new Date();
  const room = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.partnerRooms)
      .set({
        status: input.status,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(schema.partnerRooms.id, existing.id))
      .returning();

    if (input.status === "revoked") {
      await tx
        .update(schema.partnerShares)
        .set({ revokedAt: now })
        .where(
          and(
            eq(schema.partnerShares.workspaceId, input.workspaceId),
            eq(schema.partnerShares.roomId, existing.id),
            isNull(schema.partnerShares.revokedAt),
          ),
        );
    }

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: existing.id,
      contactId: existing.primaryContactId,
      actorUserId: input.actorId,
      eventType: input.status === "revoked" ? "revoked" : "room_status_changed",
      metadata: {
        from: existing.status,
        to: input.status,
      },
    });

    return updated;
  });

  return { ok: true as const, room };
}

export async function regeneratePartnerRoomAccessToken(input: {
  workspaceId: string;
  actorId: string;
  roomId: string;
}) {
  const [existing] = await db
    .select()
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .limit(1);

  if (!existing) return { ok: false as const, error: "Room not found" };
  if (existing.status === "revoked") {
    return {
      ok: false as const,
      error: "Revoked rooms cannot issue new access links",
    };
  }

  const accessToken = createPartnerAccessToken();
  const now = new Date();
  const room = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.partnerRooms)
      .set({
        status: existing.status === "draft" ? "active" : existing.status,
        publicAccessTokenHash: hashPartnerAccessToken(accessToken),
        publicAccessTokenEnc: encryptRoomToken(accessToken),
        publicAccessTokenCreatedAt: now,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(schema.partnerRooms.id, existing.id))
      .returning();

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: existing.id,
      contactId: existing.primaryContactId,
      actorUserId: input.actorId,
      eventType: "access_link_generated",
      metadata: {
        previousTokenCreatedAt:
          existing.publicAccessTokenCreatedAt?.toISOString() ?? null,
      },
    });

    return updated;
  });

  return { ok: true as const, room, accessToken };
}

export type CreatePartnerShareInput = {
  workspaceId: string;
  actorId: string;
  projectId: string;
  projectLinkId: string;
  contactId: string;
  partnerKind: PartnerKind;
  channel: PartnerShareChannel;
  permissions: PartnerPermission[];
  message?: string | null;
  expiresAt?: Date | null;
  /** Pin the share to a specific room instead of resolving by contact+kind. */
  roomId?: string | null;
  /** Meeting this material was shared from, for provenance. */
  meetingId?: string | null;
  /** When the doc is already shared, leave its tuned permissions untouched. */
  preserveExistingShare?: boolean;
};

export type BrandLogo = {
  lobId: string;
  title: string;
  logoUrl: string;
  logoUrlDark: string | null;
};

export type PublicPartnerRoom = {
  room: typeof schema.partnerRooms.$inferSelect;
  contact: {
    id: string | null;
    name: string | null;
    organization: string | null;
    logoUrl: string | null;
  };
  /** Distinct LoB logos for the projects shared into this room (co-branding). */
  brandLogos: BrandLogo[];
  /** Team members assigned to show up for this client. */
  team: RoomTeamMember[];
  shares: Array<PartnerAccessShare & {
    storagePath: string | null;
    mimeType: string | null;
    originalFilename: string | null;
    sizeBytes: number | null;
    description: string | null;
    signedUrl: string | null;
  }>;
};

export type RoomTeamMember = {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  title: string | null;
};

/** LoBs that have a logo set — candidates for the room brand picker. */
export async function listLogoBrands(input: { workspaceId: string }): Promise<BrandLogo[]> {
  const rows = await db
    .select({
      lobId: schema.linesOfBusiness.id,
      title: schema.linesOfBusiness.title,
      logoUrl: schema.linesOfBusiness.logoUrl,
      logoUrlDark: schema.linesOfBusiness.logoUrlDark,
    })
    .from(schema.linesOfBusiness)
    .where(eq(schema.linesOfBusiness.workspaceId, input.workspaceId))
    .orderBy(asc(schema.linesOfBusiness.title));
  return rows
    .filter((r): r is typeof r & { logoUrl: string } => Boolean(r.logoUrl))
    .map((r) => ({
      lobId: r.lobId,
      title: r.title,
      logoUrl: r.logoUrl,
      logoUrlDark: r.logoUrlDark,
    }));
}

/** Brand logos for a room: explicit selection if set, else auto from shares. */
export async function resolveRoomBrandLogos(input: {
  workspaceId: string;
  brandLobIds: string[] | null;
  shares: Array<{
    lobId: string | null;
    lobLogoUrl?: string | null;
    lobLogoUrlDark?: string | null;
    projectTitle?: string | null;
  }>;
}): Promise<BrandLogo[]> {
  if (input.brandLobIds && input.brandLobIds.length > 0) {
    const rows = await db
      .select({
        lobId: schema.linesOfBusiness.id,
        title: schema.linesOfBusiness.title,
        logoUrl: schema.linesOfBusiness.logoUrl,
        logoUrlDark: schema.linesOfBusiness.logoUrlDark,
      })
      .from(schema.linesOfBusiness)
      .where(
        and(
          eq(schema.linesOfBusiness.workspaceId, input.workspaceId),
          inArray(schema.linesOfBusiness.id, input.brandLobIds),
        ),
      );
    const byId = new Map(rows.map((r) => [r.lobId, r]));
    // Preserve the owner's chosen order; skip any without a logo.
    return input.brandLobIds
      .map((id) => byId.get(id))
      .filter((r): r is NonNullable<typeof r> & { logoUrl: string } => Boolean(r?.logoUrl))
      .map((r) => ({ lobId: r.lobId, title: r.title, logoUrl: r.logoUrl, logoUrlDark: r.logoUrlDark }));
  }
  return brandLogosFromShares(input.shares);
}

export async function setRoomBrandLobIds(input: {
  workspaceId: string;
  roomId: string;
  brandLobIds: string[] | null;
}) {
  const [updated] = await db
    .update(schema.partnerRooms)
    .set({ brandLobIds: input.brandLobIds, updatedAt: new Date() })
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .returning({ id: schema.partnerRooms.id });
  return updated ?? null;
}

export async function setRoomHeroVideo(input: {
  workspaceId: string;
  roomId: string;
  heroVideoKey: string | null;
}) {
  const [updated] = await db
    .update(schema.partnerRooms)
    .set({ heroVideoKey: input.heroVideoKey, updatedAt: new Date() })
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .returning({ id: schema.partnerRooms.id });
  return updated ?? null;
}

/** Attach (or clear, with null) a featured product demo on a room. The demo
 *  link must belong to the same workspace — enforced by the FK + this scope. */
export async function setRoomDemoLink(input: {
  workspaceId: string;
  roomId: string;
  demoLinkId: string | null;
}) {
  const [updated] = await db
    .update(schema.partnerRooms)
    .set({ demoLinkId: input.demoLinkId, updatedAt: new Date() })
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .returning({ id: schema.partnerRooms.id });
  return updated ?? null;
}

export async function setPartnerShareRoomSection(input: {
  workspaceId: string;
  shareId: string;
  roomSection: string | null;
}) {
  const [updated] = await db
    .update(schema.partnerShares)
    .set({ roomSection: input.roomSection })
    .where(
      and(
        eq(schema.partnerShares.id, input.shareId),
        eq(schema.partnerShares.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: schema.partnerShares.id, roomId: schema.partnerShares.roomId });
  return updated ?? null;
}

export async function listRoomTeam(input: { roomId: string }): Promise<RoomTeamMember[]> {
  const rows = await db
    .select({
      id: schema.partnerRoomTeam.id,
      userId: schema.partnerRoomTeam.userId,
      title: schema.partnerRoomTeam.title,
      sortOrder: schema.partnerRoomTeam.sortOrder,
      displayName: schema.users.displayName,
      email: schema.users.email,
    })
    .from(schema.partnerRoomTeam)
    .leftJoin(schema.users, eq(schema.users.id, schema.partnerRoomTeam.userId))
    .where(eq(schema.partnerRoomTeam.roomId, input.roomId))
    .orderBy(asc(schema.partnerRoomTeam.sortOrder), asc(schema.users.displayName));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    displayName: r.displayName,
    email: r.email,
    title: r.title,
  }));
}

export async function addRoomTeamMember(input: {
  workspaceId: string;
  roomId: string;
  userId: string;
  title?: string | null;
}) {
  // Validate the user is a member of this workspace before assigning.
  const [member] = await db
    .select({ userId: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, input.workspaceId),
        eq(schema.workspaceMembers.userId, input.userId),
      ),
    )
    .limit(1);
  if (!member) return null;

  const [row] = await db
    .insert(schema.partnerRoomTeam)
    .values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      userId: input.userId,
      title: input.title?.trim() || null,
    })
    .onConflictDoUpdate({
      target: [schema.partnerRoomTeam.roomId, schema.partnerRoomTeam.userId],
      set: { title: input.title?.trim() || null },
    })
    .returning();
  return row;
}

export async function removeRoomTeamMember(input: {
  workspaceId: string;
  teamId: string;
}) {
  const [deleted] = await db
    .delete(schema.partnerRoomTeam)
    .where(
      and(
        eq(schema.partnerRoomTeam.id, input.teamId),
        eq(schema.partnerRoomTeam.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: schema.partnerRoomTeam.id });
  return deleted ?? null;
}

/** Distinct LoB logos among a set of shares, in share order. */
export function brandLogosFromShares(
  shares: Array<{
    lobId: string | null;
    lobLogoUrl?: string | null;
    lobLogoUrlDark?: string | null;
    projectTitle?: string | null;
  }>,
): BrandLogo[] {
  const seen = new Set<string>();
  const logos: BrandLogo[] = [];
  for (const share of shares) {
    if (!share.lobId || !share.lobLogoUrl) continue;
    if (seen.has(share.lobId)) continue;
    seen.add(share.lobId);
    logos.push({
      lobId: share.lobId,
      title: share.projectTitle ?? "Project",
      logoUrl: share.lobLogoUrl,
      logoUrlDark: share.lobLogoUrlDark ?? null,
    });
  }
  return logos;
}

export async function createPartnerShare(input: CreatePartnerShareInput) {
  const [contact] = await db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      organization: schema.contacts.organization,
      channels: schema.contactChannels.value,
    })
    .from(schema.contacts)
    .leftJoin(schema.contactChannels, eq(schema.contactChannels.contactId, schema.contacts.id))
    .where(
      and(
        eq(schema.contacts.id, input.contactId),
        eq(schema.contacts.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!contact) {
    return { ok: false as const, error: "Contact not found" };
  }

  const [linkRow] = await db
    .select({
      link: schema.projectLinks,
      projectTitle: schema.linesOfBusiness.title,
    })
    .from(schema.projectLinks)
    .innerJoin(schema.linesOfBusiness, eq(schema.linesOfBusiness.id, schema.projectLinks.lobId))
    .where(
      and(
        eq(schema.projectLinks.id, input.projectLinkId),
        eq(schema.projectLinks.lobId, input.projectId),
        eq(schema.projectLinks.workspaceId, input.workspaceId),
        eq(schema.linesOfBusiness.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!linkRow) {
    return { ok: false as const, error: "Document not found" };
  }

  const result = await db.transaction(async (tx) => {
    const now = new Date();
    const [existingRoom] = await tx
      .select()
      .from(schema.partnerRooms)
      .where(
        input.roomId
          ? and(
              eq(schema.partnerRooms.workspaceId, input.workspaceId),
              eq(schema.partnerRooms.id, input.roomId),
              ne(schema.partnerRooms.status, "revoked"),
            )
          : and(
              eq(schema.partnerRooms.workspaceId, input.workspaceId),
              eq(schema.partnerRooms.primaryContactId, input.contactId),
              eq(schema.partnerRooms.partnerKind, input.partnerKind),
              ne(schema.partnerRooms.status, "revoked"),
            ),
      )
      .orderBy(desc(schema.partnerRooms.updatedAt))
      .limit(1);

    if (input.roomId && !existingRoom) {
      throw new Error("ROOM_NOT_FOUND");
    }

    let accessToken: string | null = null;
    let room = existingRoom;

    if (!room) {
      accessToken = createPartnerAccessToken();
      [room] = await tx
        .insert(schema.partnerRooms)
        .values({
          workspaceId: input.workspaceId,
          primaryContactId: input.contactId,
          name: `${contact.name} Partner Room`,
          partnerKind: input.partnerKind,
          status: "active",
          publicAccessTokenHash: hashPartnerAccessToken(accessToken),
          publicAccessTokenEnc: encryptRoomToken(accessToken),
          publicAccessTokenCreatedAt: now,
          createdBy: input.actorId,
          lastActivityAt: now,
        })
        .returning();
    } else if (!room.publicAccessTokenHash) {
      accessToken = createPartnerAccessToken();
      [room] = await tx
        .update(schema.partnerRooms)
        .set({
          publicAccessTokenHash: hashPartnerAccessToken(accessToken),
          publicAccessTokenEnc: encryptRoomToken(accessToken),
          publicAccessTokenCreatedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.partnerRooms.id, room.id))
        .returning();
    }

    if (!existingRoom) {
      await tx.insert(schema.partnerAccessEvents).values({
        workspaceId: input.workspaceId,
        roomId: room.id,
        contactId: input.contactId,
        actorUserId: input.actorId,
        eventType: "room_created",
        metadata: { partnerKind: input.partnerKind },
      });
    }

    const [existingShare] = await tx
      .select()
      .from(schema.partnerShares)
      .where(
        and(
          eq(schema.partnerShares.workspaceId, input.workspaceId),
          eq(schema.partnerShares.roomId, room.id),
          eq(schema.partnerShares.projectLinkId, input.projectLinkId),
          isNull(schema.partnerShares.revokedAt),
        ),
      )
      .limit(1);

    // Bulk "add documents" must never clobber a share whose permissions were
    // tuned by hand — a re-add of an already-present doc is a no-op.
    if (existingShare && input.preserveExistingShare) {
      if (room.status === "draft") {
        await tx
          .update(schema.partnerRooms)
          .set({ status: "active", updatedAt: now, lastActivityAt: now })
          .where(eq(schema.partnerRooms.id, room.id));
      }
      return { room, share: existingShare, accessToken };
    }

    const values = {
      workspaceId: input.workspaceId,
      roomId: room.id,
      contactId: input.contactId,
      lobId: input.projectId,
      projectLinkId: input.projectLinkId,
      meetingId: input.meetingId ?? existingShare?.meetingId ?? null,
      labelSnapshot: linkRow.link.label,
      kindSnapshot: linkRow.link.kind,
      categorySnapshot: linkRow.link.category,
      urlSnapshot: linkRow.link.url,
      permissions: input.permissions,
      channel: input.channel,
      message: input.message?.trim() || null,
      sharedBy: input.actorId,
      sharedAt: now,
      expiresAt: input.expiresAt ?? null,
    };

    const [share] = existingShare
      ? await tx
          .update(schema.partnerShares)
          .set(values)
          .where(eq(schema.partnerShares.id, existingShare.id))
          .returning()
      : await tx.insert(schema.partnerShares).values(values).returning();

    // A draft room goes live on first share; a deliberately paused room stays
    // paused (adding a doc must not silently re-expose it on the public link).
    await tx.update(schema.partnerRooms).set({
      status: room.status === "draft" ? "active" : room.status,
      updatedAt: now,
      lastActivityAt: now,
    }).where(eq(schema.partnerRooms.id, room.id));

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: room.id,
      shareId: share.id,
      contactId: input.contactId,
      actorUserId: input.actorId,
      eventType: existingShare ? "share_sent" : "share_created",
      metadata: {
        projectId: input.projectId,
        projectLinkId: input.projectLinkId,
        label: linkRow.link.label,
        channel: input.channel,
        permissions: input.permissions,
      },
    });

    return { room, share, accessToken };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "ROOM_NOT_FOUND") return null;
    if (pgErrorCode(error) === "23503") return "FK_VIOLATION" as const;
    throw error;
  });

  if (!result) return { ok: false as const, error: "Room not found" };
  if (result === "FK_VIOLATION") {
    return {
      ok: false as const,
      error:
        "Could not attach this document — its business record is missing or out of sync. Refresh and try again.",
    };
  }
  return { ok: true as const, ...result };
}

/**
 * Explicitly create a room for a contact (no document required). Returns the
 * existing non-revoked room for contact+kind when one already exists.
 */
export async function createPartnerRoomForContact(input: {
  workspaceId: string;
  actorId: string;
  contactId: string;
  partnerKind: PartnerKind;
  locale?: RoomLocale;
  name?: string | null;
}) {
  const [contact] = await db
    .select({ id: schema.contacts.id, name: schema.contacts.name })
    .from(schema.contacts)
    .where(
      and(
        eq(schema.contacts.id, input.contactId),
        eq(schema.contacts.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!contact) return { ok: false as const, error: "Contact not found" };

  const [existing] = await db
    .select()
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.primaryContactId, input.contactId),
        eq(schema.partnerRooms.partnerKind, input.partnerKind),
        ne(schema.partnerRooms.status, "revoked"),
      ),
    )
    .orderBy(desc(schema.partnerRooms.updatedAt))
    .limit(1);

  if (existing) {
    return {
      ok: true as const,
      room: existing,
      accessToken: null,
      existed: true,
    };
  }

  const accessToken = createPartnerAccessToken();
  const now = new Date();
  const room = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.partnerRooms)
      .values({
        workspaceId: input.workspaceId,
        primaryContactId: input.contactId,
        name: input.name?.trim() || `${contact.name} Room`,
        partnerKind: input.partnerKind,
        locale: input.locale ?? "es",
        status: "active",
        publicAccessTokenHash: hashPartnerAccessToken(accessToken),
        publicAccessTokenEnc: encryptRoomToken(accessToken),
        publicAccessTokenCreatedAt: now,
        createdBy: input.actorId,
        lastActivityAt: now,
      })
      .returning();

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: created.id,
      contactId: input.contactId,
      actorUserId: input.actorId,
      eventType: "room_created",
      metadata: { partnerKind: input.partnerKind, explicit: true },
    });

    return created;
  });

  return { ok: true as const, room, accessToken, existed: false };
}

/** Set (4 digits) or clear the public-link passcode for a room. */
export async function setPartnerRoomPasscode(input: {
  workspaceId: string;
  actorId: string;
  roomId: string;
  passcode: string | null;
}) {
  const [existing] = await db
    .select()
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .limit(1);

  if (!existing) return { ok: false as const, error: "Room not found" };

  const now = new Date();
  const passcodeHash = input.passcode
    ? hashPartnerRoomPasscode(existing.id, input.passcode)
    : null;

  const room = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(schema.partnerRooms)
      .set({
        passcodeHash,
        passcodeFailedCount: 0,
        passcodeLockedUntil: null,
        updatedAt: now,
      })
      .where(eq(schema.partnerRooms.id, existing.id))
      .returning();

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: existing.id,
      contactId: existing.primaryContactId,
      actorUserId: input.actorId,
      eventType: passcodeHash ? "passcode_set" : "passcode_removed",
      metadata: {},
    });

    return updated;
  });

  return { ok: true as const, room };
}

export type VerifyPartnerPasscodeResult =
  | { ok: true; roomId: string; passcodeHash: string }
  | { ok: false; locked: boolean; retryAt: string | null };

/**
 * Verify a 4-digit passcode for a token-resolved room, with a room-wide
 * lockout after repeated failures to keep online brute-force impractical.
 */
export async function verifyPartnerRoomPasscode(input: {
  token: string;
  passcode: string;
}): Promise<VerifyPartnerPasscodeResult | null> {
  const tokenHash = hashPartnerAccessToken(input.token);
  const [room] = await db
    .select()
    .from(schema.partnerRooms)
    .where(eq(schema.partnerRooms.publicAccessTokenHash, tokenHash))
    .limit(1);

  if (!room || room.status === "revoked" || room.status === "paused") return null;
  if (room.expiresAt && room.expiresAt.getTime() < Date.now()) return null;
  if (!room.passcodeHash) {
    // Nothing to unlock — treat as success so the gate clears itself.
    return { ok: true, roomId: room.id, passcodeHash: "" };
  }

  const now = new Date();
  if (room.passcodeLockedUntil && room.passcodeLockedUntil.getTime() > now.getTime()) {
    return {
      ok: false,
      locked: true,
      retryAt: room.passcodeLockedUntil.toISOString(),
    };
  }

  if (verifyPasscodeAgainstHash(room.id, input.passcode, room.passcodeHash)) {
    await db
      .update(schema.partnerRooms)
      .set({ passcodeFailedCount: 0, passcodeLockedUntil: null })
      .where(eq(schema.partnerRooms.id, room.id));
    return { ok: true, roomId: room.id, passcodeHash: room.passcodeHash };
  }

  // Atomic increment so concurrent wrong guesses can't collapse into one and
  // exceed the attempt ceiling.
  const [bumped] = await db
    .update(schema.partnerRooms)
    .set({ passcodeFailedCount: sql`${schema.partnerRooms.passcodeFailedCount} + 1` })
    .where(eq(schema.partnerRooms.id, room.id))
    .returning({ failedCount: schema.partnerRooms.passcodeFailedCount });

  const failedCount = bumped?.failedCount ?? room.passcodeFailedCount + 1;
  const lock = failedCount >= PARTNER_PASSCODE_MAX_ATTEMPTS;
  if (lock) {
    await db
      .update(schema.partnerRooms)
      .set({
        passcodeFailedCount: 0,
        passcodeLockedUntil: new Date(
          now.getTime() + PARTNER_PASSCODE_LOCK_MINUTES * 60 * 1000,
        ),
      })
      .where(eq(schema.partnerRooms.id, room.id));
  }
  const lockedUntil = lock
    ? new Date(now.getTime() + PARTNER_PASSCODE_LOCK_MINUTES * 60 * 1000)
    : null;

  return {
    ok: false,
    locked: lock,
    retryAt: lockedUntil?.toISOString() ?? null,
  };
}

/** Members who have claimed a seat (entered an email). */
export async function countClaimedSeats(input: { roomId: string }) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.roomId, input.roomId),
        isNotNull(schema.partnerRoomMembers.email),
      ),
    );
  return row?.count ?? 0;
}

/** Signed-in (claimed) members — the live roster shown in the public room. */
export async function listClaimedRoomMembers(input: { roomId: string }) {
  return db
    .select({
      id: schema.partnerRoomMembers.id,
      displayName: schema.partnerRoomMembers.displayName,
      roleLabel: schema.partnerRoomMembers.roleLabel,
      lastViewedAt: schema.partnerRoomMembers.lastViewedAt,
    })
    .from(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.roomId, input.roomId),
        isNotNull(schema.partnerRoomMembers.email),
      ),
    )
    .orderBy(asc(schema.partnerRoomMembers.displayName));
}

/** Pre-added, not-yet-claimed guest names for the sign-in dropdown. */
export async function listClaimableRoomMembers(input: { roomId: string }) {
  return db
    .select({
      id: schema.partnerRoomMembers.id,
      displayName: schema.partnerRoomMembers.displayName,
      roleLabel: schema.partnerRoomMembers.roleLabel,
    })
    .from(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.roomId, input.roomId),
        isNull(schema.partnerRoomMembers.email),
      ),
    )
    .orderBy(asc(schema.partnerRoomMembers.displayName));
}

export type ClaimSeatResult =
  | { ok: true; member: typeof schema.partnerRoomMembers.$inferSelect; reentry: boolean }
  | { ok: false; error: "seat_full" | "name_required" };

/**
 * Claim a seat in a room: a returning email re-enters freely; a new email
 * claims a pre-added name (memberId) or creates a fresh member — both subject
 * to the room's seat_limit. Atomic seat check inside the transaction.
 */
export async function claimPartnerRoomSeat(input: {
  workspaceId: string;
  roomId: string;
  contactId: string | null;
  email: string;
  name?: string | null;
  memberId?: string | null;
  seatLimit: number | null;
}): Promise<ClaimSeatResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const now = new Date();

  return db.transaction(async (tx) => {
    // Returning visitor (same email already on the room): always allowed.
    const [byEmail] = await tx
      .select()
      .from(schema.partnerRoomMembers)
      .where(
        and(
          eq(schema.partnerRoomMembers.roomId, input.roomId),
          eq(schema.partnerRoomMembers.email, email),
        ),
      )
      .limit(1);
    if (byEmail) {
      const [updated] = await tx
        .update(schema.partnerRoomMembers)
        .set({ lastViewedAt: now, displayName: byEmail.displayName ?? name })
        .where(eq(schema.partnerRoomMembers.id, byEmail.id))
        .returning();
      return { ok: true as const, member: updated, reentry: true };
    }

    // New claim — enforce the seat cap on claimed (email-bearing) members.
    if (input.seatLimit !== null) {
      const [{ claimed }] = await tx
        .select({ claimed: sql<number>`count(*)::int` })
        .from(schema.partnerRoomMembers)
        .where(
          and(
            eq(schema.partnerRoomMembers.roomId, input.roomId),
            isNotNull(schema.partnerRoomMembers.email),
          ),
        );
      if (claimed >= input.seatLimit) {
        return { ok: false as const, error: "seat_full" as const };
      }
    }

    let member: typeof schema.partnerRoomMembers.$inferSelect;
    if (input.memberId) {
      // Claim a pre-added name (must be unclaimed + in this room).
      const [pre] = await tx
        .select()
        .from(schema.partnerRoomMembers)
        .where(
          and(
            eq(schema.partnerRoomMembers.id, input.memberId),
            eq(schema.partnerRoomMembers.roomId, input.roomId),
            isNull(schema.partnerRoomMembers.email),
          ),
        )
        .limit(1);
      if (!pre) {
        // Name taken / invalid — fall through to a fresh insert below.
      } else {
        [member] = await tx
          .update(schema.partnerRoomMembers)
          .set({
            email,
            displayName: name ?? pre.displayName,
            claimedAt: now,
            lastViewedAt: now,
          })
          .where(eq(schema.partnerRoomMembers.id, pre.id))
          .returning();
        await logClaim(tx, input, email, member.displayName);
        return { ok: true as const, member, reentry: false };
      }
    }

    if (!name) return { ok: false as const, error: "name_required" as const };

    [member] = await tx
      .insert(schema.partnerRoomMembers)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
        contactId: input.contactId,
        email,
        displayName: name,
        claimedAt: now,
        lastViewedAt: now,
      })
      .returning();
    await logClaim(tx, input, email, member.displayName);
    return { ok: true as const, member, reentry: false };
  });
}

async function logClaim(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { workspaceId: string; roomId: string; contactId: string | null },
  email: string,
  displayName: string | null,
) {
  const now = new Date();
  await tx.insert(schema.partnerAccessEvents).values({
    workspaceId: input.workspaceId,
    roomId: input.roomId,
    contactId: input.contactId,
    eventType: "member_identified",
    metadata: { email, displayName },
  });
  await tx
    .update(schema.partnerRooms)
    .set({ lastActivityAt: now, updatedAt: now })
    .where(eq(schema.partnerRooms.id, input.roomId));
}

/** Owner: set/clear the seat cap on a room. */
export async function setPartnerRoomSeatLimit(input: {
  workspaceId: string;
  roomId: string;
  seatLimit: number | null;
}) {
  const [updated] = await db
    .update(schema.partnerRooms)
    .set({ seatLimit: input.seatLimit, updatedAt: new Date() })
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .returning({ id: schema.partnerRooms.id });
  return updated ?? null;
}

/** Owner: pre-add an expected guest by name (no email until they claim). */
export async function addExpectedGuest(input: {
  workspaceId: string;
  roomId: string;
  name: string;
  roleLabel?: string | null;
}) {
  const name = input.name.trim();
  if (!name) return null;
  const [row] = await db
    .insert(schema.partnerRoomMembers)
    .values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      displayName: name,
      roleLabel: input.roleLabel?.trim() || null,
      invitedAt: new Date(),
    })
    .returning();
  return row;
}

/** Owner: remove a member/guest from a room (workspace-fenced). */
export async function removeRoomMember(input: {
  workspaceId: string;
  memberId: string;
}) {
  const [deleted] = await db
    .delete(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.id, input.memberId),
        eq(schema.partnerRoomMembers.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: schema.partnerRoomMembers.id });
  return deleted ?? null;
}

export async function countPartnerRoomMembers(input: { roomId: string }) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerRoomMembers)
    .where(eq(schema.partnerRoomMembers.roomId, input.roomId));
  return row?.count ?? 0;
}

/** Flood guard for the public identify route: seats claimed in this room recently. */
export async function countRecentSeatClaims(input: {
  roomId: string;
  seconds: number;
}) {
  const since = new Date(Date.now() - input.seconds * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.roomId, input.roomId),
        gt(schema.partnerRoomMembers.createdAt, since),
      ),
    );
  return row?.count ?? 0;
}

export async function getPartnerMemberByEmail(input: {
  roomId: string;
  email: string;
}) {
  const email = input.email.trim().toLowerCase();
  const [member] = await db
    .select()
    .from(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.roomId, input.roomId),
        eq(schema.partnerRoomMembers.email, email),
      ),
    )
    .limit(1);
  return member ?? null;
}

/** Look up a member by id, fenced to a room (cookie values are untrusted). */
export async function getPartnerRoomMember(input: {
  roomId: string;
  memberId: string;
}) {
  const [member] = await db
    .select()
    .from(schema.partnerRoomMembers)
    .where(
      and(
        eq(schema.partnerRoomMembers.id, input.memberId),
        eq(schema.partnerRoomMembers.roomId, input.roomId),
      ),
    )
    .limit(1);
  return member ?? null;
}

/** Update the permission set on an existing share. */
export async function updatePartnerSharePermissions(input: {
  workspaceId: string;
  actorId: string;
  shareId: string;
  permissions: PartnerPermission[];
}) {
  const [share] = await db
    .select()
    .from(schema.partnerShares)
    .where(
      and(
        eq(schema.partnerShares.id, input.shareId),
        eq(schema.partnerShares.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!share) return { ok: false as const, error: "Share not found" };
  if (share.revokedAt) {
    return { ok: false as const, error: "Share has been removed" };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.partnerShares)
      .set({ permissions: input.permissions })
      .where(eq(schema.partnerShares.id, share.id));

    if (share.roomId) {
      await tx
        .update(schema.partnerRooms)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(eq(schema.partnerRooms.id, share.roomId));
    }

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: share.roomId,
      shareId: share.id,
      contactId: share.contactId,
      actorUserId: input.actorId,
      eventType: "share_updated",
      metadata: {
        label: share.labelSnapshot,
        from: share.permissions,
        to: input.permissions,
      },
    });
  });

  return {
    ok: true as const,
    id: share.id,
    roomId: share.roomId,
    contactId: share.contactId,
  };
}

export type ShareableRoomDoc = {
  id: string;
  label: string;
  kind: string;
  category: string | null;
  lobId: string;
  lobTitle: string;
  sizeBytes: number | null;
  mimeType: string | null;
  originalFilename: string | null;
  alreadyShared: boolean;
};

/** Workspace docs/files/links that can be placed into a room, with shared flags. */
export async function listShareableDocsForRoom(input: {
  workspaceId: string;
  roomId: string;
}): Promise<ShareableRoomDoc[]> {
  const [links, activeShares] = await Promise.all([
    db
      .select({
        id: schema.projectLinks.id,
        label: schema.projectLinks.label,
        kind: schema.projectLinks.kind,
        category: schema.projectLinks.category,
        lobId: schema.projectLinks.lobId,
        lobTitle: schema.linesOfBusiness.title,
        sizeBytes: schema.projectLinks.sizeBytes,
        mimeType: schema.projectLinks.mimeType,
        originalFilename: schema.projectLinks.originalFilename,
      })
      .from(schema.projectLinks)
      .innerJoin(
        schema.linesOfBusiness,
        eq(schema.linesOfBusiness.id, schema.projectLinks.lobId),
      )
      .where(
        and(
          eq(schema.projectLinks.workspaceId, input.workspaceId),
          ne(schema.projectLinks.kind, "note"),
        ),
      )
      .orderBy(asc(schema.linesOfBusiness.title), asc(schema.projectLinks.label)),
    db
      .select({ projectLinkId: schema.partnerShares.projectLinkId })
      .from(schema.partnerShares)
      .where(
        and(
          eq(schema.partnerShares.workspaceId, input.workspaceId),
          eq(schema.partnerShares.roomId, input.roomId),
          isNull(schema.partnerShares.revokedAt),
        ),
      ),
  ]);

  const shared = new Set(
    activeShares.map((s) => s.projectLinkId).filter(Boolean) as string[],
  );

  return links.map((link) => ({
    ...link,
    alreadyShared: shared.has(link.id),
  }));
}

/**
 * Workspace docs/files/links shareable to a contact, with an `alreadyShared`
 * flag set against any active (non-revoked) share already sent to that contact.
 * Powers the one-tap "Share materials" picker on the contact page — no room
 * needs to exist yet.
 */
export async function listShareableDocsForContact(input: {
  workspaceId: string;
  contactId: string;
}): Promise<ShareableRoomDoc[]> {
  const [links, activeShares] = await Promise.all([
    db
      .select({
        id: schema.projectLinks.id,
        label: schema.projectLinks.label,
        kind: schema.projectLinks.kind,
        category: schema.projectLinks.category,
        lobId: schema.projectLinks.lobId,
        lobTitle: schema.linesOfBusiness.title,
        sizeBytes: schema.projectLinks.sizeBytes,
        mimeType: schema.projectLinks.mimeType,
        originalFilename: schema.projectLinks.originalFilename,
      })
      .from(schema.projectLinks)
      .innerJoin(
        schema.linesOfBusiness,
        eq(schema.linesOfBusiness.id, schema.projectLinks.lobId),
      )
      .where(
        and(
          eq(schema.projectLinks.workspaceId, input.workspaceId),
          ne(schema.projectLinks.kind, "note"),
        ),
      )
      .orderBy(asc(schema.linesOfBusiness.title), asc(schema.projectLinks.label)),
    db
      .select({ projectLinkId: schema.partnerShares.projectLinkId })
      .from(schema.partnerShares)
      .where(
        and(
          eq(schema.partnerShares.workspaceId, input.workspaceId),
          eq(schema.partnerShares.contactId, input.contactId),
          isNull(schema.partnerShares.revokedAt),
        ),
      ),
  ]);

  const shared = new Set(
    activeShares.map((s) => s.projectLinkId).filter(Boolean) as string[],
  );

  return links.map((link) => ({
    ...link,
    alreadyShared: shared.has(link.id),
  }));
}

/**
 * Set/clear a contact's brand logo. Returns the previously-uploaded object path
 * (if any) so the caller can clean up storage. `logoStoragePath` is set only for
 * uploads; a pasted URL stores logoUrl and clears the path.
 */
export async function updateContactLogo(input: {
  workspaceId: string;
  contactId: string;
  logoUrl: string | null;
  logoStoragePath: string | null;
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ logoStoragePath: schema.contacts.logoStoragePath })
      .from(schema.contacts)
      .where(
        and(
          eq(schema.contacts.id, input.contactId),
          eq(schema.contacts.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    if (!existing) return null;

    await tx
      .update(schema.contacts)
      .set({
        logoUrl: input.logoUrl,
        logoStoragePath: input.logoStoragePath,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.contacts.id, input.contactId),
          eq(schema.contacts.workspaceId, input.workspaceId),
        ),
      );

    const previousPath =
      existing.logoStoragePath && existing.logoStoragePath !== input.logoStoragePath
        ? existing.logoStoragePath
        : null;
    return { previousPath };
  });
}

/** Public read: a contact's uploaded-logo storage path, by id (no workspace fence). */
export async function getContactLogoStoragePath(contactId: string) {
  const [row] = await db
    .select({ logoStoragePath: schema.contacts.logoStoragePath })
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);
  return row?.logoStoragePath ?? null;
}

/** Light room fetch for action-layer checks (workspace-fenced). */
export async function getPartnerRoomBasic(input: {
  workspaceId: string;
  roomId: string;
}) {
  const [room] = await db
    .select()
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, input.workspaceId),
        eq(schema.partnerRooms.id, input.roomId),
      ),
    )
    .limit(1);
  return room ?? null;
}

/** Resolve a live (active, unexpired) room from a public token. */
export async function resolvePartnerRoomByToken(token: string) {
  const tokenHash = hashPartnerAccessToken(token);
  const [room] = await db
    .select()
    .from(schema.partnerRooms)
    .where(eq(schema.partnerRooms.publicAccessTokenHash, tokenHash))
    .limit(1);
  if (!room || room.status === "revoked" || room.status === "paused") return null;
  if (room.expiresAt && room.expiresAt.getTime() < Date.now()) return null;
  return room;
}

export async function getPublicPartnerRoomByToken(input: {
  token: string;
}): Promise<PublicPartnerRoom | null> {
  const tokenHash = hashPartnerAccessToken(input.token);
  const [row] = await db
    .select({
      room: schema.partnerRooms,
      contactId: schema.contacts.id,
      contactName: schema.contacts.name,
      contactOrganization: schema.contacts.organization,
      contactLogoUrl: schema.contacts.logoUrl,
    })
    .from(schema.partnerRooms)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.partnerRooms.primaryContactId))
    .where(eq(schema.partnerRooms.publicAccessTokenHash, tokenHash))
    .limit(1);

  if (!row || row.room.status === "revoked" || row.room.status === "paused") {
    return null;
  }
  if (row.room.expiresAt && row.room.expiresAt.getTime() < Date.now()) {
    return null;
  }

  const shares = await db
    .select({
      share: schema.partnerShares,
      contactName: schema.contacts.name,
      projectTitle: schema.linesOfBusiness.title,
      liveLabel: schema.projectLinks.label,
      roomName: schema.partnerRooms.name,
      sharedByName: schema.users.displayName,
      meetingTitle: schema.meetings.title,
      lobLogoUrl: schema.linesOfBusiness.logoUrl,
      lobLogoUrlDark: schema.linesOfBusiness.logoUrlDark,
      storagePath: schema.projectLinks.storagePath,
      mimeType: schema.projectLinks.mimeType,
      originalFilename: schema.projectLinks.originalFilename,
      sizeBytes: schema.projectLinks.sizeBytes,
      description: schema.projectLinks.description,
    })
    .from(schema.partnerShares)
    .leftJoin(schema.contacts, eq(schema.contacts.id, schema.partnerShares.contactId))
    .leftJoin(schema.linesOfBusiness, eq(schema.linesOfBusiness.id, schema.partnerShares.lobId))
    .leftJoin(
      schema.projectLinks,
      eq(schema.projectLinks.id, schema.partnerShares.projectLinkId),
    )
    .leftJoin(schema.partnerRooms, eq(schema.partnerRooms.id, schema.partnerShares.roomId))
    .leftJoin(schema.users, eq(schema.users.id, schema.partnerShares.sharedBy))
      .leftJoin(schema.meetings, eq(schema.meetings.id, schema.partnerShares.meetingId))
    .where(
      and(
        eq(schema.partnerShares.roomId, row.room.id),
        isNull(schema.partnerShares.revokedAt),
        or(
          isNull(schema.partnerShares.expiresAt),
          gt(schema.partnerShares.expiresAt, new Date()),
        ),
      ),
    )
    .orderBy(desc(schema.partnerShares.sharedAt));

  const mappedShares = shares.map((shareRow) => ({
    ...shareRow.share,
    contactName: shareRow.contactName,
    projectTitle: shareRow.projectTitle,
    liveLabel: shareRow.liveLabel,
    roomName: shareRow.roomName,
    sharedByName: shareRow.sharedByName,
    meetingTitle: shareRow.meetingTitle,
    lobLogoUrl: shareRow.lobLogoUrl,
    lobLogoUrlDark: shareRow.lobLogoUrlDark,
    storagePath: shareRow.storagePath,
    mimeType: shareRow.mimeType,
    originalFilename: shareRow.originalFilename,
    sizeBytes: shareRow.sizeBytes,
    description: shareRow.description,
    signedUrl: null,
  }));

  const [brandLogos, team] = await Promise.all([
    resolveRoomBrandLogos({
      workspaceId: row.room.workspaceId,
      brandLobIds: row.room.brandLobIds ?? null,
      shares: mappedShares,
    }),
    listRoomTeam({ roomId: row.room.id }),
  ]);

  return {
    room: row.room,
    contact: {
      id: row.contactId,
      name: row.contactName,
      organization: row.contactOrganization,
      logoUrl: row.contactLogoUrl,
    },
    brandLogos,
    team,
    shares: mappedShares,
  };
}

/**
 * Presence ping from an open room tab. Bumps only the viewed timestamps —
 * no access event (a heartbeat isn't a visit) and no `updatedAt` (which
 * drives the guest-facing "Actualizado" chip and must reflect real content).
 */
export async function touchPartnerRoomPresence(input: {
  roomId: string;
  memberId?: string | null;
}) {
  const now = new Date();
  await db
    .update(schema.partnerRooms)
    .set({ publicAccessLastViewedAt: now })
    .where(eq(schema.partnerRooms.id, input.roomId));
  if (input.memberId) {
    await db
      .update(schema.partnerRoomMembers)
      .set({ lastViewedAt: now })
      .where(
        and(
          eq(schema.partnerRoomMembers.id, input.memberId),
          eq(schema.partnerRoomMembers.roomId, input.roomId),
        ),
      );
  }
}

export async function recordPublicPartnerRoomView(input: {
  roomId: string;
  workspaceId: string;
  contactId: string | null;
  memberId?: string | null;
  memberEmail?: string | null;
}) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.partnerRooms)
      .set({
        publicAccessLastViewedAt: now,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(schema.partnerRooms.id, input.roomId));

    if (input.memberId) {
      await tx
        .update(schema.partnerRoomMembers)
        .set({ lastViewedAt: now })
        .where(
          and(
            eq(schema.partnerRoomMembers.id, input.memberId),
            eq(schema.partnerRoomMembers.roomId, input.roomId),
          ),
        );
    }

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      contactId: input.contactId,
      eventType: "viewed",
      metadata: input.memberEmail
        ? { surface: "public_room", memberEmail: input.memberEmail }
        : { surface: "public_room" },
    });
  });
}

export async function getPublicPartnerShareByToken(input: {
  token: string;
  shareId: string;
}) {
  const tokenHash = hashPartnerAccessToken(input.token);
  const [row] = await db
    .select({
      room: schema.partnerRooms,
      share: schema.partnerShares,
      storagePath: schema.projectLinks.storagePath,
      url: schema.projectLinks.url,
    })
    .from(schema.partnerRooms)
    .innerJoin(schema.partnerShares, eq(schema.partnerShares.roomId, schema.partnerRooms.id))
    .leftJoin(
      schema.projectLinks,
      eq(schema.projectLinks.id, schema.partnerShares.projectLinkId),
    )
    .where(
      and(
        eq(schema.partnerRooms.publicAccessTokenHash, tokenHash),
        eq(schema.partnerShares.id, input.shareId),
        isNull(schema.partnerShares.revokedAt),
      ),
    )
    .limit(1);

  if (!row || row.room.status === "revoked" || row.room.status === "paused") {
    return null;
  }
  if (row.room.expiresAt && row.room.expiresAt.getTime() < Date.now()) {
    return null;
  }
  if (row.share.expiresAt && row.share.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return row;
}

export async function recordPublicPartnerShareEvent(input: {
  workspaceId: string;
  roomId: string;
  shareId: string;
  contactId: string | null;
  event: "viewed" | "downloaded";
}) {
  const now = new Date();
  const patch =
    input.event === "downloaded"
      ? { viewedAt: now, downloadedAt: now }
      : { viewedAt: now };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.partnerShares)
      .set(patch)
      .where(eq(schema.partnerShares.id, input.shareId));

    await tx
      .update(schema.partnerRooms)
      .set({ lastActivityAt: now, publicAccessLastViewedAt: now, updatedAt: now })
      .where(eq(schema.partnerRooms.id, input.roomId));

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      shareId: input.shareId,
      contactId: input.contactId,
      eventType: input.event,
      metadata: { surface: "public_room" },
    });
  });
}

export type PartnerShareTrackingEvent = "viewed" | "downloaded" | "revoked";

export async function recordPartnerShareTracking(input: {
  workspaceId: string;
  actorId: string;
  shareId: string;
  event: PartnerShareTrackingEvent;
}) {
  const [share] = await db
    .select()
    .from(schema.partnerShares)
    .where(
      and(
        eq(schema.partnerShares.id, input.shareId),
        eq(schema.partnerShares.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);

  if (!share) return { ok: false as const, error: "Share not found" };

  const now = new Date();
  const patch =
    input.event === "viewed"
      ? { viewedAt: share.viewedAt ?? now }
      : input.event === "downloaded"
        ? {
            viewedAt: share.viewedAt ?? now,
            downloadedAt: share.downloadedAt ?? now,
          }
        : { revokedAt: share.revokedAt ?? now };

  await db.transaction(async (tx) => {
    await tx
      .update(schema.partnerShares)
      .set(patch)
      .where(eq(schema.partnerShares.id, input.shareId));

    if (share.roomId) {
      await tx
        .update(schema.partnerRooms)
        .set({ lastActivityAt: now, updatedAt: now })
        .where(eq(schema.partnerRooms.id, share.roomId));
    }

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: share.roomId,
      shareId: share.id,
      contactId: share.contactId,
      actorUserId: input.actorId,
      eventType: input.event,
      metadata: { manual: true, label: share.labelSnapshot },
    });
  });

  return {
    ok: true as const,
    id: share.id,
    roomId: share.roomId,
    contactId: share.contactId,
    projectId: share.lobId,
  };
}
