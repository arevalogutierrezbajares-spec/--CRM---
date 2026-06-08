import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  DEFAULT_FNF_CAMPAIGN_NAME,
  DEFAULT_FNF_SECTIONS,
} from "@/lib/pitch-feedback/defaults";
import { generatePitchFeedbackInsight } from "@/lib/pitch-feedback/ai";
import {
  createPitchFeedbackToken,
  hashOptionalPublicSignal,
  hashPitchFeedbackToken,
} from "@/lib/pitch-feedback/token.server";
import type {
  PitchFeedbackPersonalization,
  PitchFeedbackResponseInput,
} from "@/lib/pitch-feedback/types";

const {
  contacts,
  linesOfBusiness,
  touches,
  pitchFeedbackCampaigns,
  pitchFeedbackInvites,
  pitchFeedbackSessions,
  pitchFeedbackEvents,
  pitchFeedbackResponses,
  pitchFeedbackAiInsights,
  pitchFeedbackDeliveryAttempts,
} = schema;

export type PitchFeedbackCampaign = typeof pitchFeedbackCampaigns.$inferSelect;
export type PitchFeedbackInvite = typeof pitchFeedbackInvites.$inferSelect;
export type PitchFeedbackResponse = typeof pitchFeedbackResponses.$inferSelect;
export type PitchFeedbackInsight = typeof pitchFeedbackAiInsights.$inferSelect;

export type PitchFeedbackInviteListItem = PitchFeedbackInvite & {
  campaignName: string;
  campaignAudience: PitchFeedbackCampaign["audience"];
  contactName: string;
  latestInsight: PitchFeedbackInsight | null;
  responseCount: number;
};

export type PitchFeedbackDashboardInviteListItem = PitchFeedbackInvite & {
  campaignName: string;
  contactName: string;
  contactOrganization: string | null;
  latestInsight: PitchFeedbackInsight | null;
  responseCount: number;
};

export type PitchFeedbackContactOverview = {
  campaigns: PitchFeedbackCampaign[];
  invites: PitchFeedbackInviteListItem[];
};

export type PublicPitchFeedbackInvite = {
  invite: PitchFeedbackInvite;
  campaign: Pick<PitchFeedbackCampaign, "id" | "name" | "description" | "audience">;
  contact: {
    id: string;
    name: string;
    organization: string | null;
  };
  responses: PitchFeedbackResponse[];
};

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function defaultPersonalization(contactName: string): PitchFeedbackPersonalization {
  return {
    welcomeNote: `${contactName}, I would value your honest read on this. Move through it when you have a few minutes and react as you go.`,
    sendMessage: `Hey ${contactName.split(" ")[0] || contactName} - I made a private walkthrough and would really value your honest feedback. It is silent, quick, and you can react as you go:`,
    focusQuestions: [
      "Where does the pitch feel clearest?",
      "Where does it need proof or sharper wording?",
      "Who else would understand or challenge this well?",
    ],
  };
}

