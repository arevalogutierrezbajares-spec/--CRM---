import { asc } from "drizzle-orm";
import { db, schema } from "@/db";

const { users } = schema;

export async function listOtherUsers(currentUserId: string) {
  const all = await db.select().from(users).orderBy(asc(users.displayName));
  return all.filter((u) => u.id !== currentUserId);
}

export async function listAllUsers() {
  return db.select().from(users).orderBy(asc(users.displayName));
}
