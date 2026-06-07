/** localStorage keys + default for the Home quote bubble, shared by the bubble
 *  (reads) and the Settings card (writes). Client-only prefs — no backend. */
export const QUOTE_FAVS_KEY = "agb_quotes_favs";
export const QUOTE_PACE_KEY = "agb_quotes_pace";
export const QUOTE_FAVONLY_KEY = "agb_quotes_favonly";
export const NIGO_DEMON_MODE_KEY = "agb_nigo_demon_mode";
/** JSON array of broadcast ids (audioSrc) the user has switched OFF — so they
 *  don't get announced in the rotation. Empty/absent = all broadcasts on. */
export const NIGO_DEMON_DISABLED_KEY = "agb_nigo_demon_disabled";
export const DEFAULT_QUOTE_PACE = 30;

/** Read the set of disabled broadcast ids from localStorage (client-only). */
export function readDisabledBroadcasts(): Set<string> {
  try {
    const raw = localStorage.getItem(NIGO_DEMON_DISABLED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}