async function insertPitchEvent(
  tx: Pick<typeof db, "insert">,
  input: {
    workspaceId: string;
    inviteId: string;
    contactId: string;
    eventType: typeof pitchFeedbackEvents.$inferInsert.eventType;
    sessionId?: string | null;
    actorUserId?: string | null;
    sectionKey?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await tx.insert(pitchFeedbackEvents).values({
    workspaceId: input.workspaceId,
    inviteId: input.inviteId,
    contactId: input.contactId,
    eventType: input.eventType,
    sessionId: input.sessionId ?? null,
    actorUserId: input.actorUserId ?? null,
    sectionKey: input.sectionKey ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function ensureDefaultPitchFeedbackCampaign(opts: {
  workspaceId: string;
  actorId: string;
}) {
  const [existing] = await db
    .select()
    .from(pitchFeedbackCampaigns)
    .where(
      and(
        eq(pitchFeedbackCampaigns.workspaceId, opts.workspaceId),
        eq(pitchFeedbackCampaigns.name, DEFAULT_FNF_CAMPAIGN_NAME),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(pitchFeedbackCampaigns)
    .values({
      workspaceId: opts.workspaceId,
      name: DEFAULT_FNF_CAMPAIGN_NAME,
      description:
        "Private friends-and-family review flow for pressure-testing a pitch, capturing feedback in context, and rolling insight back to contacts.",
      audience: "friends_family",
      status: "active",
      version: 1,
      sections: DEFAULT_FNF_SECTIONS,
      createdBy: opts.actorId,
    })
    .returning();

  return created;
}

export async function listPitchFeedbackCampaigns(opts: {
  workspaceId: string;
}) {
  return db
    .select()
    .from(pitchFeedbackCampaigns)
    .where(eq(pitchFeedbackCampaigns.workspaceId, opts.workspaceId))
    .orderBy(desc(pitchFeedbackCampaigns.updatedAt));
}

export async function listPitchFeedbackForContact(opts: {
  workspaceId: string;
  contactId: string;
}): Promise<PitchFeedbackContactOverview> {
  const [campaigns, inviteRows] = await Promise.all([
    listPitchFeedbackCampaigns({ workspaceId: opts.workspaceId }),
    db
      .select({
        invite: pitchFeedbackInvites,
        campaignName: pitchFeedbackCampaigns.name,
        campaignAudience: pitchFeedbackCampaigns.audience,
        contactName: contacts.name,
      })
      .from(pitchFeedbackInvites)
      .innerJoin(
        pitchFeedbackCampaigns,
        eq(pitchFeedbackCampaigns.id, pitchFeedbackInvites.campaignId),
      )
      .innerJoin(contacts, eq(contacts.id, pitchFeedbackInvites.contactId))
      .where(
        and(
          eq(pitchFeedbackInvites.workspaceId, opts.workspaceId),
          eq(pitchFeedbackInvites.contactId, opts.contactId),
        ),
      )
      .orderBy(desc(pitchFeedbackInvites.updatedAt)),
  ]);

  const inviteIds = inviteRows.map((row) => row.invite.id);
  const [insights, responses] = inviteIds.length
    ? await Promise.all([
        db
          .select()
          .from(pitchFeedbackAiInsights)
          .where(inArray(pitchFeedbackAiInsights.inviteId, inviteIds))
          .orderBy(desc(pitchFeedbackAiInsights.createdAt)),
        db
          .select({
            inviteId: pitchFeedbackResponses.inviteId,
            id: pitchFeedbackResponses.id,
          })
          .from(pitchFeedbackResponses)
          .where(inArray(pitchFeedbackResponses.inviteId, inviteIds)),
      ])
    : [[], []];

  const latestInsightByInvite = new Map<string, PitchFeedbackInsight>();
  for (const insight of insights) {
    if (insight.inviteId && !latestInsightByInvite.has(insight.inviteId)) {
      latestInsightByInvite.set(insight.inviteId, insight);
    }
  }
  const responseCountByInvite = new Map<string, number>();
  for (const response of responses) {
    responseCountByInvite.set(
      response.inviteId,
      (responseCountByInvite.get(response.inviteId) ?? 0) + 1,
    );
  }

  return {
    campaigns,
    invites: inviteRows.map((row) => ({
      ...row.invite,
      campaignName: row.campaignName,
      campaignAudience: row.campaignAudience,
      contactName: row.contactName,
      latestInsight: latestInsightByInvite.get(row.invite.id) ?? null,
      responseCount: responseCountByInvite.get(row.invite.id) ?? 0,
    })),
  };
}

export async function createPitchFeedbackInvite(input: {
  workspaceId: string;
  actorId: string;
  contactId: string;
  campaignId?: string | null;
  channel?: typeof pitchFeedbackInvites.$inferInsert.channel;
  expiresAt?: Date | null;
  welcomeNote?: string | null;
  sendMessage?: string | null;
}) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!contact) return { ok: false as const, error: "Contact not found" };

  const campaign = input.campaignId
    ? (
        await db
          .select()
          .from(pitchFeedbackCampaigns)
          .where(
            and(
              eq(pitchFeedbackCampaigns.id, input.campaignId),
              eq(pitchFeedbackCampaigns.workspaceId, input.workspaceId),
            ),
          )
          .limit(1)
      )[0]
    : await ensureDefaultPitchFeedbackCampaign({
        workspaceId: input.workspaceId,
        actorId: input.actorId,
      });

  if (!campaign || campaign.status !== "active") {
    return { ok: false as const, error: "Active campaign not found" };
  }

  const token = createPitchFeedbackToken();
  const tokenHash = hashPitchFeedbackToken(token);
  const now = new Date();
  const basePersonalization = defaultPersonalization(contact.name);
  const personalization: PitchFeedbackPersonalization = {
    ...basePersonalization,
    welcomeNote: input.welcomeNote?.trim() || basePersonalization.welcomeNote,
    sendMessage: input.sendMessage?.trim() || basePersonalization.sendMessage,
  };

  const invite = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(pitchFeedbackInvites)
      .values({
        workspaceId: input.workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        tokenHash,
        status: "link_generated",
        channel: input.channel ?? "manual",
        personalization,
        campaignVersion: campaign.version,
        sectionsSnapshot: campaign.sections,
        expiresAt: input.expiresAt ?? addDays(30),
        createdBy: input.actorId,
        updatedAt: now,
      })
      .returning();

    await insertPitchEvent(tx, {
      workspaceId: input.workspaceId,
      inviteId: created.id,
      contactId: contact.id,
      actorUserId: input.actorId,
      eventType: "invite_created",
      metadata: { campaignId: campaign.id },
    });
    await insertPitchEvent(tx, {
      workspaceId: input.workspaceId,
      inviteId: created.id,
      contactId: contact.id,
      actorUserId: input.actorId,
      eventType: "link_generated",
      metadata: { expiresAt: created.expiresAt?.toISOString() ?? null },
    });

    return created;
  });

  return { ok: true as const, invite, token };
}

export async function markPitchFeedbackInviteSent(input: {
  workspaceId: string;
  actorId: string;
  inviteId: string;
  channel: NonNullable<typeof pitchFeedbackInvites.$inferInsert.channel>;
  message?: string | null;
}) {
  const [existing] = await db
    .select()
    .from(pitchFeedbackInvites)
    .where(
      and(
        eq(pitchFeedbackInvites.id, input.inviteId),
        eq(pitchFeedbackInvites.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!existing) return { ok: false as const, error: "Invite not found" };
  if (existing.revokedAt) return { ok: false as const, error: "Invite is revoked" };

  const now = new Date();
  const messageSnapshot = input.message?.trim() || "";
  const invite = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(pitchFeedbackInvites)
      .set({
        status: existing.status === "completed" ? existing.status : "sent",
        channel: input.channel,
        sentAt: existing.sentAt ?? now,
        sentMessage: messageSnapshot || existing.sentMessage,
        updatedAt: now,
      })
      .where(eq(pitchFeedbackInvites.id, existing.id))
      .returning();

    const [duplicateAttempt] = await tx
      .select({ id: pitchFeedbackDeliveryAttempts.id })
      .from(pitchFeedbackDeliveryAttempts)
      .where(
        and(
          eq(pitchFeedbackDeliveryAttempts.inviteId, existing.id),
          eq(pitchFeedbackDeliveryAttempts.channel, input.channel),
          eq(pitchFeedbackDeliveryAttempts.messageSnapshot, messageSnapshot),
        ),
      )
      .limit(1);

    if (!duplicateAttempt) {
      await tx.insert(pitchFeedbackDeliveryAttempts).values({
        workspaceId: input.workspaceId,
        inviteId: existing.id,
        contactId: existing.contactId,
        channel: input.channel,
        status:
          input.channel === "link"
            ? "copied"
            : input.channel === "manual"
              ? "manual"
              : "sent",
        messageSnapshot,
        createdBy: input.actorId,
      });

      await insertPitchEvent(tx, {
        workspaceId: input.workspaceId,
        inviteId: existing.id,
        contactId: existing.contactId,
        actorUserId: input.actorId,
        eventType: input.channel === "link" ? "invite_copied" : "invite_sent",
        metadata: { channel: input.channel },
      });

      await tx.insert(touches).values({
        workspaceId: input.workspaceId,
        contactId: existing.contactId,
        channel:
          input.channel === "whatsapp"
            ? "whatsapp"
            : input.channel === "email"
              ? "email"
              : "manual",
        body: `Pitch feedback invite ${input.channel === "link" ? "copied" : "sent"} for ${updated.campaignVersion ? `campaign v${updated.campaignVersion}` : "campaign"}.`,
        createdBy: input.actorId,
      });
      await tx
        .update(contacts)
        .set({ lastTouchAt: now, updatedAt: now })
        .where(eq(contacts.id, existing.contactId));
    }

    return updated;
  });

  return { ok: true as const, invite };
}

export async function revokePitchFeedbackInvite(input: {
  workspaceId: string;
  actorId: string;
  inviteId: string;
}) {
  const now = new Date();
  const invite = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(pitchFeedbackInvites)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(pitchFeedbackInvites.id, input.inviteId),
          eq(pitchFeedbackInvites.workspaceId, input.workspaceId),
        ),
      )
      .returning();
    if (!updated) return null;

    await insertPitchEvent(tx, {
      workspaceId: input.workspaceId,
      inviteId: updated.id,
      contactId: updated.contactId,
      actorUserId: input.actorId,
      eventType: "invite_revoked",
    });
    return updated;
  });

  if (!invite) return { ok: false as const, error: "Invite not found" };
  return { ok: true as const, invite };
}

