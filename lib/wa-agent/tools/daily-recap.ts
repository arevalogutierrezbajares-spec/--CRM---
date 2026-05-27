import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ToolEntry } from "./_types";

const {
  contacts,
  contactTags,
  tags,
  touches,
  meetings,
  reminders,
  users,
} = schema;

export const dailyRecap: ToolEntry = {
  definition: {
    name: "daily_recap",
    description:
      "Summarize what the WORKSPACE TEAM has shipped in the time window: contacts " +
      "created, meetings organized, touches logged, reminders filed — attributed per " +
      "team member (the texter sees 'you' for their own work and the partner's name " +
      "for theirs). This is a single shared CRM; the recap is collective by default. " +
      "Highlights: new 'connector' contacts (high-value BD nodes), dual-source priority " +
      "signals (same contact reached via 2+ intro chains). Use when the user asks " +
      "for a recap, 'what did we do today', 'recap me', 'highlight wins', or any " +
      "end-of-day/end-of-week reflection. " +
      "Set `whose='self'` ONLY if the user explicitly asks for just their own activity.",
    input_schema: {
      type: "object",
      properties: {
        scope: {
          type: "string",
          enum: ["today", "yesterday", "week"],
          description:
            "Time window. Defaults to 'today' (since UTC midnight of the current calendar day).",
        },
        whose: {
          type: "string",
          enum: ["team", "self"],
          description:
            "Scope of activity. 'team' (default) = the whole workspace; 'self' = only " +
            "the texter's own created_by rows. Default to 'team' unless the user " +
            "specifically says 'me' / 'mine' / 'just my activity'.",
        },
      },
    },
  },
  async execute(input, ctx) {
    const scope = (input.scope as "today" | "yesterday" | "week") ?? "today";
    const whose = (input.whose as "team" | "self") ?? "team";
    const now = ctx.now;
    let start: Date;
    let end: Date;
    if (scope === "yesterday") {
      const startOfToday = new Date(now);
      startOfToday.setUTCHours(0, 0, 0, 0);
      start = new Date(startOfToday.getTime() - 86400000);
      end = startOfToday;
    } else if (scope === "week") {
      start = new Date(now.getTime() - 7 * 86400000);
      end = now;
    } else {
      start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      end = now;
    }

    const createdByFilter =
      whose === "self" ? eq(contacts.createdBy, ctx.userId) : undefined;

    const newContacts = await db
      .select({
        id: contacts.id,
        name: contacts.name,
        type: contacts.type,
        organization: contacts.organization,
        relationship: contacts.relationshipType,
        intro: contacts.introChainFromText,
        createdAt: contacts.createdAt,
        createdBy: contacts.createdBy,
        authorName: users.displayName,
      })
      .from(contacts)
      .innerJoin(users, eq(users.id, contacts.createdBy))
      .where(
        and(
          eq(contacts.workspaceId, ctx.workspaceId),
          gte(contacts.createdAt, start),
          lt(contacts.createdAt, end),
          createdByFilter,
        ),
      )
      .orderBy(asc(contacts.createdAt));

    const tagByContact: Record<string, string[]> = {};
    if (newContacts.length > 0) {
      const ids = newContacts.map((c) => c.id);
      const tagRows = await db
        .select({
          contactId: contactTags.contactId,
          name: tags.name,
        })
        .from(contactTags)
        .innerJoin(tags, eq(tags.id, contactTags.tagId))
        .where(inArray(contactTags.contactId, ids));
      for (const r of tagRows) {
        if (!tagByContact[r.contactId]) tagByContact[r.contactId] = [];
        tagByContact[r.contactId].push(r.name);
      }
    }

    const contactsWithMeta = newContacts.map((c) => ({
      ...c,
      tags: tagByContact[c.id] ?? [],
      byYou: c.createdBy === ctx.userId,
    }));

    const byMember: Record<
      string,
      {
        name: string;
        isYou: boolean;
        contacts: number;
        touches: number;
        meetings: number;
      }
    > = {};
    for (const c of contactsWithMeta) {
      if (!byMember[c.createdBy]) {
        byMember[c.createdBy] = {
          name: c.authorName,
          isYou: c.createdBy === ctx.userId,
          contacts: 0,
          touches: 0,
          meetings: 0,
        };
      }
      byMember[c.createdBy].contacts++;
    }

    const connectors = contactsWithMeta.filter((c) =>
      c.tags.includes("connector"),
    );
    const dualSourced = contactsWithMeta.filter(
      (c) => c.tags.filter((t) => t.startsWith("via-")).length >= 2,
    );

    const newMeetings = await db
      .select({
        id: meetings.id,
        title: meetings.title,
        scheduledAt: meetings.scheduledAt,
        createdBy: meetings.createdBy,
        authorName: users.displayName,
      })
      .from(meetings)
      .innerJoin(users, eq(users.id, meetings.createdBy))
      .where(
        and(
          eq(meetings.workspaceId, ctx.workspaceId),
          gte(meetings.createdAt, start),
          lt(meetings.createdAt, end),
          whose === "self" ? eq(meetings.createdBy, ctx.userId) : undefined,
        ),
      )
      .orderBy(asc(meetings.scheduledAt));
    for (const m of newMeetings) {
      if (!byMember[m.createdBy]) {
        byMember[m.createdBy] = {
          name: m.authorName,
          isYou: m.createdBy === ctx.userId,
          contacts: 0,
          touches: 0,
          meetings: 0,
        };
      }
      byMember[m.createdBy].meetings++;
    }

    const newTouches = await db
      .select({
        id: touches.id,
        contactId: touches.contactId,
        channel: touches.channel,
        body: touches.body,
        createdAt: touches.createdAt,
        createdBy: touches.createdBy,
        authorName: users.displayName,
      })
      .from(touches)
      .innerJoin(users, eq(users.id, touches.createdBy))
      .where(
        and(
          eq(touches.workspaceId, ctx.workspaceId),
          gte(touches.createdAt, start),
          lt(touches.createdAt, end),
          whose === "self" ? eq(touches.createdBy, ctx.userId) : undefined,
        ),
      )
      .orderBy(asc(touches.createdAt))
      .limit(30);
    for (const t of newTouches) {
      if (!byMember[t.createdBy]) {
        byMember[t.createdBy] = {
          name: t.authorName,
          isYou: t.createdBy === ctx.userId,
          contacts: 0,
          touches: 0,
          meetings: 0,
        };
      }
      byMember[t.createdBy].touches++;
    }

    const remindersFiled = await db
      .select({
        id: reminders.id,
        subject: reminders.subject,
        dueAt: reminders.dueAt,
        forUserId: reminders.forUserId,
        createdBy: reminders.createdBy,
        authorName: users.displayName,
      })
      .from(reminders)
      .innerJoin(users, eq(users.id, reminders.createdBy))
      .where(
        and(
          eq(reminders.workspaceId, ctx.workspaceId),
          gte(reminders.createdAt, start),
          lt(reminders.createdAt, end),
          whose === "self" ? eq(reminders.createdBy, ctx.userId) : undefined,
        ),
      );

    return {
      ok: true,
      data: {
        scope,
        whose,
        window: {
          start: start.toISOString(),
          end: end.toISOString(),
          timezone: ctx.ownerTimezone,
        },
        totals: {
          contacts: contactsWithMeta.length,
          meetings: newMeetings.length,
          touches: newTouches.length,
          remindersFiled: remindersFiled.length,
        },
        by_member: Object.values(byMember),
        contacts: contactsWithMeta.map((c) => ({
          name: c.name,
          type: c.type,
          organization: c.organization,
          relationship: c.relationship,
          tags: c.tags,
          by: { name: c.authorName, isYou: c.byYou },
          intro_excerpt: c.intro?.slice(0, 200) ?? null,
        })),
        highlights: {
          connectors: connectors.map((c) => ({
            name: c.name,
            organization: c.organization,
            by: { name: c.authorName, isYou: c.byYou },
            intro_excerpt: c.intro?.slice(0, 200) ?? null,
          })),
          dual_sourced_priority: dualSourced.map((c) => ({
            name: c.name,
            organization: c.organization,
            via_tags: c.tags.filter((t) => t.startsWith("via-")),
            by: { name: c.authorName, isYou: c.byYou },
            intro_excerpt: c.intro?.slice(0, 200) ?? null,
          })),
        },
        meetings: newMeetings.map((m) => ({
          title: m.title,
          scheduledAt: m.scheduledAt,
          by: { name: m.authorName, isYou: m.createdBy === ctx.userId },
        })),
        reminders_filed: remindersFiled.map((r) => ({
          subject: r.subject.slice(0, 140),
          dueAt: r.dueAt,
          by: { name: r.authorName, isYou: r.createdBy === ctx.userId },
          forSelf: r.forUserId === ctx.userId,
        })),
      },
    };
  },
};
