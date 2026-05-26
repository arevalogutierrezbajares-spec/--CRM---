import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

const { contacts, contactChannels, contactTags, tags } = schema;

export type ContactRow = typeof contacts.$inferSelect;
export type ContactChannelRow = typeof contactChannels.$inferSelect;
export type TagRow = typeof tags.$inferSelect;

export type ContactListItem = ContactRow & {
  channels: ContactChannelRow[];
  tags: TagRow[];
};

export async function listContacts(opts: {
  ownerId: string;
  archived?: boolean;
  tagName?: string;
}): Promise<ContactListItem[]> {
  const archived = opts.archived ?? false;

  let rows: ContactRow[];
  if (opts.tagName) {
    const res = await db
      .select({ contact: contacts })
      .from(contacts)
      .innerJoin(contactTags, eq(contactTags.contactId, contacts.id))
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(
        and(
          eq(contacts.ownerId, opts.ownerId),
          eq(contacts.archived, archived),
          eq(tags.name, opts.tagName),
        ),
      )
      .orderBy(desc(contacts.updatedAt));
    rows = res.map((r) => r.contact);
  } else {
    rows = await db
      .select()
      .from(contacts)
      .where(
        and(eq(contacts.ownerId, opts.ownerId), eq(contacts.archived, archived)),
      )
      .orderBy(desc(contacts.updatedAt));
  }

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [channels, ctags] = await Promise.all([
    db.select().from(contactChannels).where(inArray(contactChannels.contactId, ids)),
    db
      .select({
        contactId: contactTags.contactId,
        tag: tags,
      })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(inArray(contactTags.contactId, ids)),
  ]);

  return rows.map((row) => ({
    ...row,
    channels: channels.filter((c) => c.contactId === row.id),
    tags: ctags.filter((t) => t.contactId === row.id).map((t) => t.tag),
  }));
}

export async function getContact(opts: { id: string; ownerId: string }) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, opts.id), eq(contacts.ownerId, opts.ownerId)))
    .limit(1);
  if (!row) return null;
  const [channels, ctags] = await Promise.all([
    db
      .select()
      .from(contactChannels)
      .where(eq(contactChannels.contactId, row.id)),
    db
      .select({ tag: tags })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(eq(contactTags.contactId, row.id)),
  ]);
  return { ...row, channels, tags: ctags.map((t) => t.tag) };
}