export async function getPublicPitchFeedbackInviteByToken(input: {
  token: string;
}): Promise<PublicPitchFeedbackInvite | null> {
  const tokenHash = hashPitchFeedbackToken(input.token);
  const [row] = await db
    .select({
      invite: pitchFeedbackInvites,
      campaign: pitchFeedbackCampaigns,
      contactId: contacts.id,
      contactName: contacts.name,
      contactOrganization: contacts.organization,
    })
    .from(pitchFeedbackInvites)
    .innerJoin(
      pitchFeedbackCampaigns,
      eq(pitchFeedbackCampaigns.id, pitchFeedbackInvites.campaignId),
    )
    .innerJoin(contacts, eq(contacts.id, pitchFeedbackInvites.contactId))
    .where(eq(pitchFeedbackInvites.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;
  if (row.invite.revokedAt || row.invite.status === "revoked") return null;
  if (row.invite.expiresAt && row.invite.expiresAt.getTime() < Date.now()) {
    return null;
  }
  if (row.campaign.status !== "active" && row.invite.status !== "completed") {
    return null;
  }

  const responses = await db
    .select()
    .from(pitchFeedbackResponses)
    .where(eq(pitchFeedbackResponses.inviteId, row.invite.id))
    .orderBy(pitchFeedbackResponses.createdAt);

  return {
    invite: row.invite,
    campaign: {
      id: row.campaign.id,
      name: row.campaign.name,
      description: row.campaign.description,
      audience: row.campaign.audience,
    },
    contact: {
      id: row.contactId,
      name: row.contactName,
      organization: row.contactOrganization,
    },
    responses,
  };
}

export async function recordPublicPitchFeedbackOpen(input: {
  token: string;
  userAgent?: string | null;
  ip?: string | null;
  referrer?: string | null;
}) {
  const access = await getPublicPitchFeedbackInviteByToken({ token: input.token });
  if (!access) return null;

  const now = new Date();
  return db.transaction(async (tx) => {
    const status =
      access.invite.status === "completed"
        ? "completed"
        : access.invite.status === "draft" ||
            access.invite.status === "link_generated" ||
            access.invite.status === "sent"
          ? "opened"
          : access.invite.status;

    const [updated] = await tx
      .update(pitchFeedbackInvites)
      .set({
        status,
        firstOpenedAt: access.invite.firstOpenedAt ?? now,
        lastViewedAt: now,
        viewCount: access.invite.viewCount + 1,
        updatedAt: now,
      })
      .where(eq(pitchFeedbackInvites.id, access.invite.id))
      .returning();

    const [session] = await tx
      .insert(pitchFeedbackSessions)
      .values({
        workspaceId: access.invite.workspaceId,
        inviteId: access.invite.id,
        contactId: access.invite.contactId,
        userAgentHash: hashOptionalPublicSignal(input.userAgent),
        ipHash: hashOptionalPublicSignal(input.ip),
        referrer: input.referrer ?? null,
      })
      .returning();

    await insertPitchEvent(tx, {
      workspaceId: access.invite.workspaceId,
      inviteId: access.invite.id,
      contactId: access.invite.contactId,
      sessionId: session.id,
      eventType: "link_opened",
      metadata: { viewCount: updated.viewCount },
    });
    await insertPitchEvent(tx, {
      workspaceId: access.invite.workspaceId,
      inviteId: access.invite.id,
      contactId: access.invite.contactId,
      sessionId: session.id,
      eventType: "session_started",
    });

    return { ...access, invite: updated, session };
  });
}

export async function savePublicPitchFeedback(input: {
  token: string;
  sessionId: string;
  sectionKey: string;
  currentSectionKey: string;
  progressPercent: number;
  responses: PitchFeedbackResponseInput[];
  completed?: boolean;
}) {
  const access = await getPublicPitchFeedbackInviteByToken({ token: input.token });
  if (!access) return { ok: false as const, error: "Invite unavailable" };
  if (access.invite.status === "revoked") {
    return { ok: false as const, error: "Invite unavailable" };
  }

  const [session] = await db
    .select()
    .from(pitchFeedbackSessions)
    .where(
      and(
        eq(pitchFeedbackSessions.id, input.sessionId),
        eq(pitchFeedbackSessions.inviteId, access.invite.id),
      ),
    )
    .limit(1);
  if (!session) return { ok: false as const, error: "Session not found" };

  const now = new Date();
  const progress = Math.max(0, Math.min(100, Math.round(input.progressPercent)));
  const completedFirstTime = input.completed && !access.invite.completedAt;

  await db.transaction(async (tx) => {
    for (const response of input.responses) {
      const valueText = JSON.stringify(response.value ?? {});
      if (!valueText || valueText === "{}") continue;
      const [existing] = await tx
        .select()
        .from(pitchFeedbackResponses)
        .where(
          and(
            eq(pitchFeedbackResponses.inviteId, access.invite.id),
            eq(pitchFeedbackResponses.sectionKey, input.sectionKey),
            eq(pitchFeedbackResponses.promptKey, response.promptKey),
          ),
        )
        .limit(1);

      if (existing) {
        await tx
          .update(pitchFeedbackResponses)
          .set({
            sessionId: session.id,
            responseType: response.responseType,
            value: response.value,
          })
          .where(eq(pitchFeedbackResponses.id, existing.id));
      } else {
        await tx.insert(pitchFeedbackResponses).values({
          workspaceId: access.invite.workspaceId,
          inviteId: access.invite.id,
          sessionId: session.id,
          contactId: access.invite.contactId,
          sectionKey: input.sectionKey,
          promptKey: response.promptKey,
          responseType: response.responseType,
          value: response.value,
        });
      }

      await insertPitchEvent(tx, {
        workspaceId: access.invite.workspaceId,
        inviteId: access.invite.id,
        contactId: access.invite.contactId,
        sessionId: session.id,
        eventType:
          response.responseType === "reaction" || response.responseType === "score"
            ? "reaction_submitted"
            : input.completed
              ? "final_feedback_submitted"
              : "question_answered",
        sectionKey: input.sectionKey,
        metadata: {
          promptKey: response.promptKey,
          responseType: response.responseType,
        },
      });
    }

    await insertPitchEvent(tx, {
      workspaceId: access.invite.workspaceId,
      inviteId: access.invite.id,
      contactId: access.invite.contactId,
      sessionId: session.id,
      eventType: input.completed ? "invite_completed" : "section_completed",
      sectionKey: input.sectionKey,
      metadata: { progressPercent: progress },
    });

    await tx
      .update(pitchFeedbackSessions)
      .set({
        lastSeenAt: now,
        completedAt: input.completed ? session.completedAt ?? now : session.completedAt,
      })
      .where(eq(pitchFeedbackSessions.id, session.id));

    await tx
      .update(pitchFeedbackInvites)
      .set({
        status: input.completed ? "completed" : "in_progress",
        completionPercent: progress,
        currentSectionKey: input.currentSectionKey,
        completedAt: input.completed ? access.invite.completedAt ?? now : access.invite.completedAt,
        lastViewedAt: now,
        updatedAt: now,
      })
      .where(eq(pitchFeedbackInvites.id, access.invite.id));

    if (completedFirstTime) {
      await tx.insert(touches).values({
        workspaceId: access.invite.workspaceId,
        contactId: access.invite.contactId,
        channel: "manual",
        body: `Completed private pitch feedback for ${access.campaign.name}.`,
        createdBy: access.invite.createdBy,
      });
      await tx
        .update(contacts)
        .set({ lastTouchAt: now, updatedAt: now })
        .where(eq(contacts.id, access.invite.contactId));
    }
  });

  if (completedFirstTime) {
    await createPitchFeedbackInviteInsight({
      workspaceId: access.invite.workspaceId,
      inviteId: access.invite.id,
      actorId: access.invite.createdBy,
    }).catch(() => null);
  }

  return { ok: true as const };
}

export async function createPitchFeedbackInviteInsight(input: {
  workspaceId: string;
  inviteId: string;
  actorId?: string | null;
}) {
  const detail = await getPitchFeedbackInviteDetail({
    workspaceId: input.workspaceId,
    inviteId: input.inviteId,
  });
  if (!detail) return { ok: false as const, error: "Invite not found" };

  const draft = await generatePitchFeedbackInsight({
    contactName: detail.contact.name,
    campaignName: detail.campaign.name,
    responses: detail.responses.map((response) => ({
      sectionKey: response.sectionKey,
      promptKey: response.promptKey,
      responseType: response.responseType,
      value: response.value,
    })),
    workspaceId: input.workspaceId,
    userId: input.actorId ?? undefined,
  });

  const insight = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(pitchFeedbackAiInsights)
      .values({
        workspaceId: input.workspaceId,
        campaignId: detail.invite.campaignId,
        inviteId: detail.invite.id,
        contactId: detail.invite.contactId,
        scope: "invite",
        model: draft.model,
        summary: draft.summary,
        sentiment: draft.sentiment,
        confidenceScore: draft.confidenceScore,
        supportLevel: draft.supportLevel,
        objections: draft.objections,
        confusionPoints: draft.confusionPoints,
        positiveSignals: draft.positiveSignals,
        recommendedFollowup: draft.recommendedFollowup,
        suggestedPitchEdits: draft.suggestedPitchEdits,
        sourceResponseIds: detail.responses.map((response) => response.id),
        createdBy: input.actorId ?? null,
      })
      .returning();

    await insertPitchEvent(tx, {
      workspaceId: input.workspaceId,
      inviteId: detail.invite.id,
      contactId: detail.invite.contactId,
      actorUserId: input.actorId ?? null,
      eventType: "ai_summary_generated",
      metadata: {
        insightId: created.id,
        sentiment: created.sentiment,
        supportLevel: created.supportLevel,
      },
    });

    await tx.insert(touches).values({
      workspaceId: input.workspaceId,
      contactId: detail.invite.contactId,
      channel: "manual",
      body: `AI pitch feedback summary: ${created.summary.slice(0, 420)}`,
      createdBy: input.actorId ?? detail.invite.createdBy,
    });

    return created;
  });

  return { ok: true as const, insight };
}

