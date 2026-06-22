/**
 * Shared types for the meeting "present" stage. Lives in its own module so both
 * present-stage (the value `MaterialRenderer` consumer) and material-renderer
 * (the type consumer) import from here — breaking the import cycle between them.
 */

import type { MaterialKind } from "@/db/queries/meeting-materials";

export type PresentMaterial = {
  id: string;
  kind: MaterialKind;
  label: string;
  url: string | null;
  description: string | null;
  mimeType: string | null;
  /** Original upload filename — used to detect type when mime is generic. */
  fileName: string | null;
  lobTitle: string | null;
  /** Signed URL minted server-side for stored files. */
  fileUrl: string | null;
};
