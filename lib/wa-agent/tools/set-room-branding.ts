import {
  listLogoBrands,
  setRoomBrandLobIds,
  setRoomHeroVideo,
  updateContactLogo,
  type BrandLogo,
} from "@/db/queries/partner-access";
import { ROOM_HERO_VIDEOS, roomHeroVideo } from "@/lib/partner-room-videos";
import { ROOM_HERO_PHOTO_SETS, roomHeroPhotoSet } from "@/lib/partner-room-photos";
import { HERO_IMAGE_THEMES, heroImageTheme } from "@/lib/partner-room-hero-images";
import {
  generateRoomHeroImage,
  removeRoomHeroImage,
} from "@/lib/partner-room-hero.server";
import { removeObjects } from "@/lib/project-files/storage";
import { safeStr, type ToolEntry } from "./_types";
import {
  ROOM_REF_PROPS,
  absUrl,
  resolveRoomRef,
  roomWriteBlocked,
} from "./_partner-room";

const HERO_KEYS = [
  ...ROOM_HERO_VIDEOS.map((v) => v.key),
  ...ROOM_HERO_PHOTO_SETS.map((s) => s.key),
  "none",
];
const HERO_IMAGE_KEYS = [...HERO_IMAGE_THEMES.map((t) => t.key), "auto", "none"];
const MAX_BRAND_LOGOS = 12; // matches the app's cap — the lockup row overflows past this
const LOGO_URL_MAX = 2048;

