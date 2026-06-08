#!/usr/bin/env tsx
/**
 * Realistic demo data on top of the base seed (templates + tags). Use to
 * snapshot the UI with non-empty pages.
 *
 *   pnpm test:db       # base
 *   DATABASE_URL=... tsx scripts/seed-demo.ts
 */
import "dotenv/config";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { instantiateMilestonesFromTemplate } from "@/db/queries/milestones";

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";
const FAKE_WORKSPACE_ID = "00000000-0000-0000-0000-0000000000aa";

const {
  users,
  workspaces,
  workspaceMembers,
  contacts,
  contactChannels,
  contactTags,
  tags,
  projects,
  pipelineStages,
  projectContacts,
  milestones,
  touches,
  meetings,
  meetingAttendees,
  reminders,
} = schema;

const base = { workspaceId: FAKE_WORKSPACE_ID, createdBy: FAKE_USER_ID };

async function main() {
  await db.execute(/* sql */ `
    truncate table
      wa_activity,
      wa_conversations,
      nudges,
      reminders,
      touches,
      meeting_attendees,
      meetings,
      milestones,
      project_contacts,
      projects,
      contact_tags,
      contact_channels,
      contacts
    cascade
  `);

  // Owner row + workspace.
  await db
    .insert(users)
    .values({
      id: FAKE_USER_ID,
      email: "dev@local",
      displayName: "Dev Founder",
      timezone: "America/New_York",
    })
    .onConflictDoNothing();
  await db
    .insert(workspaces)
    .values({
      id: FAKE_WORKSPACE_ID,
      name: "Demo Workspace",
      createdBy: FAKE_USER_ID,
    })
    .onConflictDoNothing();
  await db
    .insert(workspaceMembers)
    .values({
      workspaceId: FAKE_WORKSPACE_ID,
      userId: FAKE_USER_ID,
      role: "owner",
    })
    .onConflictDoNothing();
  await db
    .update(users)
    .set({ currentWorkspaceId: FAKE_WORKSPACE_ID })
    .where(eq(users.id, FAKE_USER_ID));

  const ventureTags = await db.select().from(tags);
  const caneyTag = ventureTags.find((t) => t.name === "caney")!;
  const vavTag = ventureTags.find((t) => t.name === "vav")!;
  const friendTag = ventureTags.find((t) => t.name === "friend")!;

  // ── Contacts ─────────────────────────────────────────────────────────────
  const [marta] = await db
    .insert(contacts)
    .values({
      ...base,
      name: "Marta López",
      type: "person",
      relationshipType: "lead",
      organization: "Posada La Rosa",
      introChainFromText: "Met at IDB dinner via Carlos",
      lastTouchAt: new Date(Date.now() - 3 * 86400000),
    })
    .returning();
  await db.insert(contactChannels).values([
    {
      contactId: marta.id,
      kind: "email",
      value: "marta@posadalarosa.com",
      isPrimary: true,
    },
    { contactId: marta.id, kind: "whatsapp", value: "+584125551234" },
  ]);
  await db.insert(contactTags).values({ contactId: marta.id, tagId: caneyTag.id });

  const [carlos] = await db
    .insert(contacts)
    .values({
      ...base,
      name: "Carlos Pérez",
      type: "person",
      relationshipType: "friend",
      organization: "IDB",
      lastTouchAt: new Date(Date.now() - 70 * 86400000),
    })
    .returning();
  await db.insert(contactChannels).values({
    contactId: carlos.id,
    kind: "email",
    value: "carlos@idb.org",
    isPrimary: true,
  });
  await db.insert(contactTags).values([
    { contactId: carlos.id, tagId: friendTag.id },
    { contactId: carlos.id, tagId: vavTag.id },
  ]);

  const [diego] = await db
    .insert(contacts)
    .values({
      ...base,
      name: "Diego Méndez",
      type: "person",
      relationshipType: "partner",
      organization: "Creatives MX",
      introChainFromContactId: carlos.id,
      lastTouchAt: new Date(Date.now() - 14 * 86400000),
    })
    .returning();
  await db.insert(contactChannels).values({
    contactId: diego.id,
    kind: "email",
    value: "diego@creativesmx.com",
    isPrimary: true,
  });
  await db.insert(contactTags).values({ contactId: diego.id, tagId: vavTag.id });

  await db.insert(contacts).values({
    ...base,
    name: "Old Vendor",
    relationshipType: "prospect",
    archived: true,
  });

  // ── Project: Marta — Caney onboarding ───────────────────────────────────
  const caneyStages = await db
    .select()
    .from(pipelineStages)
    .where(eq(pipelineStages.templateId, "caney-posada-onboarding"))
    .orderBy(asc(pipelineStages.order));
  const [martaProject] = await db
    .insert(projects)
    .values({
      ...base,
      title: "Marta — Caney onboarding",
      templateId: "caney-posada-onboarding",
      currentStageId: caneyStages[2].id,
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    })
    .returning();
  await db
    .insert(projectContacts)
    .values({ projectId: martaProject.id, contactId: marta.id, role: "primary" });
  const ms = await instantiateMilestonesFromTemplate({
    projectId: martaProject.id,
    templateId: "caney-posada-onboarding",
    workspaceId: FAKE_WORKSPACE_ID,
    createdBy: FAKE_USER_ID,
  });
  for (const m of ms.slice(0, 2)) {
    await db
      .update(milestones)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(milestones.id, m.id));
  }
  await db
    .update(milestones)
    .set({
      dueDate: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10),
    })
    .where(eq(milestones.id, ms[2].id));

  // ── Project: blocked / waiting ──────────────────────────────────────────
  const [vavProject] = await db
    .insert(projects)
    .values({
      ...base,
      title: "VAV Q3 creator pipeline",
      templateId: "vav-creator-campaign",
      status: "waiting",
      waitingOn: "Diego's signed deliverables agreement",
      expectedUnblockDate: new Date(Date.now() - 5 * 86400000)
        .toISOString()
        .slice(0, 10),
    })
    .returning();
  await db
    .insert(projectContacts)
    .values({ projectId: vavProject.id, contactId: diego.id, role: "primary" });

  // ── Touches ─────────────────────────────────────────────────────────────
  const now = Date.now();
  const martaTouchData = [
    { days: 3, channel: "meeting" as const, body: "Demo of CaneyCloud booking flow at her posada" },
    { days: 5, channel: "whatsapp" as const, body: "Confirmed she wants to do a pilot in October" },
    { days: 12, channel: "email" as const, body: "Sent the proposal PDF + pricing tier comparison" },
    { days: 20, channel: "manual" as const, body: "Carlos intro: she's the most receptive of the 3 posada owners" },
  ];
  for (const t of martaTouchData) {
    await db.insert(touches).values({
      ...base,
      contactId: marta.id,
      projectId: martaProject.id,
      channel: t.channel,
      body: t.body,
      createdAt: new Date(now - t.days * 86400000),
    });
  }
  await db.insert(touches).values([
    {
      ...base,
      contactId: diego.id,
      projectId: vavProject.id,
      channel: "email",
      body: "Followed up on the deliverables agreement — still waiting",
      createdAt: new Date(now - 8 * 86400000),
    },
    {
      ...base,
      contactId: diego.id,
      channel: "call",
      body: "Caught up about Q4 plans, he's interested in scaling the partnership",
      createdAt: new Date(now - 14 * 86400000),
    },
  ]);

  // ── Meeting with action items ───────────────────────────────────────────
  const [meeting] = await db
    .insert(meetings)
    .values({
      ...base,
      title: "Marta — onboarding kickoff",
      scheduledAt: new Date(now - 3 * 86400000),
      type: "one_on_one",
      location: "Caracas · Café Arábica",
      linkedProjectId: martaProject.id,
      agenda:
        "Walk through the CaneyCloud booking flow + agree on rollout timeline",
      minutes: [
        "Marta confirmed October pilot start.",
        "She wants WhatsApp booking on day 1.",
        "Pricing she's comfortable with: $99/mo for the pilot.",
        "",
        "[ ] Send WhatsApp integration spec by Friday",
        "[ ] Confirm Stripe Connect setup with her bank",
        "[ ] Draft pilot agreement (60 days, $99/mo)",
      ].join("\n"),
    })
    .returning();
  await db
    .insert(meetingAttendees)
    .values({ meetingId: meeting.id, contactId: marta.id });

  // ── Reminders ───────────────────────────────────────────────────────────
  await db.insert(reminders).values([
    {
      workspaceId: FAKE_WORKSPACE_ID,
      forUserId: FAKE_USER_ID,
      createdBy: FAKE_USER_ID,
      subject: "Send Marta the WhatsApp integration spec",
      dueAt: new Date(now + 2 * 86400000),
      recur: "once",
      sourceContactId: marta.id,
      sourceProjectId: martaProject.id,
    },
    {
      workspaceId: FAKE_WORKSPACE_ID,
      forUserId: FAKE_USER_ID,
      createdBy: FAKE_USER_ID,
      subject: "Weekly VAV creator pipeline review",
      dueAt: new Date(now + 7 * 86400000),
      recur: "weekly",
      recurDay: 1,
      recurTime: "08:00:00",
    },
  ]);

  console.log("✓ Demo data seeded");
  console.log("  - 4 contacts (1 archived)");
  console.log("  - 2 projects (1 active w/ 12 milestones, 1 waiting)");
  console.log("  - 6 touches, 1 meeting with action items, 2 reminders");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
