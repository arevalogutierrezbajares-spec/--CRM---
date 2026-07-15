import { createRoomItem } from "@/db/queries/partner-repository";
import {
  canonicalMime,
  isAllowedUpload,
  REJECT_MESSAGE,
} from "@/lib/project-files/allowed-types";
import { isExecutableContent } from "@/lib/project-files/sniff";
import { REPO_SECTION_OPTIONS, repoSection } from "@/lib/partner-access";
import { removeObjects, slugFilename, uploadBytes } from "@/lib/project-files/storage";
import { safeStr, type ToolEntry } from "./_types";
import { ROOM_REF_PROPS, resolveRoomRef, roomWriteBlocked } from "./_partner-room";
import { decodeBase64Upload } from "./_upload";

const SECTION_VALUES = REPO_SECTION_OPTIONS.map((o) => o.value);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // inline-through-MCP ceiling; web uploader handles bigger

export const uploadRoomFile: ToolEntry = {
  definition: {
    name: "upload_room_file",
    description:
      "Upload a file directly into a partner room's repository from its bytes (base64), so a " +
      "file you were handed (PDF, deck, image, Office doc) reaches the partner without needing a " +
      "public URL first. The file is stored privately and served to the guest through a signed, " +
      "expiring link. For a file that already lives at a URL, use add_room_link instead; to share " +
      "a document already on a project, use add_room_documents. Allowed: PDF, HTML, DOCX, XLSX, " +
      "PPTX, PNG, JPG, WEBP, GIF, TXT, MD, CSV (max 10 MB inline — larger files go through the web app).",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        filename: {
          type: "string",
          description: "Original filename WITH extension (e.g. \"capability-brief.pdf\") — the extension decides the file type",
        },
        content_base64: {
          type: "string",
          description: "The file's bytes, base64-encoded (a data: URL is also accepted)",
        },
        title: {
          type: "string",
          description: "Display title for the partner; defaults to the filename",
        },
        description: { type: "string", description: "Optional one-line description" },
        mime_type: {
          type: "string",
          description: "Optional declared MIME type; the extension is authoritative if this disagrees",
        },
        section: {
          type: "string",
          enum: SECTION_VALUES,
          description: "Repository section; defaults to documentos",
        },
      },
      required: ["filename", "content_base64"],
    },
  },
  async execute(input, ctx) {
    const ref = await resolveRoomRef(ctx.workspaceId, input);
    if (!ref.ok) return ref;
    const { room } = ref;
    const blocked = roomWriteBlocked(room);
    if (blocked) return { ok: false, error: blocked };

    const filename = safeStr(input.filename, 255);
    if (!filename) return { ok: false, error: "filename (with extension) is required" };
    const declaredMime = safeStr(input.mime_type, 160);
    if (!isAllowedUpload(filename, declaredMime)) {
      return { ok: false, error: REJECT_MESSAGE };
    }

    const decoded = decodeBase64Upload(input.content_base64, MAX_FILE_BYTES);
    if (!decoded.ok) return decoded;
    const { bytes, sizeBytes } = decoded.result;

    // These items are offered to external partners for download — never accept
    // raw executables, matching the web room-items finalize guard.
    if (isExecutableContent(bytes)) {
      return { ok: false, error: "Executable content rejected" };
    }

    const title = safeStr(input.title, 200) || filename;
    const mime = canonicalMime(filename, declaredMime);
    const path = `${ctx.workspaceId}/room-items/${room.id}/${crypto.randomUUID()}-${slugFilename(filename)}`;

    const uploaded = await uploadBytes(path, bytes, mime);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };

    try {
      const item = await createRoomItem({
        workspaceId: ctx.workspaceId,
        roomId: room.id,
        kind: "file",
        title,
        description: safeStr(input.description, 500) || null,
        category: repoSection(safeStr(input.section, 40) || null),
        storagePath: path,
        mimeType: mime,
        sizeBytes,
        addedBy: ctx.userId,
      });
      return {
        ok: true,
        data: {
          itemId: item.id,
          roomId: room.id,
          title,
          section: item.category,
          sizeBytes,
          mimeType: mime,
        },
        speak: `Uploaded "${title}" to "${room.name}".`,
      };
    } catch (e) {
      // Don't leave an orphaned object if the DB write fails.
      await removeObjects([path]).catch(() => {});
      throw e;
    }
  },
};