export const setRoomBranding: ToolEntry = {
  definition: {
    name: "set_room_branding",
    description:
      "Set a partner room's visual branding: the client's logo (shown in the co-brand " +
      "lockup), the hero background video (Venezuela footage presets), a Grok-generated " +
      "hero image (South American nature themes; slow — ~10-30s), and which project " +
      "brand logos appear. A set hero video takes precedence over the generated image. " +
      "Only the fields provided change; every field is validated before anything is " +
      "written. After setting, re-run partner_room_overview and confirm the returned " +
      "image/video URLs with the user so the room is verified crisp before sharing.",
    input_schema: {
      type: "object",
      properties: {
        ...ROOM_REF_PROPS,
        client_logo_url: {
          type: "string",
          description:
            'Image URL for the client\'s logo (https://… or a site-relative /path); "clear" removes it',
        },
        hero_video: {
          type: "string",
          enum: HERO_KEYS,
          description:
            "Hero background preset — a Venezuela footage video loop or an archive " +
            'photo set (living-film slideshow, e.g. "expedicion-canaima"); "none" removes it',
        },
        hero_image: {
          type: "string",
          enum: HERO_IMAGE_KEYS,
          description:
            "Generate a hero background image with Grok — a South American nature theme " +
            'key, "auto" for the room\'s own deterministic pick, or "none" to remove the ' +
            "current image",
        },
        brand_projects: {
          type: "array",
          items: { type: "string" },
          description:
            `Project titles (or lobIds) whose logos to show, in order (max ${MAX_BRAND_LOGOS}); ` +
            "empty array = auto-derive from shared documents",
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

    // ── Validate every provided field BEFORE any write. A late validation
    // error must never leave the logo changed (and the old file deleted)
    // while reporting failure.
    const rawLogoInput = typeof input.client_logo_url === "string" ? input.client_logo_url.trim() : "";
    if (rawLogoInput.length > LOGO_URL_MAX) {
      return { ok: false, error: `client_logo_url is too long (max ${LOGO_URL_MAX} characters)` };
    }
    const rawLogo = safeStr(input.client_logo_url, LOGO_URL_MAX);
    const clearLogo = rawLogo ? rawLogo.toLowerCase() === "clear" : false;
    if (rawLogo && !clearLogo) {
      if (!room.primaryContactId) {
        return { ok: false, error: "This room has no contact attached — cannot set a client logo" };
      }
      if (!/^https?:\/\//i.test(rawLogo) && !rawLogo.startsWith("/")) {
        return { ok: false, error: "client_logo_url must be an image URL (https://…) or /path" };
      }
    }
    if (clearLogo && !room.primaryContactId) {
      return { ok: false, error: "This room has no contact attached — cannot set a client logo" };
    }

    const rawHero = safeStr(input.hero_video, 40);
    const clearHero = rawHero
      ? rawHero.toLowerCase() === "none" || rawHero.toLowerCase() === "clear"
      : false;
    const heroPreset = roomHeroVideo(rawHero);
    const heroPhotoPreset = roomHeroPhotoSet(rawHero);
    if (rawHero && !clearHero && !heroPreset && !heroPhotoPreset) {
      return {
        ok: false,
        error: `Unknown hero background "${rawHero}". Options: ${HERO_KEYS.join(", ")}`,
      };
    }

    const rawHeroImage = safeStr(input.hero_image, 40)?.toLowerCase();
    const clearHeroImage = rawHeroImage === "none" || rawHeroImage === "clear";
    const heroImageAuto = rawHeroImage === "auto";
    if (rawHeroImage && !clearHeroImage && !heroImageAuto && !heroImageTheme(rawHeroImage)) {
      return {
        ok: false,
        error: `Unknown hero image theme "${rawHeroImage}". Options: ${HERO_IMAGE_KEYS.join(", ")}`,
      };
    }

    let brandPicks: BrandLogo[] | null | undefined; // undefined = untouched, null = auto
    if (Array.isArray(input.brand_projects)) {
      const wanted = input.brand_projects
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean);
      if (wanted.length === 0) {
        brandPicks = null;
      } else {
        if (wanted.length > MAX_BRAND_LOGOS) {
          return {
            ok: false,
            error: `Too many brand_projects (${wanted.length}) — the lockup shows at most ${MAX_BRAND_LOGOS}`,
          };
        }
        const brands = await listLogoBrands({ workspaceId: ctx.workspaceId });
        const picks: BrandLogo[] = [];
        for (const w of wanted) {
          const exact =
            brands.find((b) => b.lobId === w) ??
            brands.find((b) => b.title.toLowerCase() === w.toLowerCase());
          const partial = exact
            ? [exact]
            : brands.filter((b) => b.title.toLowerCase().includes(w.toLowerCase()));
          if (partial.length === 0) {
            const options = brands.map((b) => b.title).join(", ") || "none have logos yet";
            return {
              ok: false,
              error: `No project with a logo matches "${w}". Projects with logos: ${options}`,
            };
          }
          if (partial.length > 1) {
            return {
              ok: false,
              error: `"${w}" is ambiguous — matches ${partial.map((b) => b.title).join(", ")}. Use the exact title.`,
            };
          }
          if (!picks.some((p) => p.lobId === partial[0].lobId)) picks.push(partial[0]);
        }
        brandPicks = picks;
      }
    }

    // ── Apply.
    const changed: string[] = [];
    const confirm: Record<string, unknown> = {};

    if (rawLogo) {
      const updated = await updateContactLogo({
        workspaceId: ctx.workspaceId,
        contactId: room.primaryContactId as string,
        logoUrl: clearLogo ? null : rawLogo,
        logoStoragePath: null,
      });
      if (!updated) return { ok: false, error: "Contact not found" };
      if (updated.previousPath) {
        await removeObjects([updated.previousPath]).catch(() => {});
      }
      changed.push(clearLogo ? "client logo (cleared)" : "client logo");
      if (!clearLogo) confirm.clientLogoUrl = absUrl(rawLogo);
    }

    if (rawHero) {
      const row = await setRoomHeroVideo({
        workspaceId: ctx.workspaceId,
        roomId: room.id,
        heroVideoKey: clearHero ? null : rawHero,
      });
      if (!row) return { ok: false, error: "Room not found" };
      if (clearHero) {
        changed.push("hero background (removed)");
      } else if (heroPreset) {
        changed.push(`hero video (${heroPreset.label})`);
        confirm.heroVideoPoster = absUrl(heroPreset.poster);
      } else if (heroPhotoPreset) {
        changed.push(`hero photo set (${heroPhotoPreset.label})`);
        confirm.heroPhotoPoster = absUrl(heroPhotoPreset.images[0].src);
      }
    }

    if (rawHeroImage) {
      if (clearHeroImage) {
        const res = await removeRoomHeroImage({
          workspaceId: ctx.workspaceId,
          roomId: room.id,
        });
        if (!res.ok) return { ok: false, error: res.error };
        changed.push("hero image (removed)");
      } else {
        const res = await generateRoomHeroImage({
          workspaceId: ctx.workspaceId,
          roomId: room.id,
          themeKey: heroImageAuto ? null : rawHeroImage,
        });
        if (!res.ok) return { ok: false, error: res.error };
        changed.push(`hero image (${res.themeLabel}, Grok-generated)`);
        confirm.heroImageUrl = absUrl(res.url);
        // The guest hero shows the video/photo preset when both are set.
        const presetStillSet = rawHero ? !clearHero : Boolean(room.heroVideoKey);
        if (presetStillSet) {
          confirm.note =
            "A hero video/photo preset is also set and takes precedence — remove it (hero_video: none) to show the generated image.";
        }
      }
    }

    if (brandPicks !== undefined) {
      const row = await setRoomBrandLobIds({
        workspaceId: ctx.workspaceId,
        roomId: room.id,
        brandLobIds: brandPicks === null ? null : brandPicks.map((p) => p.lobId),
      });
      if (!row) return { ok: false, error: "Room not found" };
      if (brandPicks === null) {
        changed.push("brand logos (auto from shared documents)");
      } else {
        changed.push(`brand logos (${brandPicks.length} explicit)`);
        confirm.brandLogoUrls = brandPicks.map((p) => ({
          project: p.title,
          logoUrl: absUrl(p.logoUrl),
        }));
      }
    }

    if (changed.length === 0) {
      return {
        ok: false,
        error:
          "No branding fields to set — provide client_logo_url, hero_video, hero_image, or brand_projects",
      };
    }
    return {
      ok: true,
      data: { roomId: room.id, roomName: room.name, changed, confirm },
      speak: `Updated branding on "${room.name}": ${changed.join(", ")}.`,
    };
  },
};
