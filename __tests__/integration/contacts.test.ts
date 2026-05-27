import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { listContacts, getContact } from "@/db/queries/contacts";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { contacts, contactChannels, contactTags, tags } = schema;

const baseInsert = {
  workspaceId: FAKE_WORKSPACE_ID,
  createdBy: FAKE_USER_ID,
};

describe("[integration] contacts queries", () => {
  it("creates and lists a contact with channels + tags", async () => {
    const [caneyTag] = await db.select().from(tags).where(eq(tags.name, "caney"));
    expect(caneyTag).toBeTruthy();

    const [c] = await db
      .insert(contacts)
      .values({
        ...baseInsert,
        name: "Marta López",
        type: "person",
        relationshipType: "lead",
        organization: "Posada La Rosa",
      })
      .returning();

    await db.insert(contactChannels).values([
      { contactId: c.id, kind: "email", value: "marta@example.com", isPrimary: true },
      { contactId: c.id, kind: "phone", value: "+584121234567", isPrimary: true },
    ]);
    await db.insert(contactTags).values({ contactId: c.id, tagId: caneyTag.id });

    const list = await listContacts({ workspaceId: FAKE_WORKSPACE_ID });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Marta López");
    expect(list[0].channels).toHaveLength(2);
    expect(list[0].tags.map((t) => t.name)).toContain("caney");
  });

  it("filters by tag name", async () => {
    const [vavTag] = await db.select().from(tags).where(eq(tags.name, "vav"));

    const [caney] = await db
      .insert(contacts)
      .values({ ...baseInsert, name: "Caney person" })
      .returning();
    const [vav] = await db
      .insert(contacts)
      .values({ ...baseInsert, name: "VAV person" })
      .returning();

    const [caneyTag] = await db.select().from(tags).where(eq(tags.name, "caney"));
    await db.insert(contactTags).values([
      { contactId: caney.id, tagId: caneyTag.id },
      { contactId: vav.id, tagId: vavTag.id },
    ]);

    const vavOnly = await listContacts({
      workspaceId: FAKE_WORKSPACE_ID,
      tagName: "vav",
    });
    expect(vavOnly).toHaveLength(1);
    expect(vavOnly[0].name).toBe("VAV person");
  });

  it("getContact returns null for the wrong workspace (row-level isolation)", async () => {
    // Build an isolated second workspace + owner.
    const otherUserId = "11111111-1111-1111-1111-111111111111";
    const otherWorkspaceId = "11111111-1111-1111-1111-1111111111aa";
    await db
      .insert(schema.users)
      .values({ id: otherUserId, email: "other@local", displayName: "Other" })
      .onConflictDoNothing();
    await db
      .insert(schema.workspaces)
      .values({
        id: otherWorkspaceId,
        name: "Other Workspace",
        createdBy: otherUserId,
      })
      .onConflictDoNothing();
    await db
      .insert(schema.workspaceMembers)
      .values({
        workspaceId: otherWorkspaceId,
        userId: otherUserId,
        role: "owner",
      })
      .onConflictDoNothing();

    const [c] = await db
      .insert(contacts)
      .values({ ...baseInsert, name: "Mine" })
      .returning();

    const got = await getContact({
      id: c.id,
      workspaceId: otherWorkspaceId,
    });
    expect(got).toBeNull();
  });

  it("excludes archived contacts from the default list", async () => {
    await db.insert(contacts).values([
      { ...baseInsert, name: "Active person", archived: false },
      { ...baseInsert, name: "Archived person", archived: true },
    ]);

    const active = await listContacts({ workspaceId: FAKE_WORKSPACE_ID });
    expect(active.map((c) => c.name)).toEqual(["Active person"]);

    const archived = await listContacts({
      workspaceId: FAKE_WORKSPACE_ID,
      archived: true,
    });
    expect(archived.map((c) => c.name)).toEqual(["Archived person"]);
  });
});
