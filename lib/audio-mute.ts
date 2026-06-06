/** Global audio mute — shared by the login greeting, the quote-bubble voice,
 *  and demon-mode announcements. One persisted flag + a same-tab event so every
 *  player reacts live (no prop drilling). Client-only; SSR-safe no-ops. */

export const AUDIO_MUTED_KEY = "agb_audio_muted";
const EVENT = "agb:audio-mute";

export function isAudioMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AUDIO_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAudioMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUDIO_MUTED_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: muted }));
}

/** Subscribe to mute changes (same tab). Returns an unsubscribe fn. */
export function onAudioMuteChange(cb: (muted: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
