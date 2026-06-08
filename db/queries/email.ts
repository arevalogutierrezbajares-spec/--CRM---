import "server-only";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/current-user";
import { resolveMailboxRights, hasAnyRight } from "@/lib/email/access";
import { normalizeEmail, previewText } from "@/lib/email/format";
import type { MailboxRecord, MailboxRights } from "@/lib/email/types";

const {
  emailProviderConnections,
  emailMailboxes,
  emailMailboxAccess,
  emailProvisioningRequests,
  emailThreads,
  emailMessages,
  emailAttachments,
  emailDrafts,
  emailInternalNotes,
  emailThreadCrmLinks,
  emailAuditEvents,
  users,
  workspaceMembers,
  contacts,
  contactChannels,
  projects,
  initiatives,
  milestones,
  touches,
  notifications,
} = schema;

export type EmailMailboxView = typeof emailMailboxes.$inferSelect & {
  rights: MailboxRights;
  ownerName: string | null;
};

export type EmailThreadListItem = typeof emailThreads.$inferSelect & {
  mailboxAddress: string;
  mailboxDisplayName: string;
  mailboxType: "personal" | "shared" | "system";
  assignedToName: string | null;
  lastMessageDirection: "inbound" | "outbound" | null;
  lastProviderFolder: string | null;
  lastSenderName: string | null;
  lastSenderAddress: string | null;
  lastRecipientSummary: string | null;
  hasOutboundMessage: boolean;
  searchText: string;
  links: Array<{ id: string; linkType: string; refId: string; label: string }>;
};

export type EmailMessageView = typeof emailMessages.$inferSelect & {
  attachments: (typeof emailAttachments.$inferSelect)[];
};

export type EmailThreadDetail = EmailThreadListItem & {
  messages: EmailMessageView[];
  notes: Array<typeof emailInternalNotes.$inferSelect & { authorName: string | null }>;
};

export type EmailContactOption = {
  id: string;
  name: string;
  email: string | null;
};

export type EmailProjectOption = {
  id: string;
  title: string;
};

export type EmailInitiativeOption = {
  id: string;
  title: string;
};

export type EmailMilestoneOption = {
  id: string;
  title: string;
  projectTitle: string;
};

export type EmailMemberOption = {
  userId: string;
  displayName: string;
  email: string;
  role: "owner" | "admin" | "member";
};

export type EmailMailboxAccessView = typeof emailMailboxAccess.$inferSelect & {
  userName: string | null;
  userEmail: string | null;
  grantedByName: string | null;
};

export type EmailProvisioningRequestView = typeof emailProvisioningRequests.$inferSelect & {
  requestedByName: string | null;
  targetUserName: string | null;
  targetMailboxAddress: string | null;
};

export type EmailDraftView = typeof emailDrafts.$inferSelect & {
  mailboxAddress: string;
  mailboxType: "personal" | "shared" | "system";
};

export type EmailModuleData = {
  setupComplete: boolean;
  provider: {
    id: string;
    provider: "sandbox" | "microsoft_365" | "zoho_mail";
    domain: string;
    status: "connected" | "degraded" | "disconnected";
    healthStatus: string;
    healthDetail: string | null;
    lastHealthAt: Date | null;
  } | null;
  mailboxes: EmailMailboxView[];
  threads: EmailThreadListItem[];
  selectedThread: EmailThreadDetail | null;
  members: EmailMemberOption[];
  contacts: EmailContactOption[];
  projects: EmailProjectOption[];
  initiatives: EmailInitiativeOption[];
  milestones: EmailMilestoneOption[];
  accessGrants: EmailMailboxAccessView[];
  provisioningRequests: EmailProvisioningRequestView[];
  drafts: EmailDraftView[];
  audit: Array<typeof emailAuditEvents.$inferSelect & { actorName: string | null }>;
};

