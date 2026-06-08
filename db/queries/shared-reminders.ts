import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const { sharedReminders, sharedReminderTags, sharedReminderContacts, tags, contacts, users } =
  schema;

export type SharedReminderRow = typeof sharedReminders.$inferSelect;
export type ReminderTagRef = { id: string; name: string; color: string | null };
export type ReminderContactRef = { id: string; name: string };

export type SharedReminderItem = SharedReminderRow & {
  authorName: string | null;
  tags: ReminderTagRef[];
  contacts: ReminderContactRef[];
};

/** Compare two reminders for board order: pinned first, open before done,
 * soonest due date first (no due date sinks), newest first as a tiebreak. */
function compareReminders(a: SharedReminderRow, b: SharedReminderRow): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const aDone = a.doneAt ? 1 : 0;
  const bDone = b.doneAt ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  const aDue = a.dueAt ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

/** Every reminder on the workspace bulletin, with author, tags and people. */
export async function listSharedReminders(
  workspaceId: string,
): Promise<SharedReminderItem[]> {
  const rows = await db
    .select({ r: sharedReminders, authorName: users.displayName })
    .from(sharedReminders)
    .leftJoin(users, eq(users.id, sharedReminders.createdBy))
    .where(eq(sharedReminders.workspaceId, workspaceId))
    .orderBy(desc(sharedReminders.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((x) => x.r.id);
  const [tagRows, contactRows] = await Promise.all([
    db
      .select({
        reminderId: sharedReminderTags.reminderId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
      })
      .from(sharedReminderTags)
      .innerJoin(tags, eq(tags.id, sharedReminderTags.tagId))
      .where(inArray(sharedReminderTags.reminderId, ids)),
    db
      .select({
        reminderId: sharedReminderContacts.reminderId,
        id: contacts.id,
        name: contacts.name,
      })
      .from(sharedReminderContacts)
      .innerJoin(contacts, eq(contacts.id, sharedReminderContacts.contactId))
      .where(inArray(sharedReminderContacts.reminderId, ids)),
  ]);

  return rows
    .map(({ r, authorName }) => ({
      ...r,
      authorName,
      tags: tagRows
        .filter((t) => t.reminderId === r.id)
        .map(({ id, name, color }) => ({ id, name, color })),
      contacts: contactRows
        .filter((c) => c.reminderId === r.id)
        .map(({ id, name }) => ({ id, name })),
    }))
    .sort(compareReminders);
}
