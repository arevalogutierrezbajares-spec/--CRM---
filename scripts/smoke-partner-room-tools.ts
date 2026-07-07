/**
 * Read-only smoke test for the partner-room MCP tools: resolves a real room
 * and runs partner_room_overview + the no-mutation branch of
 * get_partner_room_link against the live DB. Makes NO writes.
 *
 * Run: npx tsx --env-file=.env.local scripts/smoke-partner-room-tools.ts
 */
import { desc, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { executeTool, type ToolContext } from "@/lib/wa-agent/tools";

async function main() {
  // Only rooms that already hold a token: get_partner_room_link would MINT one
  // (a live write) for a token-less room, and this script must stay read-only.
  const [room] = await db
    .select({
      id: schema.partnerRooms.id,
      name: schema.partnerRooms.name,
      workspaceId: schema.partnerRooms.workspaceId,
      createdBy: schema.partnerRooms.createdBy,
      contactId: schema.partnerRooms.primaryContactId,
    })
    .from(schema.partnerRooms)
    .where(isNotNull(schema.partnerRooms.publicAccessTokenHash))
    .orderBy(desc(schema.partnerRooms.updatedAt))
    .limit(1);
  if (!room) {
    console.log("No token-bearing partner rooms in DB — nothing to smoke test.");
    return;
  }

  const ctx: ToolContext = {
    workspaceId: room.workspaceId,
    userId: room.createdBy,
    workspaceRole: "owner",
    ownerTimezone: "America/Caracas",
    now: new Date(),
  };

  console.log(`Room under test: "${room.name}" [${room.id}]`);

  const overview = await executeTool("partner_room_overview", { room_id: room.id }, ctx);
  console.log("\n— partner_room_overview:", overview.ok ? "OK" : `FAIL: ${overview.error}`);
  if (overview.ok) console.log(JSON.stringify(overview.data, null, 2).slice(0, 3000));

  // fresh omitted → read-only branch (reports link state, mints nothing)
  const link = await executeTool("get_partner_room_link", { room_id: room.id }, ctx);
  console.log("\n— get_partner_room_link (no fresh):", link.ok ? "OK" : `FAIL: ${link.error}`);
  if (link.ok) console.log(JSON.stringify(link.data, null, 2));

  // Contact-based resolution path
  if (room.contactId) {
    const byContact = await executeTool(
      "partner_room_overview",
      { contact_id: room.contactId },
      ctx,
    );
    console.log(
      "\n— resolve by contact_id:",
      byContact.ok ? "OK" : `(expected if contact has several rooms) ${byContact.error}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Fatal:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
