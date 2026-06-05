export const NIGO_USER_ID = "a1100000-0000-4000-8000-000000000001";
export const NIGO_DISPLAY_NAME = "ÑIGO";

export function nigoDisplayName(userId: string, fallback: string): string {
  return userId === NIGO_USER_ID ? NIGO_DISPLAY_NAME : fallback;
}
