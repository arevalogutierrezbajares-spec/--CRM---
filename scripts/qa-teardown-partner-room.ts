#!/usr/bin/env tsx
/**
 * Tear down a QA room created by qa-seed-partner-room.ts. Deletes the room
 * (FK cascades remove team/messages/items/steps/members/uploads/events), any
 * uploaded storage objects, and the QA contact. Refuses to touch contacts not
 * named with the QA tag.
 *
 *   DATABASE_URL=... npx tsx scripts/qa-teardown-partner-room.ts <roomId> <contactId>
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

const QA_TAG = "QA Crítica Móvil (BORRAR)";

async function main() {
  const [roomId, contactId] = process.argv.slice(2);
  if (!roomId || !contactId) throw new Error("usage: qa-teardown-partner-room.ts <roomId> <contactId>");

  const [contact] = await db
    .select({ id: schema.contacts.id, name: schema.contacts.name })
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);
  if (!contact) throw new Error("contact not found");
  if (contact.name !== QA_TAG) throw new Error(`refusing: contact is "${contact.name}", not the QA tag`);

  // Storage objects from partner uploads (rows cascade with the room).
  const uploads = await db
    .select({ storagePath: schema.partnerUploads.storagePath })
    .from(schema.partnerUploads)
    .where(eq(schema.partnerUploads.roomId, roomId));
  const paths = uploads.map((u) => u.storagePath).filter((p): p is string => Boolean(p));
  if (paths.length) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const res = await fetch(`${url}/storage/v1/object/agb-project-files`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
      console.log("storage cleanup:", res.status, paths.join(", "));
    } else {
      console.log("storage cleanup SKIPPED (missing env):", paths.join(", "));
    }
  }

  await db.delete(schema.partnerRooms).where(eq(schema.partnerRooms.id, roomId));
  await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
  console.log("deleted room", roomId, "and contact", contactId);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