export async function getPitchFeedbackInviteDetail(opts: {
  workspaceId: string;
  inviteId: string;
}) {
  const [row] = await db
    .select({
      invite: pitchFeedbackInvites,
      campaign: pitchFeedbackCampaigns,
      contact: contacts,
      projectTitle: linesOfBusiness.title,
    })
    .from(pitchFeedbackInvites)
    .innerJoin(
      pitchFeedbackCampaigns,
      eq(pitchFeedbackCampaigns.id, pitchFeedbackInvites.campaignId),
    )
    .innerJoin(contacts, eq(contacts.id, pitchFeedbackInvites.contactId))
    .leftJoin(linesOfBusiness, eq(linesOfBusiness.id, pitchFeedbackCampaigns.lobId))
    .where(
      and(
        eq(pitchFeedbackInvites.workspaceId, opts.workspaceId),
        eq(pitchFeedbackInvites.id, opts.inviteId),
      ),
    )
    .limit(1);

  if (!row) return null;

  const [responses, events, insights] = await Promise.all([
    db
      .select()
      .from(pitchFeedbackResponses)
      .where(eq(pitchFeedbackResponses.inviteId, row.invite.id))
      .orderBy(pitchFeedbackResponses.createdAt),
    db
      .select()
      .from(pitchFeedbackEvents)
      .where(eq(pitchFeedbackEvents.inviteId, row.invite.id))
      .orderBy(desc(pitchFeedbackEvents.createdAt))
      .limit(100),
    db
      .select()
      .from(pitchFeedbackAiInsights)
      .where(eq(pitchFeedbackAiInsights.inviteId, row.invite.id))
      .orderBy(desc(pitchFeedbackAiInsights.createdAt)),
  ]);

  return {
    ...row,
    responses,
    events,
    insights,
    latestInsight: insights[0] ?? null,
  };
}

