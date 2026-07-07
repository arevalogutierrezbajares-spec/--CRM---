import { createRoomItem } from "@/db/queries/partner-repository";
import { REPO_SECTION_OPTIONS, repoSection } from "@/lib/partner-access";
import { validateLinkUrl } from "@/lib/project-links/validate";
import { safeStr, type ToolEntry } from "./_types";
import { ROOM_REF_PROPS, resolveRoomRef, roomWriteBlocked } from "./_partner-room";

const SECTION_VALUES = REPO_SECTION_OPTIONS.map((o) => o.value);

export const addRoomLink: ToolEntry = {
  definition: {
    name: "add_room_link",
    description:
      "Add an external URL (Google Doc, Figma, video, site…) directly into a partner room's " +
      "repository so the partner can open it. Unlike add_room_documents this does not " +
      "require the URL to live on a project first.",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        url: { type: "string", description: "The https:// URL to add" },
        title: { type: "string", description: "Display title for the partner" },
        description: { type: "string", description: "Optional one-line description" },
        section: {
          type: "string",
          enum: SECTION_VALUES,
          description: "Repository section; defaults to documentos",
        },
      },
      required: ["url", "title"],
    },
  },
  async execute(input, ctx) {
    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    const { room } = ref;
    const blocked = roomWriteBlocked(room);
    if (blocked) return { ok: false, error: blocked };

    const title = safeStr(input.title, 200);
    if (!title) return { ok: false, error: "Add a title" };
    const validation = validateLinkUrl(safeStr(input.url, 2048));
    if (!validation.ok) return { ok: false, error: validation.error };

    const item = await createRoomItem({
      workspaceId: ctx.workspaceId,
      roomId: room.id,
      kind: "link",
      title,
      url: validation.url,
      description: safeStr(input.description, 500) || null,
      category: repoSection(safeStr(input.section, 40) || null),
      addedBy: ctx.userId,
    });

    return {
      ok: true,
      data: { itemId: item.id, roomId: room.id, title, section: item.category },
      speak: `Added "${title}" to "${room.name}".`,
    };
  },
};