function asMailboxRecord(row: typeof emailMailboxes.$inferSelect): MailboxRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    address: row.address,
    displayName: row.displayName,
    type: row.type,
    status: row.status,
    ownerUserId: row.ownerUserId,
    syncEnabled: row.syncEnabled,
    sendEnabled: row.sendEnabled,
    aiEnabled: row.aiEnabled,
    providerMetadata: row.providerMetadata ?? {},
  };
}

export async function auditEmailEvent(input: {
  workspaceId: string;
  actorId?: string | null;
  mailboxId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  action: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(emailAuditEvents).values({
    workspaceId: input.workspaceId,
    actorId: input.actorId ?? null,
    mailboxId: input.mailboxId ?? null,
    threadId: input.threadId ?? null,
    messageId: input.messageId ?? null,
    action: input.action,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function listWorkspaceEmailMembers(workspaceId: string): Promise<EmailMemberOption[]> {
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(users.displayName));
}

export async function listAccessibleMailboxes(user: SessionUser): Promise<EmailMailboxView[]> {
  const rows = await db
    .select({
      mailbox: emailMailboxes,
      ownerName: users.displayName,
    })
    .from(emailMailboxes)
    .leftJoin(users, eq(users.id, emailMailboxes.ownerUserId))
    .where(eq(emailMailboxes.workspaceId, user.workspaceId))
    .orderBy(asc(emailMailboxes.type), asc(emailMailboxes.address));

  if (rows.length === 0) return [];

  const grants = await db
    .select()
    .from(emailMailboxAccess)
    .where(
      and(
        eq(emailMailboxAccess.workspaceId, user.workspaceId),
        eq(emailMailboxAccess.userId, user.id),
      ),
    );
  const grantByMailbox = new Map(grants.map((g) => [g.mailboxId, g]));

  return rows
    .map(({ mailbox, ownerName }) => {
      const rights = resolveMailboxRights({
        user,
        mailbox: asMailboxRecord(mailbox),
        grant: grantByMailbox.get(mailbox.id),
      });
      return { ...mailbox, rights, ownerName };
    })
    .filter((m) => hasAnyRight(m.rights));
}

export async function getMailboxForAction(user: SessionUser, mailboxId: string) {
  const [mailbox] = await db
    .select()
    .from(emailMailboxes)
    .where(and(eq(emailMailboxes.id, mailboxId), eq(emailMailboxes.workspaceId, user.workspaceId)))
    .limit(1);
  if (!mailbox) return null;
  const [grant] = await db
    .select()
    .from(emailMailboxAccess)
    .where(
      and(
        eq(emailMailboxAccess.mailboxId, mailbox.id),
        eq(emailMailboxAccess.userId, user.id),
      ),
    )
    .limit(1);
  return {
    mailbox,
    record: asMailboxRecord(mailbox),
    rights: resolveMailboxRights({ user, mailbox: asMailboxRecord(mailbox), grant }),
  };
}

export async function getThreadForAction(user: SessionUser, threadId: string) {
  const [row] = await db
    .select({
      thread: emailThreads,
      mailbox: emailMailboxes,
    })
    .from(emailThreads)
    .innerJoin(emailMailboxes, eq(emailMailboxes.id, emailThreads.mailboxId))
    .where(and(eq(emailThreads.id, threadId), eq(emailThreads.workspaceId, user.workspaceId)))
    .limit(1);
  if (!row) return null;
  const mailbox = await getMailboxForAction(user, row.mailbox.id);
  if (!mailbox?.rights.canView) return null;
  return { ...row, rights: mailbox.rights, mailboxRecord: mailbox.record };
}

async function listContactOptions(workspaceId: string): Promise<EmailContactOption[]> {
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contactChannels.value,
    })
    .from(contacts)
    .leftJoin(
      contactChannels,
      and(eq(contactChannels.contactId, contacts.id), eq(contactChannels.kind, "email")),
    )
    .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.archived, false)))
    .orderBy(asc(contacts.name))
    .limit(200);
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

