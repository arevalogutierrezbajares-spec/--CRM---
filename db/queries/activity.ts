import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export type ActivityEntity =
  | "doc"
  | "file"
  | "link"
  | "note"
  | "project"
  | "contact"
  | "meeting"
  | "touch"
  | "milestone"
  | "action_item"
  | "initiative";

export type ActivityEvent = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  verb: string;
  entity: ActivityEntity;
  label: string;
  href: string | null;
  at: Date;
};

const PER_SOURCE = 20;

function snippet(s: string | null, n = 60): string {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t || "a note";
}

/**
 * Unified, newest-first activity across the workspace. Fans out one small,
 * workspace-scoped query per source table, normalizes each to a common shape,
 * then merges + sorts in memory. Doc/file/link activity comes from the audit
 * log (so edits + deletes are attributed); everything else from each entity's
 * create event.
 */
export async function listWorkspaceActivity(
  workspaceId: string,
  limit = 60,
): Promise<ActivityEvent[]> {
  const u = schema.users;

  const [audits, projects, contacts, meetings, touches, milestones, actionItems, initiatives] =
    await Promise.all([
      // Doc / file / link create·edit·delete — from the audit log.
      db
        .select({
          id: schema.projectLinkAudits.id,
          actorId: schema.projectLinkAudits.actorId,
          actorName: u.displayName,
          action: schema.projectLinkAudits.action,
          at: schema.projectLinkAudits.createdAt,
          projectId: schema.projectLinkAudits.projectId,
          linkId: schema.projectLinkAudits.linkId,
          kind: schema.projectLinks.kind,
          label: schema.projectLinks.label,
        })
        .from(schema.projectLinkAudits)
        .leftJoin(u, eq(u.id, schema.projectLinkAudits.actorId))
        .leftJoin(schema.projectLinks, eq(schema.projectLinks.id, schema.projectLinkAudits.linkId))
        .where(
          and(
            eq(schema.projectLinkAudits.workspaceId, workspaceId),
            inArray(schema.projectLinkAudits.action, ["create", "update", "delete"]),
          ),
        )
        .orderBy(desc(schema.projectLinkAudits.createdAt))
        .limit(PER_SOURCE),

      db
        .select({
          id: schema.projects.id,
          actorId: schema.projects.createdBy,
          actorName: u.displayName,
          label: schema.projects.title,
          at: schema.projects.createdAt,
        })
        .from(schema.projects)
        .leftJoin(u, eq(u.id, schema.projects.createdBy))
        .where(and(eq(schema.projects.workspaceId, workspaceId), isNotNull(schema.projects.createdBy)))
        .orderBy(desc(schema.projects.createdAt))
        .limit(PER_SOURCE),

      db
        .select({
          id: schema.contacts.id,
          actorId: schema.contacts.createdBy,
          actorName: u.displayName,
          label: schema.contacts.name,
          at: schema.contacts.createdAt,
        })
        .from(schema.contacts)
        .leftJoin(u, eq(u.id, schema.contacts.createdBy))
        .where(and(eq(schema.contacts.workspaceId, workspaceId), isNotNull(schema.contacts.createdBy)))
        .orderBy(desc(schema.contacts.createdAt))
        .limit(PER_SOURCE),

      db
        .select({
          id: schema.meetings.id,
          actorId: schema.meetings.createdBy,
          actorName: u.displayName,
          label: schema.meetings.title,
          at: schema.meetings.createdAt,
        })
        .from(schema.meetings)
        .leftJoin(u, eq(u.id, schema.meetings.createdBy))
        .where(and(eq(schema.meetings.workspaceId, workspaceId), isNotNull(schema.meetings.createdBy)))
        .orderBy(desc(schema.meetings.createdAt))
        .limit(PER_SOURCE),

      db
        .select({
          id: schema.touches.id,
          actorId: schema.touches.createdBy,
          actorName: u.displayName,
          body: schema.touches.body,
          projectId: schema.touches.projectId,
          contactId: schema.touches.contactId,
          at: schema.touches.createdAt,
        })
        .from(schema.touches)
        .leftJoin(u, eq(u.id, schema.touches.createdBy))
        .where(and(eq(schema.touches.workspaceId, workspaceId), isNotNull(schema.touches.createdBy)))
        .orderBy(desc(schema.touches.createdAt))
        .limit(PER_SOURCE),

      db
        .select({
          id: schema.milestones.id,
          actorId: schema.milestones.createdBy,
          actorName: u.displayName,
          label: schema.milestones.title,
          projectId: schema.milestones.projectId,
          at: schema.milestones.createdAt,
        })
        .from(schema.milestones)
        .leftJoin(u, eq(u.id, schema.milestones.createdBy))
        .where(and(eq(schema.milestones.workspaceId, workspaceId), isNotNull(schema.milestones.createdBy)))
        .orderBy(desc(schema.milestones.createdAt))
        .limit(PER_SOURCE),

      db
        .select({
          id: schema.actionItems.id,
          actorId: schema.actionItems.createdBy,
          actorName: u.displayName,
          label: schema.actionItems.title,
          at: schema.actionItems.createdAt,
        })
        .from(schema.actionItems)
        .leftJoin(u, eq(u.id, schema.actionItems.createdBy))
        .where(and(eq(schema.actionItems.workspaceId, workspaceId), isNotNull(schema.actionItems.createdBy)))
        .orderBy(desc(schema.actionItems.createdAt))
        .limit(PER_SOURCE),

      db
        .select({
          id: schema.initiatives.id,
          actorId: schema.initiatives.createdBy,
          actorName: u.displayName,
          label: schema.initiatives.title,
          at: schema.initiatives.createdAt,
        })
        .from(schema.initiatives)
        .leftJoin(u, eq(u.id, schema.initiatives.createdBy))
        .where(and(eq(schema.initiatives.workspaceId, workspaceId), isNotNull(schema.initiatives.createdBy)))
        .orderBy(desc(schema.initiatives.createdAt))
        .limit(PER_SOURCE),
    ]);

  const events: ActivityEvent[] = [];

  for (const a of audits) {
    const kind = (a.kind ?? "note") as ActivityEntity;
    const noun = kind === "doc" ? "doc" : kind === "file" ? "file" : kind === "link" ? "link" : "note";
    const verb =
      a.action === "create"
        ? kind === "file"
          ? "uploaded a file"
          : `created a ${noun}`
        : a.action === "delete"
          ? `removed a ${noun}`
          : `edited a ${noun}`;
    const href =
      a.action !== "delete" && a.projectId
        ? kind === "doc"
          ? `/projects/${a.projectId}/docs/${a.linkId}`
          : `/projects/${a.projectId}`
        : null;
    events.push({
      id: `audit:${a.id}`,
      actorId: a.actorId,
      actorName: a.actorName,
      verb,
      entity: kind,
      label: a.label ?? "an item",
      href,
      at: a.at,
    });
  }

  for (const p of projects)
    events.push({ id: `project:${p.id}`, actorId: p.actorId, actorName: p.actorName, verb: "created project", entity: "project", label: p.label, href: `/projects/${p.id}`, at: p.at });

  for (const c of contacts)
    events.push({ id: `contact:${c.id}`, actorId: c.actorId, actorName: c.actorName, verb: "added contact", entity: "contact", label: c.label, href: `/contacts/${c.id}`, at: c.at });

  for (const m of meetings)
    events.push({ id: `meeting:${m.id}`, actorId: m.actorId, actorName: m.actorName, verb: "scheduled meeting", entity: "meeting", label: m.label, href: `/meetings/${m.id}`, at: m.at });

  for (const t of touches)
    events.push({
      id: `touch:${t.id}`,
      actorId: t.actorId,
      actorName: t.actorName,
      verb: "logged a touch",
      entity: "touch",
      label: snippet(t.body),
      href: t.projectId ? `/projects/${t.projectId}` : t.contactId ? `/contacts/${t.contactId}` : null,
      at: t.at,
    });

  for (const m of milestones)
    events.push({ id: `milestone:${m.id}`, actorId: m.actorId, actorName: m.actorName, verb: "added milestone", entity: "milestone", label: m.label, href: m.projectId ? `/projects/${m.projectId}` : "/work", at: m.at });

  for (const a of actionItems)
    events.push({ id: `action:${a.id}`, actorId: a.actorId, actorName: a.actorName, verb: "added action item", entity: "action_item", label: a.label, href: "/action-items", at: a.at });

  for (const i of initiatives)
    events.push({ id: `initiative:${i.id}`, actorId: i.actorId, actorName: i.actorName, verb: "started initiative", entity: "initiative", label: i.label, href: `/initiatives/${i.id}`, at: i.at });

  return events
    .filter((e) => e.at instanceof Date)
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