export async function listPitchFeedbackDashboard(opts: { workspaceId: string }) {
  const [campaigns, inviteRows] = await Promise.all([
    listPitchFeedbackCampaigns({ workspaceId: opts.workspaceId }),
    db
      .select({
        invite: pitchFeedbackInvites,
        campaignName: pitchFeedbackCampaigns.name,
        contactName: contacts.name,
        contactOrganization: contacts.organization,
      })
      .from(pitchFeedbackInvites)
      .innerJoin(
        pitchFeedbackCampaigns,
        eq(pitchFeedbackCampaigns.id, pitchFeedbackInvites.campaignId),
      )
      .innerJoin(contacts, eq(contacts.id, pitchFeedbackInvites.contactId))
      .where(eq(pitchFeedbackInvites.workspaceId, opts.workspaceId))
      .orderBy(desc(pitchFeedbackInvites.updatedAt)),
  ]);

  const inviteIds = inviteRows.map((row) => row.invite.id);
  const [insights, responses] = inviteIds.length
    ? await Promise.all([
        db
          .select()
          .from(pitchFeedbackAiInsights)
          .where(inArray(pitchFeedbackAiInsights.inviteId, inviteIds))
          .orderBy(desc(pitchFeedbackAiInsights.createdAt)),
        db
          .select({
            inviteId: pitchFeedbackResponses.inviteId,
            id: pitchFeedbackResponses.id,
          })
          .from(pitchFeedbackResponses)
          .where(inArray(pitchFeedbackResponses.inviteId, inviteIds)),
      ])
    : [[], []];
  const latestInsightByInvite = new Map<string, PitchFeedbackInsight>();
  for (const insight of insights) {
    if (insight.inviteId && !latestInsightByInvite.has(insight.inviteId)) {
      latestInsightByInvite.set(insight.inviteId, insight);
    }
  }
  const responseCountByInvite = new Map<string, number>();
  for (const response of responses) {
    responseCountByInvite.set(
      response.inviteId,
      (responseCountByInvite.get(response.inviteId) ?? 0) + 1,
    );
  }

  return {
    campaigns,
    invites: inviteRows.map((row) => ({
      ...row.invite,
      campaignName: row.campaignName,
      contactName: row.contactName,
      contactOrganization: row.contactOrganization,
      latestInsight: latestInsightByInvite.get(row.invite.id) ?? null,
      responseCount: responseCountByInvite.get(row.invite.id) ?? 0,
    })),
  };
}

export async function listCampaignInviteProgress(opts: {
  workspaceId: string;
  campaignId: string;
}) {
  const rows = await db
    .select({
      invite: pitchFeedbackInvites,
      contactName: contacts.name,
      contactOrganization: contacts.organization,
    })
    .from(pitchFeedbackInvites)
    .innerJoin(contacts, eq(contacts.id, pitchFeedbackInvites.contactId))
    .where(
      and(
        eq(pitchFeedbackInvites.workspaceId, opts.workspaceId),
        eq(pitchFeedbackInvites.campaignId, opts.campaignId),
      ),
    )
    .orderBy(desc(pitchFeedbackInvites.updatedAt));

  return rows.map((row) => ({
    ...row.invite,
    contactName: row.contactName,
    contactOrganization: row.contactOrganization,
  }));
}