async function listProjectOptions(workspaceId: string): Promise<EmailProjectOption[]> {
  // Email-as-touch links to a venture (Line of Business).
  return db
    .select({ id: projects.id, title: projects.title })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .orderBy(asc(projects.title))
    .limit(200);
}

async function listInitiativeOptions(workspaceId: string): Promise<EmailInitiativeOption[]> {
  return db
    .select({ id: initiatives.id, title: initiatives.title })
    .from(initiatives)
    .where(eq(initiatives.workspaceId, workspaceId))
    .orderBy(asc(initiatives.title))
    .limit(200);
}

async function listMilestoneOptions(workspaceId: string): Promise<EmailMilestoneOption[]> {
  const rows = await db
    .select({
      id: milestones.id,
      title: milestones.title,
      projectTitle: projects.title,
    })
    .from(milestones)
    .innerJoin(projects, eq(projects.id, milestones.projectId))
    .where(
      and(
        eq(milestones.workspaceId, workspaceId),
        sql`${milestones.status} not in ('done', 'cancelled')`,
      ),
    )
    .orderBy(asc(projects.title), asc(milestones.title))
    .limit(200);
  return rows;
}

async function listMailboxAccessReview(
  user: SessionUser,
  mailboxIds: string[],
): Promise<EmailMailboxAccessView[]> {
  if (mailboxIds.length === 0) return [];
  const grantedByUsers = alias(schema.users, "email_granted_by_users");
  const rows = await db
    .select({
      grant: emailMailboxAccess,
      userName: users.displayName,
      userEmail: users.email,
      grantedByName: grantedByUsers.displayName,
    })
    .from(emailMailboxAccess)
    .leftJoin(users, eq(users.id, emailMailboxAccess.userId))
    .leftJoin(grantedByUsers, eq(grantedByUsers.id, emailMailboxAccess.grantedBy))
    .where(
      and(
        eq(emailMailboxAccess.workspaceId, user.workspaceId),
        inArray(emailMailboxAccess.mailboxId, mailboxIds),
      ),
    )
    .orderBy(asc(users.displayName));
  return rows.map((row) => ({
    ...row.grant,
    userName: row.userName,
    userEmail: row.userEmail,
    grantedByName: row.grantedByName,
  }));
}

export async function listEmailProvisioningRequests(
  user: SessionUser,
): Promise<EmailProvisioningRequestView[]> {
  if (user.workspaceRole !== "owner" && user.workspaceRole !== "admin") return [];
  const requestedByUsers = alias(schema.users, "email_request_requested_by_users");
  const targetUsers = alias(schema.users, "email_request_target_users");
  const rows = await db
    .select({
      request: emailProvisioningRequests,
      requestedByName: requestedByUsers.displayName,
      targetUserName: targetUsers.displayName,
      targetMailboxAddress: emailMailboxes.address,
    })
    .from(emailProvisioningRequests)
    .leftJoin(requestedByUsers, eq(requestedByUsers.id, emailProvisioningRequests.requestedBy))
    .leftJoin(targetUsers, eq(targetUsers.id, emailProvisioningRequests.targetUserId))
    .leftJoin(emailMailboxes, eq(emailMailboxes.id, emailProvisioningRequests.targetMailboxId))
    .where(eq(emailProvisioningRequests.workspaceId, user.workspaceId))
    .orderBy(desc(emailProvisioningRequests.createdAt))
    .limit(80);
  return rows.map((row) => ({
    ...row.request,
    requestedByName: row.requestedByName,
    targetUserName: row.targetUserName,
    targetMailboxAddress: row.targetMailboxAddress,
  }));
}

