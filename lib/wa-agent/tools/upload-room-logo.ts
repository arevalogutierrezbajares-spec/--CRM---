import { updateContactLogo } from "@/db/queries/partner-access";
import { removeObjects, slugFilename, uploadBytes } from "@/lib/project-files/storage";
import { safeStr, type ToolEntry } from "./_types";
import { ROOM_REF_PROPS, absUrl, resolveRoomRef, roomWriteBlocked } from "./_partner-room";
import { decodeBase64Upload } from "./_upload";

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // matches the web contact-logo uploader

// Logo image types (parity with app/api/contact-logo/[contactId]) → stored content type.
const LOGO_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i).toLowerCase();
}

export const uploadRoomLogo: ToolEntry = {
  definition: {
    name: "upload_room_logo",
    description:
      "Set the client's logo in a partner room from an image you were handed (base64), no public " +
      "URL needed — it uploads the image and shows it in the room's co-brand lockup. The logo is " +
      "stored on the room's contact, so the room must have a contact attached. For a logo that " +
      "already lives at a URL, use set_room_branding (client_logo_url) instead. Allowed: PNG, JPG, " +
      "WEBP, GIF, SVG (max 5 MB). After uploading, confirm the returned URL renders before sharing.",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        filename: {
          type: "string",
          description: "Original filename WITH extension (e.g. \"acme-logo.png\") — the extension decides the image type",
        },
        content_base64: {
          type: "string",
          description: "The image's bytes, base64-encoded (a data: URL is also accepted)",
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
    if (!room.primaryContactId) {
      return { ok: false, error: "This room has no contact attached — cannot set a client logo" };
    }
    const contactId = room.primaryContactId;

    const filename = safeStr(input.filename, 255);
    if (!filename) return { ok: false, error: "filename (with extension) is required" };
    const contentType = LOGO_MIME_BY_EXT[extOf(filename)];
    if (!contentType) {
      return { ok: false, error: "Use a PNG, JPG, WEBP, GIF, or SVG image" };
    }

    const decoded = decodeBase64Upload(input.content_base64, MAX_LOGO_BYTES);
    if (!decoded.ok) return decoded;
    const { bytes } = decoded.result;

    const path = `${ctx.workspaceId}/contact-logos/${contactId}/${crypto.randomUUID()}-${slugFilename(filename)}`;
    const uploaded = await uploadBytes(path, bytes, contentType);
    if (!uploaded.ok) return { ok: false, error: uploaded.error };

    // Cache-busted proxy URL, so a re-upload isn't masked by a stale cached image.
    const logoUrl = `/api/contact-logo/${contactId}?v=${ctx.now.getTime()}`;
    let updated: { previousPath: string | null } | null;
    try {
      updated = await updateContactLogo({
        workspaceId: ctx.workspaceId,
        contactId,
        logoUrl,
        logoStoragePath: path,
      });
    } catch (e) {
      await removeObjects([path]).catch(() => {});
      throw e;
    }
    if (!updated) {
      await removeObjects([path]).catch(() => {});
      return { ok: false, error: "Contact not found" };
    }
    // Clean up the logo the room used before, if it was an uploaded object.
    if (updated.previousPath) {
      await removeObjects([updated.previousPath]).catch(() => {});
    }

    return {
      ok: true,
      data: {
        roomId: room.id,
        roomName: room.name,
        changed: ["client logo (uploaded)"],
        confirm: { clientLogoUrl: absUrl(logoUrl) },
      },
      speak: `Uploaded the client logo for "${room.name}".`,
    };
  },
};
