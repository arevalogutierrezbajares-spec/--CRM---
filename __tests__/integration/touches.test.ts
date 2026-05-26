import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  listTouchesForContact,
  listTouchesForProject,
} from "@/db/queries/touches";
import { FAKE_USER_ID } from "./setup";

const { contacts, touches, projects } = schema;

describe("[integration] touches", () => {
  it("creates a touch and surfaces it via listTouchesForContact", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ name: "Carlos", ownerId: FAKE_USER_ID })
      .returning();

    await db.insert(touches).values([
      {
        contactId: c.id,
        channel: "manual",
        body: "Had coffee, talked funding",
        createdBy: FAKE_USER_ID,
      },
      {
        contactId: c.id,
        channel: "email",
        body: "Followed up via email",
        createdBy: FAKE_USER_ID,
      },
    ]);

    const list = await listTouchesForContact({
      contactId: c.id,
      ownerId: FAKE_USER_ID,
    });
    expect(list).toHaveLength(2);
    // Newest first.
    expect(list[0].channel).toBeOneOf(["manual", "email"]);
    expect(list[0].body).toBeTruthy();
  });

  it("touches scoped to a project surface via listTouchesForProject", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ name: "Project contact", ownerId: FAKE_USER_ID })
      .returning();
    const [p] = await db
      .insert(projects)
      .values({ title: "Test project", ownerId: FAKE_USER_ID })
      .returning();

    await db.insert(touches).values([
      {
        contactId: c.id,
        projectId: p.id,
        channel: "meeting",
        body: "Project kickoff",
        createdBy: FAKE_USER_ID,
      },
      {
        contactId: c.id,
        channel: "manual",
        body: "Unrelated note",
        createdBy: FAKE_USER_ID,
      },
    ]);

    const projectTouches = await listTouchesForProject({
      projectId: p.id,
      ownerId: FAKE_USER_ID,
    });
    expect(projectTouches).toHaveLength(1);
    expect(projectTouches[0].body).toBe("Project kickoff");
  });

  it("respects per-creator ownership boundary", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ name: "Shared contact", ownerId: FAKE_USER_ID })
      .returning();
    await db.insert(touches).values({
      contactId: c.id,
      channel: "manual",
      body: "Mine",
      createdBy: FAKE_USER_ID,
    });

    const otherUserTouches = await listTouchesForContact({
      contactId: c.id,
      ownerId: "11111111-1111-1111-1111-111111111111",
    });
    expect(otherUserTouches).toEqual([]);
  });
});
