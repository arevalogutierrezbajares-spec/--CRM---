/**
 * Allow-list of brain roots that the research module is allowed to read from.
 * Keys must match research_notes.source_root values exactly.
 * Values are absolute paths on the dev machine.
 *
 * Reading is also gated on workspace membership in the API route.
 */

export const BRAIN_ROOTS: Record<string, string> = {
  "vz-docs": "/Users/tomas/vz-docs",
  "VZ_Tourism_Project/docs": "/Users/tomas/VZ_Tourism_Project/docs",
};

export function resolveBrainPath(
  sourceRoot: string,
  relPath: string,
): string | null {
  const root = BRAIN_ROOTS[sourceRoot];
  if (!root) return null;
  // Reject traversal
  if (relPath.includes("..")) return null;
  if (relPath.startsWith("/")) return null;
  return `${root}/${relPath}`;
}
