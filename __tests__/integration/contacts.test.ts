import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { listContacts, getContact } from "@/db/queries/contacts";
import { FAKE_USER_ID } from "./setup";

const { contacts, contactChannels, contactTags, tags } = schema;

describe("[integration] contacts queries", () => {
  it("creates and lists a contact with channels + tags", async () => {
    // Use a known venture tag from the seed.
    const [caneyTag] = await db.select().from(tags).where(eq(tags.name, "caney"));
    expect(caneyTag).toBeTruthy();

    const [c] = await db
      .insert(contacts)
      .values({
        name: "Marta López",
        type: "person",
        relationshipType: "lead",
        organization: "Posada La Rosa",
        ownerId: FAKE_USER_ID,
      })
      .returning();

    await db.insert(contactChannels).values([
      { contactId: c.id, kind: "email", value: "marta@example.com", isPrimary: true },
      { contactId: c.id, kind: "phone", value: "+584121234567", isPrimary: true },
    ]);
    await db.insert(contactTags).values({ contactId: c.id, tagId: caneyTag.id });

    const list = await listContacts({ ownerId: FAKE_USER_ID });
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Marta López");
    expect(list[0].channels).toHaveLength(2);
    expect(list[0].tags.map((t) => t.name)).toContain("caney");
  });

  it("filters by tag name", async () => {
    const [vavTag] = await db.select().from(tags).where(eq(tags.name, "vav"));

    const [caney] = await db
      .insert(contacts)
      .values({ name: "Caney person", ownerId: FAKE_USER_ID })
      .returning();
    const [vav] = await db
      .insert(contacts)
      .values({ name: "VAV person", ownerId: FAKE_USER_ID })
      .returning();

    const [caneyTag] = await db.select().from(tags).where(eq(tags.name, "caney"));
    await db.insert(contactTags).values([
      { contactId: caney.id, tagId: caneyTag.id },
      { contactId: vav.id, tagId: vavTag.id },
    ]);

    const vavOnly = await listContacts({ ownerId: FAKE_USER_ID, tagName: "vav" });
    expect(vavOnly).toHaveLength(1);
    expect(vavOnly[0].name).toBe("VAV person");
  });

  it("getContact returns null for the wrong owner (row-level isolation)", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ name: "Mine", ownerId: FAKE_USER_ID })
      .returning();

    const got = await getContact({
      id: c.id,
      ownerId: "11111111-1111-1111-1111-111111111111",
    });
    expect(got).toBeNull();
  });

  it("excludes archived contacts from the default list", async () => {
    await db.insert(contacts).values([
      { name: "Active person", ownerId: FAKE_USER_ID, archived: false },
      { name: "Archived person", ownerId: FAKE_USER_ID, archived: true },
    ]);

    const active = await listContacts({ ownerId: FAKE_USER_ID });
    expect(active.map((c) => c.name)).toEqual(["Active person"]);

    const archived = await listContacts({ ownerId: FAKE_USER_ID, archived: true });
    expect(archived.map((c) => c.name)).toEqual(["Archived person"]);
  });
});
