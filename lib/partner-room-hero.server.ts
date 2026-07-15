/**
 * Generate a partner room's hero image with Grok (xAI) and persist it:
 * xAI → agb-project-files bucket → partner_rooms.hero_image_* columns.
 * Shared by the operator server action and the set_room_branding MCP tool.
 */
import "server-only";
import { setRoomHeroImage } from "@/db/queries/partner-access";
import { removeObjects, uploadBytes } from "@/lib/project-files/storage";
import { generateXaiImage, xaiImageEnabled } from "@/lib/xai-image";
import {
  buildHeroImagePrompt,
  heroImageTheme,
  pickThemeForRoom,
} from "@/lib/partner-room-hero-images";

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type GenerateRoomHeroResult =
  | { ok: true; themeKey: string; themeLabel: string; url: string }
  | { ok: false; error: string };

export async function generateRoomHeroImage(input: {
  workspaceId: string;
  roomId: string;
  /** Explicit theme key; omit for the room's deterministic default. */
  themeKey?: string | null;
}): Promise<GenerateRoomHeroResult> {
  if (!xaiImageEnabled()) {
    return { ok: false, error: "Image generation is not configured (XAI_API_KEY missing)" };
  }
  const theme = input.themeKey
    ? heroImageTheme(input.themeKey)
    : pickThemeForRoom(input.roomId);
  if (!theme) return { ok: false, error: `Unknown hero image theme "${input.themeKey}"` };

  const prompt = buildHeroImagePrompt(theme);
  const image = await generateXaiImage({ prompt, aspectRatio: "2:1", resolution: "2k" });
  if (!image.ok) return image;

  const ext = MIME_EXT[image.mime] ?? "jpg";
  const path = `${input.workspaceId}/room-heros/${input.roomId}/${crypto.randomUUID()}-${theme.key}.${ext}`;
  const uploaded = await uploadBytes(path, image.bytes, image.mime);
  if (!uploaded.ok) return { ok: false, error: uploaded.error };

  const row = await setRoomHeroImage({
    workspaceId: input.workspaceId,
    roomId: input.roomId,
    heroImageStoragePath: path,
    heroImageTheme: theme.key,
    heroImagePrompt: prompt,
  });
  if (!row) {
    // Room vanished (or wrong workspace) after upload — don't orphan the object.
    await removeObjects([path]).catch(() => {});
    return { ok: false, error: "Room not found" };
  }
  if (row.previousPath && row.previousPath !== path) {
    await removeObjects([row.previousPath]).catch(() => {});
  }
  const v = row.heroImageGeneratedAt?.getTime() ?? Date.now();
  return {
    ok: true,
    themeKey: theme.key,
    themeLabel: theme.label,
    url: `/api/room-hero/${input.roomId}?v=${v}`,
  };
}

export async function removeRoomHeroImage(input: {
  workspaceId: string;
  roomId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await setRoomHeroImage({
    workspaceId: input.workspaceId,
    roomId: input.roomId,
    heroImageStoragePath: null,
    heroImageTheme: null,
    heroImagePrompt: null,
  });
  if (!row) return { ok: false, error: "Room not found" };
  if (row.previousPath) await removeObjects([row.previousPath]).catch(() => {});
  return { ok: true };
}