async function listEmailDraftsForUser(
  user: SessionUser,
  mailboxIds: string[],
): Promise<EmailDraftView[]> {
  if (mailboxIds.length === 0) return [];
  const rows = await db
    .select({
      draft: emailDrafts,
      mailboxAddress: emailMailboxes.address,
      mailboxType: emailMailboxes.type,
    })
    .from(emailDrafts)
    .innerJoin(emailMailboxes, eq(emailMailboxes.id, emailDrafts.mailboxId))
    .where(
      and(
        eq(emailDrafts.workspaceId, user.workspaceId),
        eq(emailDrafts.authorUserId, user.id),
        eq(emailDrafts.status, "draft"),
        inArray(emailDrafts.mailboxId, mailboxIds),
      ),
    )
    .orderBy(desc(emailDrafts.updatedAt))
    .limit(50);
  return rows.map((row) => ({
    ...row.draft,
    mailboxAddress: row.mailboxAddress,
    mailboxType: row.mailboxType,
  }));
}

export async function listEmailThreadsForUser(user: SessionUser): Promise<EmailThreadListItem[]> {
  const mailboxes = await listAccessibleMailboxes(user);
  const mailboxIds = mailboxes.map((m) => m.id);
  if (mailboxIds.length === 0) return [];

  const rows = await db
    .select({
      thread: emailThreads,
      mailboxAddress: emailMailboxes.address,
      mailboxDisplayName: emailMailboxes.displayName,
      mailboxType: emailMailboxes.type,
      assignedToName: users.displayName,
    })
    .from(emailThreads)
    .innerJoin(emailMailboxes, eq(emailMailboxes.id, emailThreads.mailboxId))
    .leftJoin(users, eq(users.id, emailThreads.assignedToId))
    .where(
      and(eq(emailThreads.workspaceId, user.workspaceId), inArray(emailThreads.mailboxId, mailboxIds)),
    )
    .orderBy(desc(emailThreads.lastMessageAt))
    .limit(300);

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.thread.id);
  const links = await db
    .select()
    .from(emailThreadCrmLinks)
    .where(inArray(emailThreadCrmLinks.threadId, ids));
  const messageRows = await db
    .select({
      threadId: emailMessages.threadId,
      direction: emailMessages.direction,
      fromAddress: emailMessages.fromAddress,
      fromName: emailMessages.fromName,
      toRecipients: emailMessages.toRecipients,
      ccRecipients: emailMessages.ccRecipients,
      subject: emailMessages.subject,
      bodyText: emailMessages.bodyText,
      providerFolder: emailMessages.providerFolder,
      sentAt: emailMessages.sentAt,
      receivedAt: emailMessages.receivedAt,
      createdAt: emailMessages.createdAt,
    })
    .from(emailMessages)
    .where(inArray(emailMessages.threadId, ids));
  const messageRollups = new Map<
    string,
    {
      latestAt: number;
      lastMessageDirection: "inbound" | "outbound" | null;
      lastProviderFolder: string | null;
      lastSenderName: string | null;
      lastSenderAddress: string | null;
      lastRecipientSummary: string | null;
      hasOutboundMessage: boolean;
      searchParts: string[];
    }
  >();
  for (const message of messageRows) {
    const previous = messageRollups.get(message.threadId) ?? {
      latestAt: 0,
      lastMessageDirection: null,
      lastProviderFolder: null,
      lastSenderName: null,
      lastSenderAddress: null,
      lastRecipientSummary: null,
      hasOutboundMessage: false,
      searchParts: [],
    };
    const messageAt = new Date(message.sentAt ?? message.receivedAt ?? message.createdAt).getTime();
    const recipients = [...message.toRecipients, ...message.ccRecipients].filter(Boolean);
    const recipientSummary =
      recipients.length <= 2
        ? recipients.join(", ")
        : `${recipients.slice(0, 2).join(", ")} +${recipients.length - 2}`;
    const isLatest = messageAt >= previous.latestAt;
    messageRollups.set(message.threadId, {
      latestAt: Math.max(previous.latestAt, messageAt),
      lastMessageDirection: isLatest ? message.direction : previous.lastMessageDirection,
      lastProviderFolder: isLatest ? message.providerFolder : previous.lastProviderFolder,
      lastSenderName: isLatest ? message.fromName : previous.lastSenderName,
      lastSenderAddress: isLatest ? message.fromAddress : previous.lastSenderAddress,
      lastRecipientSummary: isLatest ? recipientSummary || null : previous.lastRecipientSummary,
      hasOutboundMessage: previous.hasOutboundMessage || message.direction === "outbound",
      searchParts: [
        ...previous.searchParts,
        message.fromName ?? "",
        message.fromAddress,
        ...recipients,
        message.subject,
        previewText(message.bodyText, 360),
      ],
    });
  }

  return rows.map((r) => ({
    ...r.thread,
    mailboxAddress: r.mailboxAddress,
    mailboxDisplayName: r.mailboxDisplayName,
    mailboxType: r.mailboxType,
    assignedToName: r.assignedToName,
    lastMessageDirection: messageRollups.get(r.thread.id)?.lastMessageDirection ?? null,
    lastProviderFolder: messageRollups.get(r.thread.id)?.lastProviderFolder ?? null,
    lastSenderName: messageRollups.get(r.thread.id)?.lastSenderName ?? null,
    lastSenderAddress: messageRollups.get(r.thread.id)?.lastSenderAddress ?? null,
    lastRecipientSummary: messageRollups.get(r.thread.id)?.lastRecipientSummary ?? null,
    hasOutboundMessage: messageRollups.get(r.thread.id)?.hasOutboundMessage ?? false,
    searchText: [
      r.thread.subject,
      r.thread.lastMessagePreview ?? "",
      r.mailboxAddress,
      r.mailboxDisplayName,
      r.assignedToName ?? "",
      ...(messageRollups.get(r.thread.id)?.searchParts ?? []),
      ...links.filter((l) => l.threadId === r.thread.id).map((l) => l.label),
    ].join(" "),
    links: links
      .filter((l) => l.threadId === r.thread.id)
      .map((l) => ({ id: l.id, linkType: l.linkType, refId: l.refId, label: l.label })),
  }));
}

