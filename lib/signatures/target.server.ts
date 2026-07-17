/**
 * Resolves the exact bytes of a signature request's target document.
 * Prefers frozen bytes when the request has a freeze; falls back to live
 * storage for legacy pending requests created before P0.
 */
import "server-only";
import {
  fetchFrozenOrLiveBytes,
} from "@/lib/signatures/freeze.server";
import type { PartnerSignatureRequest } from "@/db/queries/partner-signatures";
import { SIGN_DOC_MAX_BYTES as MAX_BYTES } from "@/lib/signatures/freeze-paths";

export const SIGN_DOC_MAX_BYTES = MAX_BYTES;

export function isPdfBytes(bytes: Uint8Array | null): bytes is Uint8Array {
  return (
    !!bytes &&
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %PDF
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

/**
 * Prefer request.frozenStoragePath; otherwise live path resolution.
 * `token` is accepted for API compatibility but freeze/live resolve via DB.
 */
export async function fetchSignatureTargetBytes(opts: {
  token: string;
  roomId: string;
  workspaceId: string;
  targetKind: string;
  targetId: string;
  frozenStoragePath?: string | null;
}): Promise<Uint8Array | null> {
  void opts.token;
  return fetchFrozenOrLiveBytes({
    frozenStoragePath: opts.frozenStoragePath,
    roomId: opts.roomId,
    workspaceId: opts.workspaceId,
    targetKind: opts.targetKind,
    targetId: opts.targetId,
  });
}

/** Convenience: load bytes for a full request row. */
export async function fetchBytesForSignatureRequest(opts: {
  token: string;
  request: PartnerSignatureRequest;
}): Promise<Uint8Array | null> {
  return fetchSignatureTargetBytes({
    token: opts.token,
    roomId: opts.request.roomId,
    workspaceId: opts.request.workspaceId,
    targetKind: opts.request.targetKind,
    targetId: opts.request.targetId,
    frozenStoragePath: opts.request.frozenStoragePath,
  });
}
