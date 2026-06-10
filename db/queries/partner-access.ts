import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createPartnerAccessToken,
  hashPartnerAccessToken,
} from "@/lib/partner-access-token.server";
import {
  hashPartnerRoomPasscode,
  verifyPasscodeAgainstHash,
  PARTNER_PASSCODE_LOCK_MINUTES,
  PARTNER_PASSCODE_MAX_ATTEMPTS,
} from "@/lib/partner-room-gate.server";
import type {
  PartnerKind,
  PartnerPermission,
  PartnerRoomStatus,
  PartnerShareChannel,
} from "@/lib/partner-access";

export type PartnerAccessRoom = typeof schema.partnerRooms.$inferSelect & {
  shareCount: number;
  memberCount: number;
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
};

export async function listPartnerAccessForContact(opts: {
  workspaceId: string;
  contactId: string;
}): Promise<PartnerAccessOverview> {
  const rooms = await db
    .select()
    .from(schema.partnerRooms)
    .where(
      and(
        eq(schema.partnerRooms.workspaceId, opts.workspaceId),
        eq(schema.partnerRooms.primaryContactId, opts.contactId),
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
          eq(schema.partnerShares.contactId, opts.contactId),
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

  const [shares, members, events] = await Promise.all([
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
  };
}

export async function updatePartnerRoomDetails(input: {
  workspaceId: string;
  actorId: string;
  roomId: string;
  name: string;
  partnerKind: PartnerKind;
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
  shares: Array<PartnerAccessShare & {
    storagePath: string | null;
    mimeType: string | null;
    originalFilename: string | null;
    sizeBytes: number | null;
    description: string | null;
    signedUrl: string | null;
  }>;
};

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
    throw error;
  });

  if (!result) return { ok: false as const, error: "Room not found" };
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
        status: "active",
        publicAccessTokenHash: hashPartnerAccessToken(accessToken),
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

/** Upsert a self-identified room visitor into partner_room_members. */
export async function identifyPartnerRoomMember(input: {
  workspaceId: string;
  roomId: string;
  contactId: string | null;
  email: string;
  displayName?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName?.trim() || null;
  const now = new Date();

  const member = await db.transaction(async (tx) => {
    // Upsert on (roomId, email) so a double-submit / retried fetch can't throw
    // a unique-violation 500. onConflict counts as "already a member".
    const [row] = await tx
      .insert(schema.partnerRoomMembers)
      .values({
        workspaceId: input.workspaceId,
        roomId: input.roomId,
        contactId: input.contactId,
        email,
        displayName,
        lastViewedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.partnerRoomMembers.roomId,
          schema.partnerRoomMembers.email,
        ],
        set: {
          displayName: sql`coalesce(${displayName ?? null}, ${schema.partnerRoomMembers.displayName})`,
          lastViewedAt: now,
        },
      })
      .returning();

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

    return row;
  });

  return member;
}

export async function countPartnerRoomMembers(input: { roomId: string }) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.partnerRoomMembers)
    .where(eq(schema.partnerRoomMembers.roomId, input.roomId));
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

/** Set or clear a contact's brand logo URL (used for co-branded rooms). */
export async function setContactLogoUrl(input: {
  workspaceId: string;
  contactId: string;
  logoUrl: string | null;
}) {
  const [updated] = await db
    .update(schema.contacts)
    .set({ logoUrl: input.logoUrl, updatedAt: new Date() })
    .where(
      and(
        eq(schema.contacts.id, input.contactId),
        eq(schema.contacts.workspaceId, input.workspaceId),
      ),
    )
    .returning({ id: schema.contacts.id });
  return updated ?? null;
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

  return {
    room: row.room,
    contact: {
      id: row.contactId,
      name: row.contactName,
      organization: row.contactOrganization,
      logoUrl: row.contactLogoUrl,
    },
    brandLogos: brandLogosFromShares(mappedShares),
    shares: mappedShares,
  };
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