export async function getEmailThreadDetail(
  user: SessionUser,
  threadId: string,
): Promise<EmailThreadDetail | null> {
  const base = await listEmailThreadsForUser(user);
  const thread = base.find((t) => t.id === threadId);
  if (!thread) return null;
  const messages = await db
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.workspaceId, user.workspaceId), eq(emailMessages.threadId, threadId)))
    .orderBy(asc(emailMessages.createdAt));
  const messageIds = messages.map((m) => m.id);
  const [attachments, notes] = await Promise.all([
    messageIds.length > 0
      ? db.select().from(emailAttachments).where(inArray(emailAttachments.messageId, messageIds))
      : Promise.resolve([]),
    db
      .select({
        note: emailInternalNotes,
        authorName: users.displayName,
      })
      .from(emailInternalNotes)
      .leftJoin(users, eq(users.id, emailInternalNotes.authorUserId))
      .where(eq(emailInternalNotes.threadId, threadId))
      .orderBy(asc(emailInternalNotes.createdAt)),
  ]);

  return {
    ...thread,
    messages: messages.map((m) => ({
      ...m,
      attachments: attachments.filter((a) => a.messageId === m.id),
    })),
    notes: notes.map((n) => ({ ...n.note, authorName: n.authorName })),
  };
}

export async function getEmailModuleData(
  user: SessionUser,
  selectedThreadId?: string,
): Promise<EmailModuleData> {
  const [provider] = await db
    .select()
    .from(emailProviderConnections)
    .where(eq(emailProviderConnections.workspaceId, user.workspaceId))
    .orderBy(desc(emailProviderConnections.createdAt))
    .limit(1);
  const mailboxes = await listAccessibleMailboxes(user);
  const mailboxIds = mailboxes.map((mailbox) => mailbox.id);
  const [
    threads,
    members,
    contactOptions,
    projectOptions,
    initiativeOptions,
    milestoneOptions,
    accessGrants,
    provisioningRequests,
    drafts,
    auditRows,
  ] = await Promise.all([
    listEmailThreadsForUser(user),
    listWorkspaceEmailMembers(user.workspaceId),
    listContactOptions(user.workspaceId),
    listProjectOptions(user.workspaceId),
    listInitiativeOptions(user.workspaceId),
    listMilestoneOptions(user.workspaceId),
    listMailboxAccessReview(user, mailboxIds),
    listEmailProvisioningRequests(user),
    listEmailDraftsForUser(user, mailboxIds),
    db
      .select({ event: emailAuditEvents, actorName: users.displayName })
      .from(emailAuditEvents)
      .leftJoin(users, eq(users.id, emailAuditEvents.actorId))
      .where(eq(emailAuditEvents.workspaceId, user.workspaceId))
      .orderBy(desc(emailAuditEvents.createdAt))
      .limit(80),
  ]);

  const selectedId = selectedThreadId ?? threads[0]?.id;
  const selectedThread = selectedId ? await getEmailThreadDetail(user, selectedId) : null;

  return {
    setupComplete: Boolean(provider && mailboxes.length > 0),
    provider: provider
      ? {
          id: provider.id,
          provider: provider.provider,
          domain: provider.domain,
          status: provider.status,
          healthStatus: provider.healthStatus,
          healthDetail: provider.healthDetail,
          lastHealthAt: provider.lastHealthAt,
        }
      : null,
    mailboxes,
    threads,
    selectedThread,
    members,
    contacts: contactOptions,
    projects: projectOptions,
    initiatives: initiativeOptions,
    milestones: milestoneOptions,
    accessGrants,
    provisioningRequests,
    drafts,
    audit: auditRows.map((r) => ({ ...r.event, actorName: r.actorName })),
  };
}

