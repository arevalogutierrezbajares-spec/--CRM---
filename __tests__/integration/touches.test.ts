import { describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import {
  listTouchesForContact,
  listTouchesForProject,
} from "@/db/queries/touches";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

const { contacts, touches, projects } = schema;

const base = { workspaceId: FAKE_WORKSPACE_ID, createdBy: FAKE_USER_ID };

describe("[integration] touches", () => {
  it("creates a touch and surfaces it via listTouchesForContact", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ ...base, name: "Carlos" })
      .returning();

    await db.insert(touches).values([
      { ...base, contactId: c.id, channel: "manual", body: "Had coffee, talked funding" },
      { ...base, contactId: c.id, channel: "email", body: "Followed up via email" },
    ]);

    const list = await listTouchesForContact({
      contactId: c.id,
      workspaceId: FAKE_WORKSPACE_ID,
    });
    expect(list).toHaveLength(2);
    expect(list[0].channel).toBeOneOf(["manual", "email"]);
    expect(list[0].body).toBeTruthy();
  });

  it("touches scoped to a project surface via listTouchesForProject", async () => {
    const [c] = await db
      .insert(contacts)
      .values({ ...base, name: "Project contact" })
      .returning();
    const [p] = await db
      .insert(projects)
      .values({ ...base, title: "Test project" })
      .returning();

    await db.insert(touches).values([
      {
        ...base,
        contactId: c.id,
        projectId: p.id,
        channel: "meeting",
        body: "Project kickoff",
      },
      { ...base, contactId: c.id, channel: "manual", body: "Unrelated note" },
    ]);

    const projectTouches = await listTouchesForProject({
      projectId: p.id,
      workspaceId: FAKE_WORKSPACE_ID,
    });
    expect(projectTouches).toHaveLength(1);
    expect(projectTouches[0].body).toBe("Project kickoff");
  });

  it("respects workspace ownership boundary", async () => {
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
      .values({ ...base, name: "Shared contact" })
      .returning();
    await db.insert(touches).values({
      ...base,
      contactId: c.id,
      channel: "manual",
      body: "Mine",
    });

    const otherWorkspaceTouches = await listTouchesForContact({
      contactId: c.id,
      workspaceId: otherWorkspaceId,
    });
    expect(otherWorkspaceTouches).toEqual([]);
  });
});
