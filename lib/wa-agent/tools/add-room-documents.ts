import {
  createPartnerShare,
  listShareableDocsForRoom,
  type ShareableRoomDoc,
} from "@/db/queries/partner-access";
import type { PartnerKind, PartnerPermission } from "@/lib/partner-access";
import { safeStr, type ToolEntry } from "./_types";
import {
  ROOM_REF_PROPS,
  partnerAccessUrl,
  resolveRoomRef,
  roomWriteBlocked,
} from "./_partner-room";

function pickDocs(
  all: ShareableRoomDoc[],
  input: Record<string, unknown>,
): { ok: true; docs: ShareableRoomDoc[] } | { ok: false; error: string } {
  const ids = Array.isArray(input.doc_ids)
    ? Array.from(new Set(input.doc_ids.filter((v): v is string => typeof v === "string")))
    : [];
  if (ids.length > 0) {
    const byId = new Map(all.map((d) => [d.id, d]));
    const docs = ids.map((id) => byId.get(id)).filter((d): d is ShareableRoomDoc => Boolean(d));
    const unmatched = ids.filter((id) => !byId.has(id));
    if (docs.length === 0) {
      return { ok: false, error: "None of the doc_ids match shareable documents for this room" };
    }
    if (unmatched.length > 0) {
      return {
        ok: false,
        error: `These doc_ids don't match any shareable document: ${unmatched.join(", ")} — re-check with partner_room_overview, or drop them and retry.`,
      };
    }
    return { ok: true, docs };
  }

  const query = safeStr(input.doc_query, 120).toLowerCase();
  if (!query) return { ok: false, error: "Provide doc_ids or doc_query" };
  const docs = all.filter(
    (d) =>
      d.label.toLowerCase().includes(query) ||
      d.lobTitle.toLowerCase().includes(query) ||
      (d.originalFilename ?? "").toLowerCase().includes(query),
  );
  if (docs.length === 0) {
    const sample = all
      .slice(0, 15)
      .map((d) => `"${d.label}" (${d.lobTitle}) [${d.id}]`)
      .join("; ");
    return {
      ok: false,
      error: `No shareable document matches "${query}". Available: ${sample || "none — attach files or links to a project first (attach_link)"}`,
    };
  }
  // A broad query silently sharing a dozen docs is worse than a follow-up
  // question — surface the matches and make the caller pick.
  if (docs.length > 6) {
    const list = docs.map((d) => `"${d.label}" (${d.lobTitle}) [${d.id}]`).join("; ");
    return {
      ok: false,
      error: `"${query}" matches ${docs.length} documents — too many to add blindly: ${list}. Confirm which with the user, then pass doc_ids.`,
    };
  }
  return { ok: true, docs };
}

export const addRoomDocuments: ToolEntry = {
  definition: {
    name: "add_room_documents",
    description:
      "Share workspace documents (project files, decks, links) into a partner room so the " +
      "partner sees them at their guest link. Pick documents by doc_ids (from " +
      "partner_room_overview's availableDocuments) or by doc_query title match. Documents " +
      "must already live on a project — use attach_link to add a URL to a project first.",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        doc_ids: {
          type: "array",
          items: { type: "string" },
          description: "linkIds to share (preferred; from partner_room_overview)",
        },
        doc_query: {
          type: "string",
          description:
            "Title fragment; every shareable doc whose label/project/filename matches is added",
        },
        allow_download: {
          type: "boolean",
          description: "Also let the partner download files (default view-only)",
        },
      },
    },
  },
  async execute(input, ctx) {
    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    const { room } = ref;
    const blocked = roomWriteBlocked(room);
    if (blocked) return { ok: false, error: blocked };
    if (!room.primaryContactId) {
      return { ok: false, error: "This room has no contact attached" };
    }

    const shareable = await listShareableDocsForRoom({
      workspaceId: ctx.workspaceId,
      roomId: room.id,
    });
    const picked = pickDocs(shareable, input);
    if (!picked.ok) return picked;

    const fresh = picked.docs.filter((d) => !d.alreadyShared);
    const skipped = picked.docs.length - fresh.length;
    if (fresh.length === 0) {
      return {
        ok: false,
        error: "All matched documents are already shared into this room",
      };
    }

    const permissions: PartnerPermission[] =
      input.allow_download === true ? ["view", "download"] : ["view"];

    let added = 0;
    const addedLabels: string[] = [];
    let lastError: string | null = null;
    let mintedToken: string | null = null;
    for (const doc of fresh) {
      const res = await createPartnerShare({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        projectId: doc.lobId,
        projectLinkId: doc.id,
        contactId: room.primaryContactId,
        partnerKind: room.partnerKind as PartnerKind,
        channel: "manual",
        permissions,
        roomId: room.id,
        preserveExistingShare: true,
      });
      if (res.ok) {
        added++;
        addedLabels.push(doc.label);
        // A token comes back only when the room had no live link yet — keep it,
        // it is the one chance to see it (only the hash is stored).
        if (!mintedToken && res.accessToken) mintedToken = res.accessToken;
      } else {
        lastError = res.error;
      }
    }

    if (added === 0) {
      return { ok: false, error: lastError ?? "Could not add documents" };
    }
    const guestUrl = mintedToken ? partnerAccessUrl(mintedToken) : null;
    return {
      ok: true,
      data: {
        roomId: room.id,
        added,
        addedLabels,
        alreadyShared: skipped,
        failed: fresh.length - added,
        permissions,
        guestUrl,
      },
      speak:
        `Added ${added} document${added === 1 ? "" : "s"} to "${room.name}": ${addedLabels.join(", ")}.` +
        (guestUrl ? ` Guest link (save it — it cannot be re-shown): ${guestUrl}` : ""),
    };
  },
};
