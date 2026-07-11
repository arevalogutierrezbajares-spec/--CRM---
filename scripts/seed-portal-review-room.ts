#!/usr/bin/env tsx
/**
 * Throwaway demo room for local portal review (2026-07-11). Creates a
 * clearly-labeled demo contact + partner room with PIN 1783, seat limit 5,
 * hero video, next steps and messages, then prints the localhost guest URL.
 *
 *   npx tsx scripts/seed-portal-review-room.ts
 *
 * Idempotent: stable contact id + createPartnerRoomForContact reuses an
 * existing non-revoked room for the same contact/kind. Safe to re-run; the
 * room/contact can be deleted afterwards (name-prefixed "[DEMO]").
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import {
  createPartnerRoomForContact,
  setPartnerRoomPasscode,
  setPartnerRoomSeatLimit,
  regeneratePartnerRoomAccessToken,
} from "@/db/queries/partner-access";

const WS = "11111111-2222-3333-4444-aaaaaaaaaaa1"; // AGB workspace (verified live)
const TOMAS_ID = "a408e392-1337-4cb3-acc5-f8c1881f1522"; // Tomas Gutierrez

function stableId(seed: string): string {
  const h = createHash("sha256").update(`portal-review-room:${seed}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const CONTACT_ID = stableId("contact");

async function main() {
  await db
    .insert(schema.contacts)
    .values({
      id: CONTACT_ID,
      workspaceId: WS,
      name: "[DEMO] Inversiones Orinoco",
      organization: "Inversiones Orinoco C.A.",
      type: "org",
      relationshipType: "prospect",
      createdBy: TOMAS_ID,
    })
    .onConflictDoNothing();

  const created = await createPartnerRoomForContact({
    workspaceId: WS,
    actorId: TOMAS_ID,
    contactId: CONTACT_ID,
    partnerKind: "client",
    name: "[DEMO] Sala de Revisión del Portal",
  });
  if (!created.ok) throw new Error(created.error);
  const roomId = created.room.id;

  await db
    .update(schema.partnerRooms)
    .set({
      welcomeMessage:
        "Aquí encontrarás la propuesta, los próximos pasos y una línea directa con nosotros. Cualquier duda, escríbenos abajo.",
      heroVideoKey: "canaima",
      updatedAt: new Date(),
    })
    .where(eq(schema.partnerRooms.id, roomId));

  const pin = await setPartnerRoomPasscode({
    workspaceId: WS,
    actorId: TOMAS_ID,
    roomId,
    passcode: "1783",
  });
  if (!pin.ok) throw new Error(pin.error);

  await setPartnerRoomSeatLimit({ workspaceId: WS, roomId, seatLimit: 5 });

  // Content so the room isn't empty (idempotent via stable ids).
  await db
    .insert(schema.partnerNextSteps)
    .values([
      {
        id: stableId("step-1"),
        workspaceId: WS,
        roomId,
        text: "Revisar la propuesta comercial y dejar comentarios",
        assignedTo: "partner",
        dueAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        sortOrder: 0,
        createdByUser: TOMAS_ID,
      },
      {
        id: stableId("step-2"),
        workspaceId: WS,
        roomId,
        text: "Agendar llamada de seguimiento esta semana",
        assignedTo: "partner",
        sortOrder: 1,
        createdByUser: TOMAS_ID,
      },
      {
        id: stableId("step-3"),
        workspaceId: WS,
        roomId,
        text: "Enviar borrador del acuerdo actualizado",
        assignedTo: "owner",
        completedAt: new Date(),
        completedBy: "owner",
        sortOrder: 2,
        createdByUser: TOMAS_ID,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(schema.partnerRoomMessages)
    .values([
      {
        id: stableId("msg-1"),
        workspaceId: WS,
        roomId,
        authorKind: "owner",
        authorUserId: TOMAS_ID,
        authorName: "Tomás Gutiérrez",
        body: "¡Bienvenidos a la sala! Subimos la propuesta actualizada — cualquier pregunta la respondemos aquí mismo.",
      },
    ])
    .onConflictDoNothing();

  // Mint (or re-mint) the guest link so we always have a printable token.
  const link = await regeneratePartnerRoomAccessToken({
    workspaceId: WS,
    actorId: TOMAS_ID,
    roomId,
  });
  if (!link.ok) throw new Error(link.error);

  console.log("Room id:   ", roomId);
  console.log("PIN:        1783");
  console.log("Local URL:  http://localhost:3000/access/" + link.accessToken);
}

main().then(() => process.exit(0));
