import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createPartnerAccessToken,
  hashPartnerAccessToken,
} from "@/lib/partner-access-token.server";
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
    },
    createdByName: roomRow.createdByName,
    shares: shares.map((row) => ({
      ...row.share,
      contactName: row.contactName,
      projectTitle: row.projectTitle,
      liveLabel: row.liveLabel,
      roomName: row.roomName,
      sharedByName: row.sharedByName,
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
};

export type PublicPartnerRoom = {
  room: typeof schema.partnerRooms.$inferSelect;
  contact: {
    id: string | null;
    name: string | null;
    organization: string | null;
  };
  shares: Array<PartnerAccessShare & {
    storagePath: string | null;
    mimeType: string | null;
    originalFilename: string | null;
    sizeBytes: number | null;
    description: string | null;
    signedUrl: string | null;
  }>;
};

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
        and(
          eq(schema.partnerRooms.workspaceId, input.workspaceId),
          eq(schema.partnerRooms.primaryContactId, input.contactId),
          eq(schema.partnerRooms.partnerKind, input.partnerKind),
          ne(schema.partnerRooms.status, "revoked"),
        ),
      )
      .orderBy(desc(schema.partnerRooms.updatedAt))
      .limit(1);

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
          eq(schema.partnerShares.contactId, input.contactId),
          eq(schema.partnerShares.projectLinkId, input.projectLinkId),
          isNull(schema.partnerShares.revokedAt),
        ),
      )
      .limit(1);

    const values = {
      workspaceId: input.workspaceId,
      roomId: room.id,
      contactId: input.contactId,
      lobId: input.projectId,
      projectLinkId: input.projectLinkId,
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

    await tx.update(schema.partnerRooms).set({
      status: "active",
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
  });

  return { ok: true as const, ...result };
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

  return {
    room: row.room,
    contact: {
      id: row.contactId,
      name: row.contactName,
      organization: row.contactOrganization,
    },
    shares: shares.map((shareRow) => ({
      ...shareRow.share,
      contactName: shareRow.contactName,
      projectTitle: shareRow.projectTitle,
      liveLabel: shareRow.liveLabel,
      roomName: shareRow.roomName,
      sharedByName: shareRow.sharedByName,
      storagePath: shareRow.storagePath,
      mimeType: shareRow.mimeType,
      originalFilename: shareRow.originalFilename,
      sizeBytes: shareRow.sizeBytes,
      description: shareRow.description,
      signedUrl: null,
    })),
  };
}

export async function recordPublicPartnerRoomView(input: {
  roomId: string;
  workspaceId: string;
  contactId: string | null;
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

    await tx.insert(schema.partnerAccessEvents).values({
      workspaceId: input.workspaceId,
      roomId: input.roomId,
      contactId: input.contactId,
      eventType: "viewed",
      metadata: { surface: "public_room" },
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
