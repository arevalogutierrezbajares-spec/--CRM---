// Grok-generated hero images for partner rooms — South American nature
// themes, Venezuela-leaning to match the video presets (partner-room-videos).
// partner_rooms.hero_image_theme stores the `key`; the image itself lives in
// Supabase storage and is served via /api/room-hero/[roomId].
//
// Client-safe: the operator picker imports the theme list; generation itself
// happens in lib/partner-room-hero.server.ts.

export type HeroImageTheme = {
  key: string;
  label: string;
  /** Scene description — combined with HERO_IMAGE_STYLE at generation time. */
  scene: string;
};

export const HERO_IMAGE_THEMES: readonly HeroImageTheme[] = [
  {
    key: "tepui",
    label: "Tepuis de Canaima",
    scene:
      "Ancient flat-topped tepui mesas rising above the Gran Sabana at dawn, " +
      "low clouds wrapping the sandstone cliffs, golden light breaking across " +
      "endless green savanna",
  },
  {
    key: "angel-falls",
    label: "Salto Ángel",
    scene:
      "The world's tallest waterfall plunging off Auyán-tepui into misty " +
      "rainforest far below, thin ribbon of water dissolving into spray, " +
      "dramatic cliff face in soft morning haze",
  },
  {
    key: "los-roques",
    label: "Los Roques",
    scene:
      "A Caribbean coral atoll seen from above, gradients of turquoise and " +
      "deep sapphire water around white sandbars, a lone sailboat anchored in " +
      "a quiet lagoon under warm late-afternoon light",
  },
  {
    key: "amazon-orinoco",
    label: "Amazonas / Orinoco",
    scene:
      "Vast rainforest canopy at sunrise with river mist rising between the " +
      "trees, the wide Orinoco river curving through the jungle catching " +
      "amber light, layers of green fading into atmospheric haze",
  },
  {
    key: "llanos",
    label: "Los Llanos",
    scene:
      "Flooded tropical grassland plains at golden hour, a flock of scarlet " +
      "ibis flying low over still mirror-like water, scattered palms on the " +
      "horizon under a huge dramatic sky",
  },
  {
    key: "andes-paramo",
    label: "Páramo andino",
    scene:
      "High Andean páramo near Mérida with frailejón plants in the " +
      "foreground, jagged snow-dusted peaks behind, cool blue mist drifting " +
      "through the valley at first light",
  },
  {
    key: "cloud-forest",
    label: "Bosque nublado",
    scene:
      "Lush montane cloud forest of Henri Pittier, fog threading through " +
      "moss-covered trees and hanging bromeliads, soft diffused light, deep " +
      "layered greens receding into white mist",
  },
  {
    key: "orinoco-delta",
    label: "Delta del Orinoco",
    scene:
      "Winding waterways of the Orinoco delta at dusk, dense mangrove walls " +
      "reflected in calm dark water, warm orange sky fading to deep violet, a " +
      "wooden curiara canoe silhouetted mid-channel",
  },
] as const;

/**
 * Shared style directive — the guest hero overlays white text on a darkening
 * gradient, so images should be cinematic and moody rather than washed out.
 */
export const HERO_IMAGE_STYLE =
  "Cinematic ultra-wide landscape photograph, natural documentary style, " +
  "golden-hour or blue-hour light, atmospheric depth, rich deep tones that " +
  "read well behind overlaid white text. No people, no text, no watermarks, " +
  "no logos, no borders.";

export function heroImageTheme(key: string | null | undefined): HeroImageTheme | null {
  if (!key) return null;
  return HERO_IMAGE_THEMES.find((t) => t.key === key) ?? null;
}

export function buildHeroImagePrompt(theme: HeroImageTheme): string {
  return `${theme.scene}. ${HERO_IMAGE_STYLE}`;
}

/**
 * Deterministic "surprise me" pick: hash the room id so each room gets its
 * own theme, stable across regenerations unless an explicit theme is chosen.
 */
export function pickThemeForRoom(roomId: string): HeroImageTheme {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) {
    hash = (hash * 31 + roomId.charCodeAt(i)) >>> 0;
  }
  return HERO_IMAGE_THEMES[hash % HERO_IMAGE_THEMES.length];
}

/** Proxy URL for a room's generated hero; versioned so replacements bust caches. */
export function roomHeroImageUrl(room: {
  id: string;
  heroImageStoragePath: string | null;
  heroImageGeneratedAt: Date | null;
}): string | null {
  if (!room.heroImageStoragePath) return null;
  const v = room.heroImageGeneratedAt?.getTime() ?? 0;
  return `/api/room-hero/${room.id}?v=${v}`;
}
