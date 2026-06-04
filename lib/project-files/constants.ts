/**
 * Client-safe constants for project files. Kept separate from storage.ts
 * (which is `server-only`) so the browser upload client can import the bucket
 * name without pulling the service-role helpers into the client bundle.
 */
export const PROJECT_FILES_BUCKET = "agb-project-files";
export const SIGNED_DOWNLOAD_TTL_SECS = 3600; // FR-DOC-18: 1 hour