export async function recalculateMailboxCounts(workspaceId: string, mailboxIds: string[]) {
  for (const mailboxId of mailboxIds) {
    const [counts] = await db
      .select({
        threadCount: sql<number>`count(*)::int`,
        unreadCount: sql<number>`count(*) filter (where ${emailThreads.isUnread})::int`,
      })
      .from(emailThreads)
      .where(and(eq(emailThreads.workspaceId, workspaceId), eq(emailThreads.mailboxId, mailboxId)));
    await db
      .update(emailMailboxes)
      .set({
        threadCount: counts?.threadCount ?? 0,
        unreadCount: counts?.unreadCount ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(emailMailboxes.id, mailboxId));
  }
}

export async function upsertIncomingMessage(args: {
  workspaceId: string;
  mailboxId: string;
  providerThreadId: string;
  providerMessageId: string;
  internetMessageId: string;
  fromAddress: string;
  fromName?: string | null;
  toRecipients: string[];
  ccRecipients?: string[];
  subject: string;
  bodyText: string;
  receivedAt: Date;
  attachments?: Array<{
    providerAttachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }>;
}) {
  const hasAttachments = (args.attachments?.length ?? 0) > 0;
  const [thread] = await db
    .insert(emailThreads)
    .values({
      workspaceId: args.workspaceId,
      mailboxId: args.mailboxId,
      providerThreadId: args.providerThreadId,
      subject: args.subject,
      lastMessageAt: args.receivedAt,
      lastMessagePreview: previewText(args.bodyText),
      hasAttachments,
      isUnread: true,
    })
    .onConflictDoUpdate({
      target: [emailThreads.mailboxId, emailThreads.providerThreadId],
      set: {
        subject: args.subject,
        lastMessageAt: args.receivedAt,
        lastMessagePreview: previewText(args.bodyText),
        hasAttachments,
        isUnread: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [message] = await db
    .insert(emailMessages)
    .values({
      workspaceId: args.workspaceId,
      threadId: thread.id,
      mailboxId: args.mailboxId,
      providerMessageId: args.providerMessageId,
      internetMessageId: args.internetMessageId,
      direction: "inbound",
      fromAddress: normalizeEmail(args.fromAddress),
      fromName: args.fromName ?? null,
      toRecipients: args.toRecipients,
      ccRecipients: args.ccRecipients ?? [],
      subject: args.subject,
      bodyText: args.bodyText,
      receivedAt: args.receivedAt,
      providerFolder: "inbox",
    })
    .onConflictDoNothing()
    .returning();

  if (message && args.attachments?.length) {
    await db
      .insert(emailAttachments)
      .values(
        args.attachments.map((a) => ({
          workspaceId: args.workspaceId,
          messageId: message.id,
          providerAttachmentId: a.providerAttachmentId,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        })),
      )
      .onConflictDoNothing();
  }
  await recalculateMailboxCounts(args.workspaceId, [args.mailboxId]);
  return { threadId: thread.id, messageId: message?.id ?? null };
}

export async function findOrCreateContactFromEmail(args: {
  workspaceId: string;
  actorId: string;
  email: string;
  name?: string | null;
}) {
  const value = normalizeEmail(args.email);
  const [existing] = await db
    .select({ contact: contacts })
    .from(contactChannels)
    .innerJoin(contacts, eq(contacts.id, contactChannels.contactId))
    .where(
      and(
        eq(contacts.workspaceId, args.workspaceId),
        eq(contactChannels.kind, "email"),
        ilike(contactChannels.value, value),
      ),
    )
    .limit(1);
  if (existing) return existing.contact;

  const [contact] = await db
    .insert(contacts)
    .values({
      workspaceId: args.workspaceId,
      name: args.name?.trim() || value.split("@")[0] || value,
      relationshipType: "prospect",
      createdBy: args.actorId,
    })
    .returning();
  await db.insert(contactChannels).values({
    contactId: contact.id,
    kind: "email",
    value,
    isPrimary: true,
  });
  return contact;
}

export async function linkEmailThread(args: {
  workspaceId: string;
  actorId: string;
  threadId: string;
  linkType: "contact" | "project" | "initiative" | "action_item" | "milestone";
  refId: string;
  label: string;
}) {
  await db
    .insert(emailThreadCrmLinks)
    .values({
      workspaceId: args.workspaceId,
      threadId: args.threadId,
      linkType: args.linkType,
      refId: args.refId,
      label: args.label,
      createdBy: args.actorId,
    })
    .onConflictDoNothing();
}

export async function createTouchFromThread(args: {
  workspaceId: string;
  actorId: string;
  threadId: string;
  contactId: string;
  projectId?: string | null;
}) {
  const detail = await db
    .select()
    .from(emailThreads)
    .where(and(eq(emailThreads.id, args.threadId), eq(emailThreads.workspaceId, args.workspaceId)))
    .limit(1);
  const thread = detail[0];
  if (!thread) return null;
  const [touch] = await db
    .insert(touches)
    .values({
      workspaceId: args.workspaceId,
      contactId: args.contactId,
      projectId: args.projectId ?? null,
      channel: "email",
      body: `${thread.subject}\n\n${thread.lastMessagePreview ?? ""}`.trim(),
      createdBy: args.actorId,
    })
    .returning();
  await db
    .update(contacts)
    .set({ lastTouchAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, args.contactId));
  return touch;
}

export async function notifyEmailAssignment(args: {
  workspaceId: string;
  actorId: string;
  assigneeUserId: string;
  threadId: string;
  subject: string;
}) {
  await db.insert(notifications).values({
    workspaceId: args.workspaceId,
    userId: args.assigneeUserId,
    actorId: args.actorId,
    entityType: "email_thread",
    entityId: args.threadId,
    title: args.subject,
    kind: "assigned",
  });
}
