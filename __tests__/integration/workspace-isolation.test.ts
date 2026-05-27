import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "@/db";
import { listContacts, getContact } from "@/db/queries/contacts";
import { listProjects } from "@/db/queries/projects";
import { listTouchesForContact } from "@/db/queries/touches";
import { FAKE_USER_ID, FAKE_WORKSPACE_ID } from "./setup";

/**
 * Cross-workspace isolation: every owned table (contacts, projects, touches,
 * milestones) must NEVER leak rows from another workspace through the public
 * query helpers. RLS is the second wall; this test pins down the first wall
 * — that our application-layer WHERE clauses filter by workspace_id.
 */

const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_WS_ID = "22222222-2222-2222-2222-2222222222aa";

const ours = { workspaceId: FAKE_WORKSPACE_ID, createdBy: FAKE_USER_ID };
const theirs = { workspaceId: OTHER_WS_ID, createdBy: OTHER_USER_ID };

beforeAll(async () => {
  await db
    .insert(schema.users)
    .values({
      id: OTHER_USER_ID,
      email: "other-ws@local",
      displayName: "Other Founder",
    })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaces)
    .values({
      id: OTHER_WS_ID,
      name: "Other Workspace",
      createdBy: OTHER_USER_ID,
    })
    .onConflictDoNothing();
  await db
    .insert(schema.workspaceMembers)
    .values({
      workspaceId: OTHER_WS_ID,
      userId: OTHER_USER_ID,
      role: "owner",
    })
    .onConflictDoNothing();
});

describe("[integration] cross-workspace data isolation", () => {
  it("listContacts does not return rows from another workspace", async () => {
    await db
      .insert(schema.contacts)
      .values([
        { ...ours, name: "Our person" },
        { ...theirs, name: "Their person" },
      ]);
    const ourList = await listContacts({ workspaceId: FAKE_WORKSPACE_ID });
    expect(ourList.map((c) => c.name)).toEqual(["Our person"]);
    const theirList = await listContacts({ workspaceId: OTHER_WS_ID });
    expect(theirList.map((c) => c.name)).toEqual(["Their person"]);
  });

  it("getContact refuses a contact id from the wrong workspace", async () => {
    const [theirContact] = await db
      .insert(schema.contacts)
      .values({ ...theirs, name: "Theirs only" })
      .returning();
    const got = await getContact({
      id: theirContact.id,
      workspaceId: FAKE_WORKSPACE_ID,
    });
    expect(got).toBeNull();
  });

  it("listProjects does not leak projects across workspaces", async () => {
    await db.insert(schema.projects).values([
      { ...ours, title: "Our project" },
      { ...theirs, title: "Their project" },
    ]);
    const ourList = await listProjects({ workspaceId: FAKE_WORKSPACE_ID });
    expect(ourList.find((p) => p.title === "Their project")).toBeUndefined();
  });

  it("listTouchesForContact won't return touches when the contact is in another workspace", async () => {
    const [theirContact] = await db
      .insert(schema.contacts)
      .values({ ...theirs, name: "Theirs" })
      .returning();
    await db.insert(schema.touches).values({
      ...theirs,
      contactId: theirContact.id,
      channel: "manual",
      body: "Their note",
    });
    const got = await listTouchesForContact({
      contactId: theirContact.id,
      workspaceId: FAKE_WORKSPACE_ID,
    });
    expect(got).toEqual([]);
  });
});
