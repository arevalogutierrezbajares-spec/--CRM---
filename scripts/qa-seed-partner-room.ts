#!/usr/bin/env tsx
/**
 * QA-only: create a disposable, fully-furnished partner room to exercise the
 * partner-facing mobile flow end to end (PIN gate → seat claim → repository →
 * messages → next steps → alliance card). INSERT-only — never truncates.
 * Self-contained (no imports from db/queries — those pull in "server-only").
 *
 *   DATABASE_URL=... npx tsx scripts/qa-seed-partner-room.ts
 *
 * Tear down: DATABASE_URL=... npx tsx scripts/qa-teardown-partner-room.ts <roomId> <contactId>
 */
import { createHash, randomBytes } from "crypto";
import { asc, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";

const QA_TAG = "QA Crítica Móvil (BORRAR)";
const PIN = "1234";

const FOUNDER_EMAILS = [
  "tg.2000@icloud.com",
  "joearevalo21@gmail.com",
  "charlesbrewerleon@gmail.com",
];

async function main() {
  const [ws] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.name, "AGB"))
    .limit(1);
  if (!ws) throw new Error("No AGB workspace found");

  const allMembers = await db
    .select({
      userId: schema.workspaceMembers.userId,
      displayName: schema.users.displayName,
      email: schema.users.email,
    })
    .from(schema.workspaceMembers)
    .leftJoin(schema.users, eq(schema.users.id, schema.workspaceMembers.userId))
    .where(eq(schema.workspaceMembers.workspaceId, ws.id))
    .orderBy(asc(schema.users.displayName));
  const members = FOUNDER_EMAILS.map((e) => allMembers.find((m) => m.email === e)).filter(
    (m): m is NonNullable<typeof m> => Boolean(m),
  );
  if (members.length === 0) throw new Error("No founder members found");
  const actor = members[0].userId;
  console.log("workspace:", ws.id, ws.name ?? "");
  console.log("members:", members.map((m) => `${m.displayName} <${m.email}>`).join(" | "));

  const lobs = await db
    .select({ id: schema.linesOfBusiness.id, title: schema.linesOfBusiness.title, logoUrl: schema.linesOfBusiness.logoUrl })
    .from(schema.linesOfBusiness)
    .where(isNotNull(schema.linesOfBusiness.logoUrl));
  console.log("lobs with logos:", lobs.map((l) => `${l.title}=${l.logoUrl}`).join(" | "));

  const [contact] = await db
    .insert(schema.contacts)
    .values({
      workspaceId: ws.id,
      name: QA_TAG,
      type: "org",
      organization: "QA Partner Org",
      logoUrl: "/logos/crm.svg",
      createdBy: actor,
    })
    .returning();
  console.log("contact:", contact.id);

  const accessToken = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(accessToken).digest("hex");

  const wanted = lobs.filter((l) => /caney|vav|vamos/i.test(l.title ?? ""));
  const brandIds = (wanted.length ? wanted : lobs).slice(0, 2).map((l) => l.id);

  const now = new Date();
  const [room] = await db
    .insert(schema.partnerRooms)
    .values({
      workspaceId: ws.id,
      primaryContactId: contact.id,
      name: QA_TAG,
      partnerKind: "strategic",
      status: "active",
      welcomeMessage:
        "Bienvenidos a nuestra sala compartida. Aquí encuentran los documentos, próximos pasos y un canal directo con el equipo.",
      publicAccessTokenHash: tokenHash,
      publicAccessTokenCreatedAt: now,
      seatLimit: 5,
      brandLobIds: brandIds.length ? brandIds : null,
      heroVideoKey: "canaima",
      createdBy: actor,
      lastActivityAt: now,
    })
    .returning();
  console.log("room:", room.id);

  // PIN hash matches lib/partner-room-gate.server.ts hashPartnerRoomPasscode.
  const passcodeHash = createHash("sha256").update(`pa-pin:${room.id}:${PIN}`).digest("hex");
  await db.update(schema.partnerRooms).set({ passcodeHash }).where(eq(schema.partnerRooms.id, room.id));

  // Host team — every workspace member, founder titles where they match.
  for (let i = 0; i < Math.min(members.length, 3); i++) {
    await db
      .insert(schema.partnerRoomTeam)
      .values({
        workspaceId: ws.id,
        roomId: room.id,
        userId: members[i].userId,
        title: i === 0 ? "Co-founder · Product & Technology" : "Co-founder · Go-to-Market",
        sortOrder: i,
      })
      .onConflictDoNothing();
  }

  await db.insert(schema.partnerRoomMessages).values({
    workspaceId: ws.id,
    roomId: room.id,
    authorKind: "owner",
    authorUserId: actor,
    authorName: members[0].displayName ?? "El equipo",
    body: "¡Bienvenidos! Cualquier pregunta sobre la propuesta, escríbanla aquí y les respondemos el mismo día.",
  });

  await db.insert(schema.partnerRoomItems).values([
    {
      workspaceId: ws.id,
      roomId: room.id,
      kind: "link",
      title: "Propuesta de alianza (deck)",
      description: "Resumen de la propuesta y términos para revisar antes de la llamada.",
      category: "documentos",
      url: "https://example.com/deck",
      addedBy: actor,
      sortOrder: 0,
    },
    {
      workspaceId: ws.id,
      roomId: room.id,
      kind: "link",
      title: "Calendario de hitos Q3",
      description: "Fechas claves del piloto.",
      category: "informes",
      url: "https://example.com/q3",
      addedBy: actor,
      sortOrder: 1,
    },
  ]);

  await db.insert(schema.partnerNextSteps).values([
    { workspaceId: ws.id, roomId: room.id, text: "Revisar la propuesta de alianza", assignedTo: "partner", sortOrder: 0 },
    { workspaceId: ws.id, roomId: room.id, text: "Confirmar fecha de la llamada de kickoff", assignedTo: "partner", sortOrder: 1 },
  ]);

  console.log("");
  console.log("=== QA ROOM READY ===");
  console.log("roomId:", room.id);
  console.log("contactId:", contact.id);
  console.log("url: http://localhost:3000/access/" + accessToken);
  console.log("pin:", PIN);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
